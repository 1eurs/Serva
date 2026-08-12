package com.cafeqr.stock;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.stock.domain.PurchaseOrder;
import com.cafeqr.stock.domain.PurchaseOrderLine;
import com.cafeqr.stock.domain.PurchaseOrderStatus;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.Supplier;
import com.cafeqr.stock.dto.PurchasingDtos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Suppliers, reorder suggestions and purchase orders. */
@RestController
@RequestMapping("/api/dashboard/stock")
@PreAuthorize("hasAuthority('STOCK')")
@Tag(name = "Stock purchasing")
public class PurchasingController {

    private final PurchasingService purchasingService;
    private final StockService stockService;

    public PurchasingController(PurchasingService purchasingService, StockService stockService) {
        this.purchasingService = purchasingService;
        this.stockService = stockService;
    }

    // ============================================================ suppliers

    @Operation(summary = "List suppliers")
    @GetMapping("/suppliers")
    public ApiResponse<List<PurchasingDtos.SupplierResponse>> suppliers(
            @RequestParam(defaultValue = "false") boolean activeOnly) {
        return ApiResponse.ok(purchasingService.listSuppliers(activeOnly).stream()
                .map(PurchasingController::toSupplier)
                .toList());
    }

    @Operation(summary = "Add a supplier")
    @PostMapping("/suppliers")
    public ApiResponse<PurchasingDtos.SupplierResponse> createSupplier(
            @Valid @RequestBody PurchasingDtos.SupplierRequest request) {
        Supplier supplier = purchasingService.saveSupplier(null, request.name(), request.phone(),
                request.email(), request.notes(), request.active());
        return ApiResponse.ok("Supplier added", toSupplier(supplier));
    }

    @Operation(summary = "Update a supplier")
    @PatchMapping("/suppliers/{id}")
    public ApiResponse<PurchasingDtos.SupplierResponse> updateSupplier(
            @PathVariable Long id, @Valid @RequestBody PurchasingDtos.SupplierRequest request) {
        Supplier supplier = purchasingService.saveSupplier(id, request.name(), request.phone(),
                request.email(), request.notes(), request.active());
        return ApiResponse.ok("Supplier saved", toSupplier(supplier));
    }

    // ============================================================ suggestions

    @Operation(summary = "What to buy: everything at or below its reorder point")
    @GetMapping("/reorder-suggestions")
    public ApiResponse<List<PurchasingDtos.SuggestionResponse>> suggestions(
            @RequestParam(required = false) Long branchId) {
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok(purchasingService.suggestions(branch).stream()
                .map(s -> {
                    StockItem item = s.item();
                    BigDecimal size = item.getPurchaseUnitSize();
                    // Show the figure in the unit the café actually orders in — nobody buys
                    // "2400 grams of beans", they buy three bags.
                    BigDecimal inPurchaseUnits = size != null && size.signum() > 0
                            ? s.suggestedBase().divide(size, 2, RoundingMode.CEILING)
                            : null;
                    return new PurchasingDtos.SuggestionResponse(item.getId(), item.getNameEn(),
                            item.getNameAr(), item.getBaseUnit().name(), item.getPurchaseUnitLabel(),
                            size, s.onHand(), s.reorderPoint(), s.parLevel(), s.suggestedBase(),
                            inPurchaseUnits, s.supplierId());
                })
                .toList());
    }

    // ============================================================ purchase orders

    @Operation(summary = "List purchase orders")
    @GetMapping("/purchase-orders")
    public ApiResponse<List<PurchasingDtos.OrderResponse>> orders(
            @RequestParam(required = false) Long branchId,
            @RequestParam(defaultValue = "false") boolean openOnly) {
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok(purchasingService.listOrders(branch, openOnly).stream()
                .map(this::toOrder)
                .toList());
    }

    @Operation(summary = "Read one purchase order")
    @GetMapping("/purchase-orders/{id}")
    public ApiResponse<PurchasingDtos.OrderResponse> order(@PathVariable Long id) {
        return ApiResponse.ok(toOrder(purchasingService.get(id)));
    }

