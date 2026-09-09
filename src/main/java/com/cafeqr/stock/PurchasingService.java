package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.stock.domain.PurchaseOrder;
import com.cafeqr.stock.domain.PurchaseOrderLine;
import com.cafeqr.stock.domain.PurchaseOrderStatus;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.Supplier;
import com.cafeqr.stock.repository.PurchaseOrderRepository;
import com.cafeqr.stock.repository.SupplierRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Suppliers, reorder suggestions and purchase orders.
 *
 * <p>The suggestion engine is deliberately the plain trade rule — <em>order up to par</em>: when
 * on-hand has fallen to the reorder point, buy enough to reach the par level. Nothing clever,
 * but it is the rule café owners already have in their heads, which is what makes the output
 * trustworthy enough to act on.
 *
 * <p>Receiving against a purchase order posts through {@link StockService#receive}, so a
 * delivery updates the ledger and re-averages cost in one action rather than needing a second
 * data-entry pass.
 */
@Service
public class PurchasingService {

    private final SupplierRepository supplierRepository;
    private final PurchaseOrderRepository purchaseOrderRepository;
    private final StockService stockService;
    private final AccessGuard accessGuard;

    public PurchasingService(SupplierRepository supplierRepository,
                             PurchaseOrderRepository purchaseOrderRepository,
                             StockService stockService,
                             AccessGuard accessGuard) {
        this.supplierRepository = supplierRepository;
        this.purchaseOrderRepository = purchaseOrderRepository;
        this.stockService = stockService;
        this.accessGuard = accessGuard;
    }

    /** One line of "you should buy this": how short it is and how much to order. */
    public record Suggestion(StockItem item, BigDecimal onHand, BigDecimal reorderPoint,
                             BigDecimal parLevel, BigDecimal suggestedBase, Long supplierId) {}

    // ============================================================ suppliers

    @Transactional(readOnly = true)
    public List<Supplier> listSuppliers(boolean activeOnly) {
        Long restaurantId = stockService.requireCafeScope();
        return activeOnly
                ? supplierRepository.findByRestaurantIdAndActiveTrueOrderByNameAsc(restaurantId)
                : supplierRepository.findByRestaurantIdOrderByNameAsc(restaurantId);
    }

    @Transactional
    public Supplier saveSupplier(Long supplierId, String name, String phone, String email,
                                 String notes, boolean active) {
        Long restaurantId = stockService.requireCafeScope();
        Supplier supplier;
        if (supplierId == null) {
            supplier = new Supplier();
            supplier.setRestaurantId(restaurantId);
        } else {
            supplier = supplierRepository.findById(supplierId)
                    .orElseThrow(() -> ResourceNotFoundException.of("Supplier", supplierId));
            accessGuard.requireRestaurantAccess(supplier.getRestaurantId());
        }
        supplier.setName(name);
        supplier.setPhone(phone);
        supplier.setEmail(email);
        supplier.setNotes(notes);
        supplier.setActive(active);
        return supplierRepository.save(supplier);
    }

    // ============================================================ suggestions

    /**
     * Everything at or below its reorder point, with the quantity that would restore par —
     * less whatever is already on its way.
     *
     * <p>Items with no reorder point set are skipped rather than guessed at — a suggestion the
     * owner did not configure is noise, and noise is what makes people stop reading the list.
     *
     * <p>So is a suggestion to buy what you bought an hour ago. The list is the message an
     * owner sends their supplier, and with nothing subtracted it kept asking for beans that
     * were already on the van — every evening until the delivery landed. What is outstanding
     * on an open order counts as stock that is coming, so an order that covers the shortfall
     * removes the line and one that half covers it asks for the half that is missing.
     */
    @Transactional(readOnly = true)
    public List<Suggestion> suggestions(Long branchId) {
        Map<Long, StockLevel> levels = stockService.levelsByItem(branchId);
        Map<Long, BigDecimal> onOrder = outstandingByItem(branchId);
        List<Suggestion> out = new ArrayList<>();
        for (StockItem item : stockService.listItems(false)) {
            StockLevel level = levels.get(item.getId());
            if (level == null || level.getReorderPointBase() == null) {
                continue;
            }
            BigDecimal onHand = level.getQuantityBase();
            if (onHand.compareTo(level.getReorderPointBase()) > 0) {
                continue;
            }
            BigDecimal target = level.getParLevelBase() != null
                    ? level.getParLevelBase()
                    : level.getReorderPointBase();
            BigDecimal needed = target.subtract(onHand)
                    .subtract(onOrder.getOrDefault(item.getId(), BigDecimal.ZERO));
            if (needed.signum() <= 0) {
                continue;
            }
            out.add(new Suggestion(item, onHand, level.getReorderPointBase(),
                    level.getParLevelBase(), needed, item.getSupplierId()));
        }
        return out;
    }

    /** How much of each item is outstanding on the branch's open orders. */
    @Transactional(readOnly = true)
    public Map<Long, BigDecimal> outstandingByItem(Long branchId) {
        Map<Long, BigDecimal> out = new LinkedHashMap<>();
        for (PurchaseOrder po : listOrders(branchId, true)) {
            for (PurchaseOrderLine line : po.getLines()) {
                BigDecimal left = line.outstandingBase();
                if (left != null && left.signum() > 0) {
                    out.merge(line.getStockItemId(), left, BigDecimal::add);
                }
            }
        }
        return out;
    }

    /**
     * Closes out what a delivery just covered.
     *
     * <p>An order the café sent has to stop being an order once the goods arrive, or the
     * shelf ends up permanently claiming beans are on the way. Asking for a second, separate
     * "mark it arrived" tap is the kind of bookkeeping this whole feature exists to avoid —
     * the owner already told us the delivery landed by logging it. So a RECEIVE for an item
     * pays down that item's outstanding lines, oldest order first, and an order whose lines
     * are all covered closes itself.
     *
     * <p>Deliberately not exact matching: cafés do not reconcile line by line, and a delivery
     * of beans against the only open order for beans is the intent every time.
     */
    @Transactional
    public void settleFromDelivery(Long branchId, Map<Long, BigDecimal> receivedByItem) {
        if (receivedByItem.isEmpty()) {
            return;
        }
        Map<Long, BigDecimal> left = new LinkedHashMap<>(receivedByItem);
        List<PurchaseOrder> open = listOrders(branchId, true);
        /* Oldest first: the order that has been waiting longest is the one this delivery is. */
        for (int i = open.size() - 1; i >= 0; i--) {
            PurchaseOrder po = open.get(i);
            boolean touched = false;
            for (PurchaseOrderLine line : po.getLines()) {
                BigDecimal spare = left.getOrDefault(line.getStockItemId(), BigDecimal.ZERO);
                BigDecimal owing = line.outstandingBase();
                if (spare.signum() <= 0 || owing == null || owing.signum() <= 0) {
                    continue;
                }
                BigDecimal applied = spare.min(owing);
                line.setQuantityReceivedBase(line.getQuantityReceivedBase().add(applied));
                left.put(line.getStockItemId(), spare.subtract(applied));
                touched = true;
            }
            if (touched) {
                boolean settled = po.getLines().stream()
                        .allMatch(l -> l.outstandingBase() == null || l.outstandingBase().signum() <= 0);
                po.setStatus(settled ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIAL);
                purchaseOrderRepository.save(po);
            }
        }
    }

    // ============================================================ purchase orders

    @Transactional(readOnly = true)
    public List<PurchaseOrder> listOrders(Long branchId, boolean openOnly) {
        return openOnly
                ? purchaseOrderRepository.findByBranchIdAndStatusInOrderByCreatedAtDesc(branchId,
                        List.of(PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIAL))
                : purchaseOrderRepository.findTop100ByBranchIdOrderByCreatedAtDesc(branchId);
    }

    @Transactional(readOnly = true)
    public PurchaseOrder get(Long purchaseOrderId) {
        PurchaseOrder po = purchaseOrderRepository.findById(purchaseOrderId)
                .orElseThrow(() -> ResourceNotFoundException.of("Purchase order", purchaseOrderId));
        accessGuard.requireBranchAccess(po.getRestaurantId(), po.getBranchId());
        return po;
    }

    /** One item on a new order: how much to buy and what it is expected to cost per base unit. */
    public record OrderLine(Long stockItemId, BigDecimal quantityBase, BigDecimal unitCost) {}

    @Transactional
    public PurchaseOrder create(Long branchId, Long supplierId, LocalDate expectedAt,
                                String reference, String notes, List<OrderLine> lines) {
        Long restaurantId = stockService.requireCafeScope();
        if (lines == null || lines.isEmpty()) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Add at least one item to order.");
        }
        PurchaseOrder po = new PurchaseOrder();
        po.setRestaurantId(restaurantId);
        po.setBranchId(branchId);
        po.setSupplierId(supplierId);
        po.setExpectedAt(expectedAt);
        po.setReference(reference);
        po.setNotes(notes);
        po.setCreatedBy(SecurityUtils.currentUserIdOrNull());
        for (OrderLine line : lines) {
            StockItem item = stockService.getItem(line.stockItemId());
            if (line.quantityBase() == null || line.quantityBase().signum() <= 0) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Quantity for " + item.getNameEn() + " must be positive.");
            }
            PurchaseOrderLine poLine = new PurchaseOrderLine();
            poLine.setStockItemId(line.stockItemId());
            poLine.setQuantityBase(line.quantityBase());
            poLine.setUnitCost(line.unitCost() != null ? line.unitCost() : item.getCostPerBaseUnit());
            po.addLine(poLine);
        }
        return purchaseOrderRepository.save(po);
    }

    /** Builds a draft order straight from the reorder suggestions for one supplier. */
    /**
     * The order as the café actually places it: built from the shortfall and immediately
     * SENT, because the act that creates it is the owner copying the list into WhatsApp.
     * A DRAFT would be a state this product has no screen for and nobody would ever leave.
     */
    @Transactional
    public PurchaseOrder sendFromSuggestions(Long branchId, Long supplierId) {
        PurchaseOrder po = createFromSuggestions(branchId, supplierId);
        po.setStatus(PurchaseOrderStatus.SENT);
        return purchaseOrderRepository.save(po);
    }

    @Transactional
    public PurchaseOrder createFromSuggestions(Long branchId, Long supplierId) {
        List<OrderLine> lines = suggestions(branchId).stream()
                .filter(s -> supplierId == null || supplierId.equals(s.supplierId()))
                .map(s -> new OrderLine(s.item().getId(), s.suggestedBase(), s.item().getCostPerBaseUnit()))
                .toList();
        if (lines.isEmpty()) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Nothing is below its reorder point for that supplier.");
        }
        return create(branchId, supplierId, null, null, "Generated from reorder suggestions", lines);
    }

    @Transactional
    public PurchaseOrder setStatus(Long purchaseOrderId, PurchaseOrderStatus status) {
        PurchaseOrder po = get(purchaseOrderId);
        if (po.getStatus() == PurchaseOrderStatus.RECEIVED && status != PurchaseOrderStatus.RECEIVED) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "This order has already been received.");
        }
        po.setStatus(status);
        return purchaseOrderRepository.save(po);
    }

    /**
     * Books part (or all) of a line as delivered: posts the RECEIVE movement, re-averages the
     * item's cost, and rolls the order's status forward.
     */
    @Transactional
    public PurchaseOrder receiveLine(Long purchaseOrderId, Long lineId,
                                     BigDecimal quantityBase, BigDecimal unitCost) {
        PurchaseOrder po = get(purchaseOrderId);
        if (po.getStatus() == PurchaseOrderStatus.CANCELLED) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "This order was cancelled.");
        }
        PurchaseOrderLine line = po.getLines().stream()
                .filter(l -> l.getId().equals(lineId))
                .findFirst()
                .orElseThrow(() -> new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "That line isn't on this order."));
        if (quantityBase == null || quantityBase.signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Received quantity must be positive.");
        }

        BigDecimal cost = unitCost != null ? unitCost : line.getUnitCost();
        stockService.receive(po.getBranchId(), line.getStockItemId(), quantityBase, cost,
                "PO #" + po.getId());
        line.setQuantityReceivedBase(line.getQuantityReceivedBase().add(quantityBase));
        if (unitCost != null) {
            line.setUnitCost(unitCost);
        }
        po.refreshStatusFromLines();
        return purchaseOrderRepository.save(po);
    }

    /** Receives every outstanding line at once — the "the whole delivery arrived" button. */
    @Transactional
    public PurchaseOrder receiveAll(Long purchaseOrderId) {
        PurchaseOrder po = get(purchaseOrderId);
        List<Long> lineIds = po.getLines().stream()
                .filter(l -> l.outstandingBase().signum() > 0)
                .map(PurchaseOrderLine::getId)
                .toList();
        if (lineIds.isEmpty()) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "Nothing is outstanding on this order.");
        }
        PurchaseOrder current = po;
        for (Long lineId : lineIds) {
            BigDecimal outstanding = current.getLines().stream()
                    .filter(l -> l.getId().equals(lineId))
                    .findFirst()
                    .map(PurchaseOrderLine::outstandingBase)
                    .orElse(BigDecimal.ZERO);
            if (outstanding.signum() > 0) {
                current = receiveLine(purchaseOrderId, lineId, outstanding, null);
            }
        }
        return current;
    }
}
