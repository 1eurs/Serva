package com.cafeqr.stock;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.Stocktake;
import com.cafeqr.stock.domain.StocktakeLine;
import com.cafeqr.stock.domain.StocktakeScope;
import com.cafeqr.stock.dto.StocktakeDtos;
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

import java.util.List;
import java.util.Map;

/**
 * Physical counts.
 *
 * <p>Note what {@link #toResponse} does with the expected quantity on a blind count: it is
 * withheld from the payload entirely, not just hidden by the UI. Anything the client receives
 * is something a curious member of staff can read, and a count where the expectation is
 * knowable is a count that tells you nothing.
 */
@RestController
@RequestMapping("/api/dashboard/stock/counts")
@PreAuthorize("hasAuthority('STOCK')")
@Tag(name = "Stocktakes")
public class StocktakeController {

    private final StocktakeService stocktakeService;
    private final StockService stockService;

    public StocktakeController(StocktakeService stocktakeService, StockService stockService) {
        this.stocktakeService = stocktakeService;
        this.stockService = stockService;
    }

    @Operation(summary = "The count currently open at this branch, if any")
    @GetMapping("/open")
    public ApiResponse<StocktakeDtos.Response> open(@RequestParam(required = false) Long branchId) {
        Long branch = stockService.resolveBranch(branchId);
        Stocktake take = stocktakeService.openAtBranch(branch);
        return ApiResponse.ok(take == null ? null : toResponse(take));
    }

    @Operation(summary = "Past counts at this branch")
    @GetMapping
    public ApiResponse<List<StocktakeDtos.Response>> history(@RequestParam(required = false) Long branchId) {
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok(stocktakeService.history(branch).stream().map(this::toResponse).toList());
    }

    @Operation(summary = "Start a count (blind by default)")
    @PostMapping
    public ApiResponse<StocktakeDtos.Response> start(@Valid @RequestBody StocktakeDtos.OpenRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        StocktakeScope scope = StockController.parseEnum(
                StocktakeScope.class, request.scope(), StocktakeScope.FULL);
        boolean blind = request.blind() == null || request.blind();
        Stocktake take = stocktakeService.open(branch, scope, blind, request.notes());
        return ApiResponse.ok("Count started", toResponse(take));
    }

    @Operation(summary = "Read one count")
    @GetMapping("/{id}")
    public ApiResponse<StocktakeDtos.Response> get(@PathVariable Long id) {
        return ApiResponse.ok(toResponse(stocktakeService.get(id)));
    }

    @Operation(summary = "Record what was actually found for one item")
    @PatchMapping("/{id}/lines")
    public ApiResponse<StocktakeDtos.Response> countLine(@PathVariable Long id,
                                                         @Valid @RequestBody StocktakeDtos.CountLineRequest request) {
        Stocktake take = stocktakeService.countLine(id, request.stockItemId(), request.countedBase());
        return ApiResponse.ok(toResponse(take));
    }

    @Operation(summary = "Finish the count and post the corrections")
    @PostMapping("/{id}/close")
    public ApiResponse<StocktakeDtos.Response> close(@PathVariable Long id) {
        return ApiResponse.ok("Count closed", toResponse(stocktakeService.close(id)));
    }

    @Operation(summary = "Abandon the count without correcting anything")
    @PostMapping("/{id}/cancel")
    public ApiResponse<StocktakeDtos.Response> cancel(@PathVariable Long id) {
        return ApiResponse.ok("Count cancelled", toResponse(stocktakeService.cancel(id)));
    }

    private StocktakeDtos.Response toResponse(Stocktake take) {
        boolean hide = stocktakeService.hidesExpected(take);
        Map<Long, StockItem> items = stockService.itemsById(
                take.getLines().stream().map(StocktakeLine::getStockItemId).toList());

        List<StocktakeDtos.Response.Line> lines = take.getLines().stream()
                .map(line -> {
                    StockItem item = items.get(line.getStockItemId());
                    return new StocktakeDtos.Response.Line(
                            line.getStockItemId(),
                            item == null ? null : item.getNameEn(),
                            item == null ? null : item.getNameAr(),
                            item == null ? null : item.getBaseUnit().name(),
                            hide ? null : line.getExpectedBase(),
                            line.getCountedBase(),
                            hide ? null : line.variance(),
                            hide ? null : line.varianceValue());
                })
                .toList();

        return new StocktakeDtos.Response(take.getId(), take.getBranchId(), take.getStatus().name(),
                take.getScope().name(), take.isBlind(), take.getNotes(), take.getCreatedAt(),
                take.getClosedAt(), stocktakeService.remainingLines(take),
                hide ? null : stocktakeService.varianceValue(take), lines);
    }
}
