package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.util.Names;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.dto.StockDtos.CountRequest;
import com.cafeqr.stock.dto.StockDtos.CreateStockItemRequest;
import com.cafeqr.stock.dto.StockDtos.ReceiveRequest;
import com.cafeqr.stock.dto.StockDtos.StockItemResponse;
import com.cafeqr.stock.dto.StockDtos.UpdateStockItemRequest;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

/**
 * The shelf.
 *
 * <p>Three things can happen to an item and each says which one it was: something arrived
 * ({@link #receive}), somebody looked and the figure was wrong ({@link #count}), or the thing
 * itself changed — its name, its unit, its order line ({@link #update}). Keeping them apart is
 * the whole discipline here. A single "save the quantity" endpoint would make a delivery and a
 * correction indistinguishable, and two taps that land on the same number for opposite reasons
 * is how a stock figure stops meaning anything.
 *
 * <p>There is no ledger behind this. The quantity column is the truth, nothing but a person
 * moves it, and selling a coffee does not. That is a real limitation and it is the deal: the
 * shelf never tells the owner something they did not tell it, so it never quietly drifts.
 */
@Service
public class StockService {

    /** OMR and every quantity are held to three decimals; scale the input, don't trust it. */
    private static final int SCALE = 3;

    private final StockItemRepository stockItemRepository;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public StockService(StockItemRepository stockItemRepository,
                        BranchService branchService,
                        AccessGuard accessGuard) {
        this.stockItemRepository = stockItemRepository;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    @Transactional(readOnly = true)
    public List<StockItemResponse> list(Long branchId) {
        requireBranch(branchId);
        return stockItemRepository.findByBranchIdOrderByIdAsc(branchId)
                .stream().map(StockItemResponse::from).toList();
    }

    @Transactional
    public StockItemResponse create(Long branchId, CreateStockItemRequest request) {
        Branch branch = requireBranch(branchId);

        StockItem item = new StockItem();
        item.setRestaurantId(branch.getRestaurantId());
        item.setBranchId(branchId);
        Names.applyOnCreate(item, request.name(), request.nameEn(), request.nameAr());
        refuseDuplicate(branchId, item, null);
        item.setUnit(request.unit());
        item.setQuantity(scaled(request.quantity(), BigDecimal.ZERO));
        item.setReorderPoint(scaled(request.reorderPoint(), null));
        item.setUnitPrice(scaled(request.unitPrice(), null));
        applyPack(item, request.packSize(), request.packUnit());
        // An opening figure is somebody saying what is there, which is the same act as a count.
        // Setting up an empty item is not, so it starts with no date rather than a false one.
        if (item.getQuantity().signum() > 0) {
            item.setLastMovedAt(Instant.now());
        }
        return StockItemResponse.from(stockItemRepository.save(item));
    }

    /**
     * Edit the thing, never the number on it.
     *
     * <p>Changing the unit does not convert the quantity, because nothing in this model
     * converts: 6 KG switched to G stays the figure 6, now meaning six grams. The dashboard
     * says so before it sends — an owner who picked the wrong unit on Tuesday wants the
     * figure they have been reading all week left alone, and an owner who meant grams will
     * recount anyway.
     */
    @Transactional
    public StockItemResponse update(Long itemId, UpdateStockItemRequest request) {
        StockItem item = owned(itemId);
        Names.applyOnUpdate(item, request.name(), request.nameEn(), request.nameAr());
        refuseDuplicate(item.getBranchId(), item, item.getId());
        item.setUnit(request.unit());
        // Replaced rather than patched: the form shows both, so an empty field is the only way
        // to say "no order line on this any more", and a null that meant "leave it" would make
        // clearing one impossible.
        item.setReorderPoint(scaled(request.reorderPoint(), null));
        item.setUnitPrice(scaled(request.unitPrice(), null));
        applyPack(item, request.packSize(), request.packUnit());
        return StockItemResponse.from(item);
    }

    /** Something arrived: add it on. The price rides along when the invoice is to hand. */
    @Transactional
    public StockItemResponse receive(Long itemId, ReceiveRequest request) {
        StockItem item = owned(itemId);
        item.setQuantity(item.getQuantity().add(scaled(request.amount(), BigDecimal.ZERO))
                .setScale(SCALE, RoundingMode.HALF_UP));
        BigDecimal price = scaled(request.unitPrice(), null);
        if (price != null) {
            item.setUnitPrice(price);
        }
        item.setLastMovedAt(Instant.now());
        return StockItemResponse.from(item);
    }

    /** Somebody looked: this is what is actually there. Replaces the figure outright. */
    @Transactional
    public StockItemResponse count(Long itemId, CountRequest request) {
        StockItem item = owned(itemId);
        item.setQuantity(scaled(request.quantity(), BigDecimal.ZERO));
        item.setLastMovedAt(Instant.now());
        return StockItemResponse.from(item);
    }

    @Transactional
    public void delete(Long itemId) {
        stockItemRepository.delete(owned(itemId));
    }

    // ---- helpers ----

    private Branch requireBranch(Long branchId) {
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        return branch;
    }

    /** The item, once the caller has been shown to have business with the shop holding it. */
    private StockItem owned(Long itemId) {
        StockItem item = stockItemRepository.findById(itemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Stock item", itemId));
        accessGuard.requireBranchAccess(item.getRestaurantId(), item.getBranchId());
        return item;
    }

    /**
     * Two rows of milk in one fridge is the failure this feature has: both are half right,
     * both get topped up by whoever opened the page, and neither figure is the shelf. Caught
     * on the way in, where it is still one word to fix.
     *
     * <p>Matched on either script, ignoring case — "milk" and "Milk" are the same tin.
     */
    private void refuseDuplicate(Long branchId, StockItem candidate, Long ignoreId) {
        boolean clash = stockItemRepository.findByBranchIdOrderByIdAsc(branchId).stream()
                .filter(other -> ignoreId == null || !ignoreId.equals(other.getId()))
                .anyMatch(other -> matches(other.getNameEn(), candidate.getNameEn())
                        || matches(other.getNameAr(), candidate.getNameAr()));
        if (clash) {
            throw new ConflictException("This branch already has an item with that name");
        }
    }

    private static boolean matches(String a, String b) {
        return a != null && b != null && a.trim().equalsIgnoreCase(b.trim());
    }

    /**
     * What one piece holds. Only a shelf counted in pieces can say, and only in a weight or a
     * volume — "a sleeve of 50 cups" would make a recipe line reading "1" ambiguous between the
     * cup and the sleeve. Half an answer (a size without a unit, or the reverse) is refused
     * rather than guessed. A shelf that stops being counted in pieces loses its contents: they
     * described a piece, and there is no longer one.
     */
    private static void applyPack(StockItem item, BigDecimal size, StockUnit unit) {
        if (size == null && unit == null) {
            item.setPackSize(null);
            item.setPackUnit(null);
            return;
        }
        if (size == null || unit == null) {
            throw new BadRequestException("Say both how much a piece holds and in what unit");
        }
        if (item.getUnit() != StockUnit.PIECE) {
            throw new BadRequestException("Only something counted in pieces can say what a piece holds");
        }
        if (unit == StockUnit.PIECE) {
            throw new BadRequestException("A piece's contents are a weight or a volume, not more pieces");
        }
        item.setPackSize(size.setScale(SCALE, RoundingMode.HALF_UP));
        item.setPackUnit(unit);
    }

    private static BigDecimal scaled(BigDecimal value, BigDecimal fallback) {
        return value == null ? fallback : value.setScale(SCALE, RoundingMode.HALF_UP);
    }
}
