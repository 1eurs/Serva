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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
    private final StockConsumptionService consumptionService;
    private final AccessGuard accessGuard;

    public PurchasingService(SupplierRepository supplierRepository,
                             PurchaseOrderRepository purchaseOrderRepository,
                             StockService stockService,
                             StockConsumptionService consumptionService,
                             AccessGuard accessGuard) {
        this.supplierRepository = supplierRepository;
        this.purchaseOrderRepository = purchaseOrderRepository;
        this.stockService = stockService;
        this.consumptionService = consumptionService;
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
     * Everything at or below its reorder point, with the quantity that would restore par.
     *
     * <p>Items with no reorder point set are skipped rather than guessed at — a suggestion the
     * owner did not configure is noise, and noise is what makes people stop reading the list.
     */
    @Transactional(readOnly = true)
    public List<Suggestion> suggestions(Long branchId) {
        Map<Long, StockLevel> levels = stockService.levelsByItem(branchId);
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
            BigDecimal needed = target.subtract(onHand);
            if (needed.signum() <= 0) {
                continue;
            }
            out.add(new Suggestion(item, onHand, level.getReorderPointBase(),
                    level.getParLevelBase(), needed, item.getSupplierId()));
        }
        return out;
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
        PurchaseOrder saved = purchaseOrderRepository.save(po);

        // A delivery is the most common way an 86'd item comes back — put it on the menu again.
        Set<Long> touched = new LinkedHashSet<>();
        touched.add(line.getStockItemId());
        consumptionService.refreshAvailability(po.getRestaurantId(), po.getBranchId(), touched);
        return saved;
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
