package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.stock.domain.MovementReason;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.Stocktake;
import com.cafeqr.stock.domain.StocktakeLine;
import com.cafeqr.stock.domain.StocktakeScope;
import com.cafeqr.stock.domain.StocktakeStatus;
import com.cafeqr.stock.repository.StockLevelRepository;
import com.cafeqr.stock.repository.StockMovementRepository;
import com.cafeqr.stock.repository.StocktakeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Physical counts and the variance they reveal.
 *
 * <p>Variance — what the system thought was there minus what actually was — is the most valuable
 * number in café inventory, because it is where over-pouring, spoilage and theft show up. It is
 * also the easiest number to destroy: if staff can see the expected quantity while counting,
 * counts drift toward it and the variance goes quietly to zero. Hence {@link Stocktake#isBlind()},
 * which is on by default and hides the expectation until the count is closed.
 *
 * <p>Cycle counts exist for the same reason from the other direction: a monthly count of
 * everything gets skipped, while a short daily rotation of the high-value items gets done.
 */
@Service
public class StocktakeService {

    private final StocktakeRepository stocktakeRepository;
    private final StockLevelRepository levelRepository;
    private final StockMovementRepository movementRepository;
    private final StockService stockService;
    private final StockConsumptionService consumptionService;
    private final AccessGuard accessGuard;

    public StocktakeService(StocktakeRepository stocktakeRepository,
                            StockLevelRepository levelRepository,
                            StockMovementRepository movementRepository,
                            StockService stockService,
                            StockConsumptionService consumptionService,
                            AccessGuard accessGuard) {
        this.stocktakeRepository = stocktakeRepository;
        this.levelRepository = levelRepository;
        this.movementRepository = movementRepository;
        this.stockService = stockService;
        this.consumptionService = consumptionService;
        this.accessGuard = accessGuard;
    }

    /**
     * Opens a count, snapshotting what the system currently believes for each line in scope.
     *
     * <p>One open count per branch: a second one would snapshot expectations mid-count and the
     * two would post contradictory corrections, so the caller resumes the existing one instead.
     */
    @Transactional
    public Stocktake open(Long branchId, StocktakeScope scope, boolean blind, String notes) {
        Long restaurantId = stockService.requireCafeScope();
        stocktakeRepository.findFirstByBranchIdAndStatus(branchId, StocktakeStatus.OPEN)
                .ifPresent(existing -> {
                    throw new BadRequestException(ErrorCode.CONFLICT,
                            "A count is already open at this branch — finish or cancel it first.");
                });

        Stocktake take = new Stocktake();
        take.setRestaurantId(restaurantId);
        take.setBranchId(branchId);
        take.setScope(scope);
        take.setBlind(blind);
        take.setNotes(notes);
        take.setStartedBy(SecurityUtils.currentUserIdOrNull());

        Map<Long, StockLevel> levels = stockService.levelsByItem(branchId);
        for (StockItem item : itemsInScope(branchId, scope)) {
            StockLevel level = levels.get(item.getId());
            StocktakeLine line = new StocktakeLine();
            line.setStockItemId(item.getId());
            line.setExpectedBase(level == null ? BigDecimal.ZERO : level.getQuantityBase());
            line.setUnitCost(item.getCostPerBaseUnit());
            take.addLine(line);
        }
        if (take.getLines().isEmpty()) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    scope == StocktakeScope.CYCLE
                            ? "Nothing is due for a count right now."
                            : "Add some stock items before running a count.");
        }
        return stocktakeRepository.save(take);
    }

    /**
     * Items this count covers. A FULL count takes everything; a CYCLE count takes only what is
     * due per the item's {@code countFrequency} and when it was last counted here.
     */
    private List<StockItem> itemsInScope(Long branchId, StocktakeScope scope) {
        List<StockItem> all = stockService.listItems(false);
        if (scope == StocktakeScope.FULL) {
            return all;
        }
        Map<Long, Instant> lastCounted = new LinkedHashMap<>();
        for (Object[] row : movementRepository.lastCountedAt(branchId)) {
            lastCounted.put((Long) row[0], (Instant) row[1]);
        }
        Instant now = Instant.now();
        List<StockItem> due = new ArrayList<>();
        for (StockItem item : all) {
            if (item.getCountFrequency() == null) {
                continue; // never worth counting — napkins, straws
            }
            Instant last = lastCounted.get(item.getId());
            if (last == null || ChronoUnit.DAYS.between(last, now) >= item.getCountFrequency().days()) {
                due.add(item);
            }
        }
        return due;
    }

    /** Records what a human actually found for one line. */
    @Transactional
    public Stocktake countLine(Long stocktakeId, Long stockItemId, BigDecimal countedBase) {
        Stocktake take = getOpen(stocktakeId);
        if (countedBase != null && countedBase.signum() < 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "A count can't be negative.");
        }
        StocktakeLine line = take.getLines().stream()
                .filter(l -> l.getStockItemId().equals(stockItemId))
                .findFirst()
                .orElseThrow(() -> new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "That item isn't part of this count."));
        line.setCountedBase(countedBase);
        return stocktakeRepository.save(take);
    }

    /**
     * Closes the count and posts a COUNT movement for every line whose reality differed.
     *
     * <p>Uncounted lines are left alone rather than treated as zero — a half-finished count
     * must not wipe the shelves it never reached.
     */
    @Transactional
    public Stocktake close(Long stocktakeId) {
        Stocktake take = getOpen(stocktakeId);
        Set<Long> touched = new LinkedHashSet<>();
        for (StocktakeLine line : take.getLines()) {
            if (!line.isCounted()) {
                continue;
            }
            BigDecimal variance = line.variance();
            if (variance.signum() == 0) {
                continue;
            }
            stockService.post(line.getStockItemId(), take.getBranchId(), variance,
                    MovementReason.COUNT, null, null, line.getUnitCost(),
                    "Stocktake #" + take.getId(), true);
            touched.add(line.getStockItemId());
        }
        take.setStatus(StocktakeStatus.CLOSED);
        take.setClosedAt(Instant.now());
        Stocktake saved = stocktakeRepository.save(take);
        // A count that found stock nobody had logged should put those items back on the menu.
        consumptionService.refreshAvailability(take.getRestaurantId(), take.getBranchId(), touched);
        return saved;
    }

    @Transactional
    public Stocktake cancel(Long stocktakeId) {
        Stocktake take = getOpen(stocktakeId);
        take.setStatus(StocktakeStatus.CANCELLED);
        take.setClosedAt(Instant.now());
        return stocktakeRepository.save(take);
    }

    @Transactional(readOnly = true)
    public Stocktake get(Long stocktakeId) {
        Stocktake take = stocktakeRepository.findById(stocktakeId)
                .orElseThrow(() -> ResourceNotFoundException.of("Stocktake", stocktakeId));
        accessGuard.requireBranchAccess(take.getRestaurantId(), take.getBranchId());
        return take;
    }

    @Transactional(readOnly = true)
    public Stocktake openAtBranch(Long branchId) {
        return stocktakeRepository.findFirstByBranchIdAndStatus(branchId, StocktakeStatus.OPEN)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public List<Stocktake> history(Long branchId) {
        return stocktakeRepository.findTop50ByBranchIdOrderByCreatedAtDesc(branchId);
    }

    /**
     * True when the expected quantity must stay hidden from the client: a blind count that is
     * still open. Once closed, the variance is the whole point, so everything is revealed.
     */
    public boolean hidesExpected(Stocktake take) {
        return take.isBlind() && take.getStatus() == StocktakeStatus.OPEN;
    }

    private Stocktake getOpen(Long stocktakeId) {
        Stocktake take = get(stocktakeId);
        if (take.getStatus() != StocktakeStatus.OPEN) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "This count is already finished.");
        }
        return take;
    }

    /** Convenience for the UI: how many lines are still uncounted. */
    public long remainingLines(Stocktake take) {
        return take.getLines().stream().filter(l -> !l.isCounted()).count();
    }

    /** Total money value of the variance found; negative means stock went missing. */
    public BigDecimal varianceValue(Stocktake take) {
        return take.getLines().stream()
                .map(StocktakeLine::varianceValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Levels helper shared with the report endpoint. */
    @Transactional(readOnly = true)
    public Map<Long, StockLevel> levels(Long branchId) {
        Map<Long, StockLevel> byItem = new LinkedHashMap<>();
        for (StockLevel level : levelRepository.findByBranchId(branchId)) {
            byItem.put(level.getStockItemId(), level);
        }
        return byItem;
    }
}