    @Operation(summary = "Create a purchase order")
    @PostMapping("/purchase-orders")
    public ApiResponse<PurchasingDtos.OrderResponse> create(
            @Valid @RequestBody PurchasingDtos.OrderRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        List<PurchasingService.OrderLine> lines = request.lines().stream()
                .map(l -> new PurchasingService.OrderLine(l.stockItemId(), l.quantityBase(), l.unitCost()))
                .toList();
        PurchaseOrder po = purchasingService.create(branch, request.supplierId(), request.expectedAt(),
                request.reference(), request.notes(), lines);
        return ApiResponse.ok("Order created", toOrder(po));
    }

    @Operation(summary = "Draft an order straight from the reorder suggestions")
    @PostMapping("/purchase-orders/from-suggestions")
    public ApiResponse<PurchasingDtos.OrderResponse> fromSuggestions(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long supplierId) {
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok("Order drafted",
                toOrder(purchasingService.createFromSuggestions(branch, supplierId)));
    }

    @Operation(summary = "Book part of a line as delivered")
    @PostMapping("/purchase-orders/{id}/receive")
    public ApiResponse<PurchasingDtos.OrderResponse> receive(
            @PathVariable Long id, @Valid @RequestBody PurchasingDtos.ReceiveLineRequest request) {
        PurchaseOrder po = purchasingService.receiveLine(id, request.lineId(),
                request.quantityBase(), request.unitCost());
        return ApiResponse.ok("Delivery recorded", toOrder(po));
    }

    @Operation(summary = "Book the whole outstanding order as delivered")
    @PostMapping("/purchase-orders/{id}/receive-all")
    public ApiResponse<PurchasingDtos.OrderResponse> receiveAll(@PathVariable Long id) {
        return ApiResponse.ok("Delivery recorded", toOrder(purchasingService.receiveAll(id)));
    }

    @Operation(summary = "Change a purchase order's status")
    @PatchMapping("/purchase-orders/{id}/status")
    public ApiResponse<PurchasingDtos.OrderResponse> status(@PathVariable Long id,
                                                            @RequestParam String status) {
        PurchaseOrderStatus target = StockController.parseEnum(
                PurchaseOrderStatus.class, status, PurchaseOrderStatus.DRAFT);
        return ApiResponse.ok("Order updated", toOrder(purchasingService.setStatus(id, target)));
    }

    // ============================================================ mapping

    private static PurchasingDtos.SupplierResponse toSupplier(Supplier s) {
        return new PurchasingDtos.SupplierResponse(s.getId(), s.getName(), s.getPhone(),
                s.getEmail(), s.getNotes(), s.isActive());
    }

    private PurchasingDtos.OrderResponse toOrder(PurchaseOrder po) {
        Map<Long, StockItem> items = stockService.itemsById(
                po.getLines().stream().map(PurchaseOrderLine::getStockItemId).toList());
        Map<Long, String> supplierNames = new LinkedHashMap<>();
        for (Supplier supplier : purchasingService.listSuppliers(false)) {
            supplierNames.put(supplier.getId(), supplier.getName());
        }

        BigDecimal total = BigDecimal.ZERO;
        List<PurchasingDtos.OrderResponse.Line> lines = po.getLines().stream()
                .map(line -> {
                    StockItem item = items.get(line.getStockItemId());
                    return new PurchasingDtos.OrderResponse.Line(line.getId(), line.getStockItemId(),
                            item == null ? null : item.getNameEn(),
                            item == null ? null : item.getNameAr(),
                            item == null ? null : item.getBaseUnit().name(),
                            line.getQuantityBase(), line.getQuantityReceivedBase(),
                            line.outstandingBase(), line.getUnitCost());
                })
                .toList();
        for (PurchaseOrderLine line : po.getLines()) {
            if (line.getUnitCost() != null) {
                total = total.add(line.getQuantityBase().multiply(line.getUnitCost()));
            }
        }

        return new PurchasingDtos.OrderResponse(po.getId(), po.getBranchId(), po.getSupplierId(),
                po.getSupplierId() == null ? null : supplierNames.get(po.getSupplierId()),
                po.getStatus().name(), po.getReference(), po.getNotes(), po.getExpectedAt(),
                po.getCreatedAt(), total.setScale(3, RoundingMode.HALF_UP), lines);
    }
}
