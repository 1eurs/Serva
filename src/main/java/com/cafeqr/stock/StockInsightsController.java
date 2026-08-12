package com.cafeqr.stock;

import com.cafeqr.analytics.Entitlements;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.stock.dto.InsightResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

/**
 * The reports layered on top of the ledger.
 *
 * <p>Operational reads (what runs out today, what got wasted) are open to every plan — a café
 * that entered its stock should be able to run its shift on it. The strategic ones (cost drift,
 * menu economics) sit behind the Pro gate alongside the rest of the diagnostic analytics.
 */
@RestController
@RequestMapping("/api/dashboard/stock/insights")
@PreAuthorize("hasAuthority('STOCK')")
@Tag(name = "Stock insights")
public class StockInsightsController {

    private final StockInsightsService insightsService;
    private final StockService stockService;
    private final Entitlements entitlements;

    public StockInsightsController(StockInsightsService insightsService,
                                   StockService stockService,
                                   Entitlements entitlements) {
        this.insightsService = insightsService;
        this.stockService = stockService;
        this.entitlements = entitlements;
    }

    @Operation(summary = "How long what's on the shelf will last at the recent rate")
    @GetMapping("/cover")
    public ApiResponse<List<InsightResponses.Cover>> cover(@RequestParam(required = false) Long branchId) {
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok(insightsService.daysOfCover(branch).stream()
                .map(c -> new InsightResponses.Cover(c.item().getId(), c.item().getNameEn(),
                        c.item().getNameAr(), c.item().getBaseUnit().name(),
                        c.onHand(), c.dailyUsage(), c.daysLeft()))
                .toList());
    }

    @Operation(summary = "What was thrown away, comped or eaten by staff, and what it cost")
    @GetMapping("/waste")
    public ApiResponse<List<InsightResponses.Waste>> waste(@RequestParam(required = false) Long branchId,
                                                            @RequestParam(defaultValue = "30") int days) {
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok(insightsService.waste(branch, Math.min(days, 365)).stream()
                .map(w -> new InsightResponses.Waste(w.item().getId(), w.item().getNameEn(),
                        w.item().getNameAr(), w.item().getBaseUnit().name(), w.quantityBase(), w.value()))
                .toList());
    }

    @Operation(summary = "Ingredients whose latest delivery came in above the running average (Pro)")
    @GetMapping("/cost-drift")
    public ApiResponse<List<InsightResponses.CostDrift>> costDrift(
            @RequestParam(defaultValue = "5") int thresholdPercent) {
        entitlements.requirePro();
        return ApiResponse.ok(insightsService.costDrift(BigDecimal.valueOf(thresholdPercent)).stream()
                .map(d -> new InsightResponses.CostDrift(d.item().getId(), d.item().getNameEn(),
                        d.item().getNameAr(), d.averageCost(), d.latestCost(), d.changePercent()))
                .toList());
    }

    @Operation(summary = "Popularity against margin for every dish — stars, plowhorses, puzzles, dogs (Pro)")
    @GetMapping("/menu-economics")
    public ApiResponse<List<InsightResponses.MenuEconomics>> menuEconomics(
            @RequestParam(required = false) Long branchId,
            @RequestParam(defaultValue = "30") int days) {
        entitlements.requirePro();
        Long restaurantId = stockService.requireCafeScope();
        Long branch = stockService.resolveBranch(branchId);
        return ApiResponse.ok(insightsService.menuEconomics(restaurantId, branch, Math.min(days, 365)).stream()
                .map(m -> new InsightResponses.MenuEconomics(m.menuItemId(), m.nameEn(), m.nameAr(),
                        m.quantitySold(), m.revenue(), m.unitCost(), m.unitMargin(),
                        m.foodCostPercent(), m.quadrant()))
                .toList());
    }
}
