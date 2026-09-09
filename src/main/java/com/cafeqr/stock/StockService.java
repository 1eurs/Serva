package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.stock.domain.MovementReason;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockKind;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMovement;
import com.cafeqr.stock.domain.WasteReason;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import com.cafeqr.stock.repository.StockLevelRepository;
import com.cafeqr.stock.repository.StockMovementRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The one place stock balances change.
 *
 * <p>Every mutation goes through {@link #post}: lock the (item, branch) level, append an
 * immutable {@link StockMovement}, then write the new balance in the same transaction. Nothing
 * outside this class may touch {@code stock_levels.quantity_base} — the ledger is what answers
 * "why does it say 400 g?", and it only stays trustworthy if there is no second write path.
 *
 * <p>Quantities are always base units (g / ml / piece). Purchase units are a presentation
 * concern converted at the API edge.
 */
@Service
public class StockService {

    /** Base-unit quantities. Three places is plenty for grams and millilitres. */
    static final int QTY_SCALE = 3;
    /** Costs carry more precision than money because they are per-gram, not per-cup. */
    static final int COST_SCALE = 6;

    private final StockItemRepository itemRepository;
    private final StockLevelRepository levelRepository;
    private final StockMovementRepository movementRepository;
    private final RecipeLineRepository recipeLineRepository;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public StockService(StockItemRepository itemRepository,
                        StockLevelRepository levelRepository,
                        StockMovementRepository movementRepository,
                        RecipeLineRepository recipeLineRepository,
                        BranchService branchService,
                        AccessGuard accessGuard) {
        this.itemRepository = itemRepository;
        this.levelRepository = levelRepository;
        this.movementRepository = movementRepository;
        this.recipeLineRepository = recipeLineRepository;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    // ============================================================ the ledger

    /**
     * Applies one signed change and records why. Returns the movement that was written.
     *
     * <p>The level row is locked first, so two orders drawing the same ingredient serialize
     * here rather than both reading the same balance and one of them losing its write.
     *
     * @param allowNegative consumption paths pass true: a café that forgot to log a delivery
     *                      must not have its orders rejected, so the balance is allowed to go
     *                      negative and shows up as an obvious "fix me" in the UI. Manual
     *                      edits pass false.
     */
    @Transactional
    public StockMovement post(Long stockItemId,
                              Long branchId,
                              BigDecimal deltaBase,
                              MovementReason reason,
                              Long orderId,
                              WasteReason wasteReason,
                              BigDecimal unitCost,
                              String note,
                              boolean allowNegative) {
        BigDecimal delta = deltaBase.setScale(QTY_SCALE, RoundingMode.HALF_UP);
        if (delta.signum() == 0) {
            return null;
        }
        StockLevel level = lockLevel(stockItemId, branchId);
        BigDecimal next = level.getQuantityBase().add(delta);
        if (!allowNegative && next.signum() < 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "That would take stock below zero. Log a delivery first, or correct the count.");
        }
        level.setQuantityBase(next);
        levelRepository.save(level);
        return writeMovement(stockItemId, branchId, delta, reason, orderId, wasteReason,
                unitCost, note, next);
    }

    /** One line in the ledger. Split out so a count that moved nothing can still write one. */
    private StockMovement writeMovement(Long stockItemId, Long branchId, BigDecimal delta,
                                        MovementReason reason, Long orderId, WasteReason wasteReason,
                                        BigDecimal unitCost, String note, BigDecimal balanceAfter) {
        StockMovement movement = new StockMovement();
        movement.setStockItemId(stockItemId);
        movement.setBranchId(branchId);
        movement.setDeltaBase(delta);
        movement.setReason(reason);
        movement.setBalanceAfter(balanceAfter);
        movement.setWasteReason(wasteReason);
        movement.setOrderId(orderId);
        movement.setUserId(SecurityUtils.currentUserIdOrNull());
        movement.setUnitCost(unitCost);
        movement.setNote(note);
        return movementRepository.save(movement);
    }

    /** Ensures the (item, branch) row exists, then takes a write lock on it. */
    private StockLevel lockLevel(Long stockItemId, Long branchId) {
        return levelRepository.lock(stockItemId, branchId).orElseGet(() -> {
            levelRepository.insertIfAbsent(stockItemId, branchId);
            return levelRepository.lock(stockItemId, branchId)
                    .orElseThrow(() -> new IllegalStateException(
                            "Stock level row vanished for item " + stockItemId + " at branch " + branchId));
        });
    }

    // ============================================================ deliveries

    /**
     * Records a delivery and re-averages the item's cost.
     *
     * <p>Rolling average rather than FIFO: a café buying the same beans every week does not
     * want lot-level accounting, and the average keeps plate cost stable when prices wobble.
     */
    @Transactional
    public void receive(Long branchId, Long stockItemId, BigDecimal quantityBase,
                        BigDecimal unitCost, String note) {
        StockItem item = getItem(stockItemId);
        requireBranch(item, branchId);
        if (quantityBase.signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Delivery quantity must be positive.");
        }
        BigDecimal effectiveCost = unitCost;
        if (effectiveCost != null && effectiveCost.signum() >= 0) {
            reaverageCost(item, quantityBase, effectiveCost);
        } else {
            effectiveCost = item.getCostPerBaseUnit();
        }
        post(stockItemId, branchId, quantityBase, MovementReason.RECEIVE, null, null, effectiveCost, note, false);
    }

    /**
     * Weighted average of what is already on hand and what just arrived. When on-hand is zero
     * or negative there is nothing meaningful to blend with, so the new price simply wins.
     *
     * <p>The blend weighs the delivery against on-hand at <em>every</em> branch, not just the
     * one taking it in, because {@code costPerBaseUnit} is a property of the item
     * and every branch reads it. Weighing against one branch's shelf made a delivery into a
     * quiet two-branch café rewrite plate cost for the whole restaurant at close to the new
     * price, however much stock the other branch was sitting on.
     */
    private void reaverageCost(StockItem item, BigDecimal incomingQty, BigDecimal incomingCost) {
        BigDecimal onHand = levelRepository.totalOnHand(item.getId());
        if (onHand == null) {
            onHand = BigDecimal.ZERO;
        }
        BigDecimal blended;
        if (onHand.signum() <= 0 || item.getCostPerBaseUnit().signum() <= 0) {
            blended = incomingCost;
        } else {
            BigDecimal existingValue = onHand.multiply(item.getCostPerBaseUnit());
            BigDecimal incomingValue = incomingQty.multiply(incomingCost);
            blended = existingValue.add(incomingValue)
                    .divide(onHand.add(incomingQty), COST_SCALE, RoundingMode.HALF_UP);
        }
        item.setCostPerBaseUnit(blended.setScale(COST_SCALE, RoundingMode.HALF_UP));
        itemRepository.save(item);
    }

    // ============================================================ write-offs & corrections

    @Transactional
    public void logWaste(Long branchId, Long stockItemId, BigDecimal quantityBase,
                         WasteReason reason, String note) {
        StockItem item = getItem(stockItemId);
        requireBranch(item, branchId);
        if (quantityBase.signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Waste quantity must be positive.");
        }
        post(stockItemId, branchId, quantityBase.negate(), MovementReason.WASTE, null,
                reason == null ? WasteReason.OTHER : reason, item.getCostPerBaseUnit(), note, true);
    }

    /**
     * Sets on-hand to an exact figure, recording the difference in the ledger.
     *
     * <p>{@code counted} decides what the ledger calls it. A shelf that was walked writes a
     * COUNT, which is also what {@link #lastCountAt} reads to answer "when did anybody last
     * look at this?"; anything else is a MANUAL correction. The arithmetic is identical —
     * only the name on the line differs, and the name is the whole point of a ledger.
     */
    @Transactional
    public void adjustTo(Long branchId, Long stockItemId, BigDecimal newQuantityBase, String note,
                         boolean counted) {
        StockItem item = getItem(stockItemId);
        requireBranch(item, branchId);
        BigDecimal current = levelRepository.findByStockItemIdAndBranchId(stockItemId, branchId)
                .map(StockLevel::getQuantityBase)
                .orElse(BigDecimal.ZERO);
        BigDecimal delta = newQuantityBase.subtract(current);
        if (delta.signum() == 0) {
            if (counted) {
                recordUnchangedCount(branchId, stockItemId, newQuantityBase, note);
            }
            return;
        }
        post(stockItemId, branchId, delta, counted ? MovementReason.COUNT : MovementReason.MANUAL,
                null, null, item.getCostPerBaseUnit(), note, true);
    }

    /**
     * Walking the shelf and finding exactly what the books said is still walking the shelf.
     *
     * <p>{@link #post} refuses a zero delta, which is right for the arithmetic and wrong for
     * the evidence — {@link #lastCountAt} is what lets the stock page date its own figures
     * rather than state them as timeless fact, and it reads counts out of the ledger.
     *
     * <p>The sharp case is the first count of all. An empty shelf counted as empty is
     * zero-minus-zero, so nothing was written at all — not the movement and not the level row
     * — and the good stayed <em>never counted</em>, which is exactly what keeps a menu item on
     * sale ({@code StockConsumptionService.neverCounted}). An owner would count zero
     * croissants, watch the croissant stay on the menu, and hear about it from the customer
     * who was refused at checkout. Never counted and counted-to-zero are different facts, and
     * this is where the second one gets written down.
     */
    @Transactional
    public void recordUnchangedCount(Long branchId, Long stockItemId,
                                     BigDecimal quantityBase, String note) {
        // The row's existence is itself the record that somebody has looked at this shelf.
        lockLevel(stockItemId, branchId);
        writeMovement(stockItemId, branchId, BigDecimal.ZERO.setScale(QTY_SCALE),
                MovementReason.COUNT, null, null, null, note, quantityBase);
    }

    /** When anybody last counted anything at this branch, or null if nobody ever has. */
    @Transactional(readOnly = true)
    public java.time.Instant lastCountAt(Long branchId) {
        return movementRepository.lastCountAt(branchId);
    }

    /** Moves stock between two branches of the same restaurant as a matched out/in pair. */
    @Transactional
    public void transfer(Long fromBranchId, Long toBranchId, Long stockItemId,
                         BigDecimal quantityBase, String note) {
        if (fromBranchId.equals(toBranchId)) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Pick a different branch to transfer to.");
        }
        StockItem item = getItem(stockItemId);
        requireBranch(item, fromBranchId);
        requireBranch(item, toBranchId);
        if (quantityBase.signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Transfer quantity must be positive.");
        }
        post(stockItemId, fromBranchId, quantityBase.negate(), MovementReason.TRANSFER_OUT, null, null,
                item.getCostPerBaseUnit(), note, false);
        post(stockItemId, toBranchId, quantityBase, MovementReason.TRANSFER_IN, null, null,
                item.getCostPerBaseUnit(), note, false);
    }

    // ============================================================ in-house production

    /**
     * Produces {@code batches} runs of a PREP item: draws its recipe and adds the yield.
     *
     * <p>This is what makes an in-house sweets menu work — baking a tray of 24 cookies really
     * does consume flour, sugar and butter, and one "I baked a tray" tap should say so.
     */
    @Transactional
    public void produceBatch(Long branchId, Long prepItemId, BigDecimal batches, String note) {
        StockItem prep = getItem(prepItemId);
        requireBranch(prep, branchId);
        if (prep.getKind() != StockKind.PREP) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "\"" + prep.getNameEn() + "\" is not an in-house prep item.");
        }
        if (prep.getBatchYieldBase() == null || prep.getBatchYieldBase().signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Set how much one batch of \"" + prep.getNameEn() + "\" makes first.");
        }
        if (batches.signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Batch count must be positive.");
        }

        BigDecimal inputCost = BigDecimal.ZERO;
        for (var line : recipeLineRepository.findByPrepItemId(prepItemId)) {
            StockItem input = getItem(line.getStockItemId());
            BigDecimal drawn = input.withWaste(line.getQuantityBase().multiply(batches));
            inputCost = inputCost.add(input.costOf(drawn));
            post(input.getId(), branchId, drawn.negate(), MovementReason.PREP_CONSUME, null, null,
                    input.getCostPerBaseUnit(), note, true);
        }

        BigDecimal produced = prep.getBatchYieldBase().multiply(batches);
        // A prep item's cost is whatever its inputs cost, per unit of yield — so a cookie's
        // plate cost tracks the flour price without anyone re-typing it.
        if (produced.signum() > 0 && inputCost.signum() > 0) {
            prep.setCostPerBaseUnit(inputCost.divide(produced, COST_SCALE, RoundingMode.HALF_UP));
            itemRepository.save(prep);
        }
        post(prepItemId, branchId, produced, MovementReason.PREP_PRODUCE, null, null,
                prep.getCostPerBaseUnit(), note, false);
    }

    // ============================================================ reads

    @Transactional(readOnly = true)
    public List<StockItem> listItems(boolean includeArchived) {
        Long restaurantId = requireCafeScope();
        return includeArchived
                ? itemRepository.findByRestaurantIdOrderByNameEnAsc(restaurantId)
                : itemRepository.findByRestaurantIdAndArchivedFalseOrderByNameEnAsc(restaurantId);
    }

    @Transactional(readOnly = true)
    public Map<Long, StockLevel> levelsByItem(Long branchId) {
        Map<Long, StockLevel> byItem = new LinkedHashMap<>();
        for (StockLevel level : levelRepository.findByBranchId(branchId)) {
            byItem.put(level.getStockItemId(), level);
        }
        return byItem;
    }

    @Transactional(readOnly = true)
    public StockItem getItem(Long stockItemId) {
        StockItem item = itemRepository.findById(stockItemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Stock item", stockItemId));
        accessGuard.requireRestaurantAccess(item.getRestaurantId());
        return item;
    }

    /** Loads several items at once, keyed by id — used by every path that walks a recipe. */
    @Transactional(readOnly = true)
    public Map<Long, StockItem> itemsById(List<Long> ids) {
        Map<Long, StockItem> byId = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return byId;
        }
        for (StockItem item : itemRepository.findAllById(ids)) {
            byId.put(item.getId(), item);
        }
        return byId;
    }

    /** A page of the ledger for one branch, optionally narrowed to a single item. */
    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<StockMovement> movements(
            Long branchId, Long stockItemId, org.springframework.data.domain.Pageable pageable) {
        return stockItemId == null
                ? movementRepository.findByBranchIdOrderByCreatedAtDesc(branchId, pageable)
                : movementRepository.findByBranchIdAndStockItemIdOrderByCreatedAtDesc(
                        branchId, stockItemId, pageable);
    }

    // ============================================================ catalogue

    @Transactional
    public StockItem saveItem(StockItem item) {
        return itemRepository.save(item);
    }

    /**
     * Sets the alert threshold and restock target for one item at one branch. Creating the
     * level row here means an item shows up on the branch's list before its first delivery.
     */
    @Transactional
    public void setLevels(Long branchId, Long stockItemId, BigDecimal parLevel, BigDecimal reorderPoint) {
        StockItem item = getItem(stockItemId);
        requireBranch(item, branchId);
        StockLevel level = lockLevel(stockItemId, branchId);
        level.setParLevelBase(parLevel);
        level.setReorderPointBase(reorderPoint);
        levelRepository.save(level);
    }

    /**
     * Archives rather than deletes: recipes and the ledger both point at this row, and a café
     * that stops carrying oat milk still wants last quarter's numbers to make sense.
     */
    @Transactional
    public void archiveItem(Long stockItemId) {
        StockItem item = getItem(stockItemId);
        item.setArchived(true);
        itemRepository.save(item);
    }

    // ============================================================ helpers

    /** The current user's restaurant, rejecting platform-admin callers that have no café scope. */
    public Long requireCafeScope() {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) {
            throw new BadRequestException("Stock is managed per café — sign in as a café account.");
        }
        return restaurantId;
    }

    /** Resolves the branch a stock action targets, honouring a branch-scoped user's own branch. */
    @Transactional(readOnly = true)
    public Long resolveBranch(Long requestedBranchId) {
        Long restaurantId = requireCafeScope();
        Long scoped = accessGuard.scopedBranchId();
        Long branchId = scoped != null ? scoped : requestedBranchId;
        if (branchId == null) {
            /* "Pick a branch" is only a sensible thing to say when there is a choice. Most
               cafés on Serva have exactly one, and every caller that legitimately does not
               care which branch it is — the recipe editor wants names, units and costs, none
               of which are branch-scoped — was being turned away by a question with one
               possible answer. With two or more branches the ask still stands. */
            List<BranchResponse> branches = branchService.listByRestaurant(restaurantId);
            if (branches.size() == 1) {
                branchId = branches.get(0).id();
            }
        }
        if (branchId == null) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Pick a branch.");
        }
        branchService.getEntityInRestaurant(restaurantId, branchId);
        accessGuard.requireBranchAccess(restaurantId, branchId);
        return branchId;
    }

    private void requireBranch(StockItem item, Long branchId) {
        branchService.getEntityInRestaurant(item.getRestaurantId(), branchId);
        accessGuard.requireBranchAccess(item.getRestaurantId(), branchId);
    }

    /** Convenience for callers that need the ids of every non-archived item. */
    @Transactional(readOnly = true)
    public List<Long> activeItemIds() {
        List<Long> ids = new ArrayList<>();
        for (StockItem item : listItems(false)) {
            ids.add(item.getId());
        }
        return ids;
    }
}
