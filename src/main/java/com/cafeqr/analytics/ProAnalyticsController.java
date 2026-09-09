package com.cafeqr.analytics;

import com.cafeqr.analytics.dto.BenchmarkResponse;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.analytics.dto.CustomerBaseResponse;
import com.cafeqr.analytics.dto.CustomerDirectoryResponse;
import com.cafeqr.analytics.dto.CustomersInsightResponse;
import com.cafeqr.analytics.dto.ForecastSlotResponse;
import com.cafeqr.analytics.dto.FunnelResponse;
import com.cafeqr.analytics.dto.ItemAffinityResponse;
import com.cafeqr.analytics.dto.ItemConversionResponse;
import com.cafeqr.analytics.dto.KitchenTimingResponse;
import com.cafeqr.analytics.dto.StaffPerformanceResponse;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.common.api.PageResponse;
import jakarta.validation.constraints.Size;
import com.cafeqr.common.util.TimeZones;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Pro-tier analytics endpoints. Every route is gated twice:
 * <ul>
 *   <li>{@code @PreAuthorize("hasAuthority('ANALYTICS')")} — same as the Standard analytics
 *       controller, ensures the staff member may see analytics at all.</li>
 *   <li>{@link Entitlements#require} with {@code Feature.PRO_ANALYTICS} — checks the grid
 *       and throws 402 PLAN_REQUIRED on Standard. The platform admin is always allowed
 *       so they can preview the features.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/dashboard/analytics/pro")
@Tag(name = "Dashboard analytics — Pro")
@PreAuthorize("hasAuthority('ANALYTICS')")
@Validated
public class ProAnalyticsController {

    private final ProAnalyticsService proService;
    private final Entitlements entitlements;

    public ProAnalyticsController(ProAnalyticsService proService, Entitlements entitlements) {
        this.proService = proService;
        this.entitlements = entitlements;
    }

    @Operation(summary = "Pro · Item conversion radar (view→order rate per item)")
    @GetMapping("/item-conversion")
    public ApiResponse<List<ItemConversionResponse>> itemConversion(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.itemConversion(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Pro · Market basket — items frequently ordered together")
    @GetMapping("/market-basket")
    public ApiResponse<List<ItemAffinityResponse>> marketBasket(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.marketBasket(startOfDay(from), startOfDay(to.plusDays(1)), branchId, limit));
    }

    @Operation(summary = "Pro · Staff leaderboard — accept latency, throughput, decline rate")
    @GetMapping("/staff")
    public ApiResponse<List<StaffPerformanceResponse>> staff(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.staffPerformance(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Pro · Conversion funnel — menu view → cart → checkout → order")
    @GetMapping("/funnel")
    public ApiResponse<FunnelResponse> funnel(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.funnel(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Pro · Kitchen timing — avg seconds per fulfillment stage")
    @GetMapping("/kitchen-timing")
    public ApiResponse<KitchenTimingResponse> kitchenTiming(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.kitchenTiming(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Pro · Demand forecast — expected orders by weekday & slot")
    @GetMapping("/forecast")
    public ApiResponse<List<ForecastSlotResponse>> forecast(
            @RequestParam(defaultValue = "4") int weeks,
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.forecast(weeks, branchId));
    }

    @Operation(summary = "Pro · Customers — top regulars + at-risk customers")
    @GetMapping("/customers")
    public ApiResponse<CustomersInsightResponse> customers(
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.customers(branchId));
    }

    @Operation(summary = "Pro · Customer base — repeat rate, avg orders, new vs returning")
    @GetMapping("/customer-base")
    public ApiResponse<CustomerBaseResponse> customerBase(
            @RequestParam(required = false) Long branchId) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.customerBase(branchId));
    }

    @Operation(summary = "Pro · Searchable customer directory")
    @GetMapping("/customer-directory")
    public ApiResponse<PageResponse<CustomerDirectoryResponse>> customerDirectory(
            @RequestParam(required = false) Long branchId,
            @RequestParam(defaultValue = "") @Size(max = 100) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(PageResponse.from(
                proService.customerDirectory(branchId, search, page, size)));
    }

    @Operation(summary = "Pro · Anonymous benchmark — your café vs the Serva median")
    @GetMapping("/benchmark")
    public ApiResponse<BenchmarkResponse> benchmark() {
        entitlements.require(Feature.PRO_ANALYTICS);
        return ApiResponse.ok(proService.benchmark());
    }

    private static Instant startOfDay(LocalDate date) {
        return date.atStartOfDay(TimeZones.CAFES).toInstant();
    }
}
