package com.cafeqr.stock;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.stock.dto.StockDtos.CountRequest;
import com.cafeqr.stock.dto.StockDtos.CreateStockItemRequest;
import com.cafeqr.stock.dto.StockDtos.ReceiveRequest;
import com.cafeqr.stock.dto.StockDtos.StockItemResponse;
import com.cafeqr.stock.dto.StockDtos.UpdateStockItemRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The shelf, per shop.
 *
 * <p>A delivery and a recount are separate endpoints because they are separate events —
 * see {@link StockService}. Everything here needs STOCK, which an owner holds by default and
 * grants to staff one account at a time.
 */
@RestController
@Tag(name = "Stock")
@PreAuthorize("hasAuthority('STOCK')")
public class StockController {

    private final StockService stockService;

    public StockController(StockService stockService) {
        this.stockService = stockService;
    }

    @Operation(summary = "Everything one branch holds")
    @GetMapping("/api/branches/{branchId}/stock")
    public ApiResponse<List<StockItemResponse>> list(@PathVariable Long branchId) {
        return ApiResponse.ok(stockService.list(branchId));
    }

    @Operation(summary = "Put a new item on the shelf")
    @PostMapping("/api/branches/{branchId}/stock")
    public ApiResponse<StockItemResponse> create(@PathVariable Long branchId,
                                                 @Valid @RequestBody CreateStockItemRequest request) {
        return ApiResponse.ok("Item added", stockService.create(branchId, request));
    }

    @Operation(summary = "Edit an item — its name, unit, order line or price, never its quantity")
    @PatchMapping("/api/stock/{itemId}")
    public ApiResponse<StockItemResponse> update(@PathVariable Long itemId,
                                                @Valid @RequestBody UpdateStockItemRequest request) {
        return ApiResponse.ok("Item saved", stockService.update(itemId, request));
    }

    @Operation(summary = "Something arrived — add it to what is there")
    @PostMapping("/api/stock/{itemId}/receive")
    public ApiResponse<StockItemResponse> receive(@PathVariable Long itemId,
                                                 @Valid @RequestBody ReceiveRequest request) {
        return ApiResponse.ok("Stock added", stockService.receive(itemId, request));
    }

    @Operation(summary = "Somebody counted — replace the figure with what is actually there")
    @PostMapping("/api/stock/{itemId}/count")
    public ApiResponse<StockItemResponse> count(@PathVariable Long itemId,
                                               @Valid @RequestBody CountRequest request) {
        return ApiResponse.ok("Count saved", stockService.count(itemId, request));
    }

    @Operation(summary = "Take an item off the shelf for good")
    @DeleteMapping("/api/stock/{itemId}")
    public ApiResponse<Void> delete(@PathVariable Long itemId) {
        stockService.delete(itemId);
        return ApiResponse.message("Item removed");
    }
}
