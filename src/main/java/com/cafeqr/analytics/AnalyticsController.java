package com.cafeqr.analytics;

import com.cafeqr.analytics.dto.AnalyticsSummaryResponse;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.analytics.dto.BestSellingItem;
import com.cafeqr.analytics.dto.DailyPoint;
import com.cafeqr.analytics.dto.DaypartPoint;
import com.cafeqr.analytics.dto.PaymentMethodRevenueResponse;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.common.exception.PlanRequiredException;
import com.cafeqr.common.util.TimeZones;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.LocalDate;
import java.util.List;

/**
 * The core analytics every café gets. The diagnostic layer (funnel, staff leaderboard,
 * forecast, benchmarking, …) lives at {@link ProAnalyticsController}.
 *
 * <p>What is capped here is the <em>window</em>, and the cap lifts with {@code FULL_HISTORY}
 * rather than with a tier name — which tier includes it is a tick on the Plans page:
 * <ul>
 *   <li>{@code /today} — always available (counts, revenue, AOV, best-sellers, busiest hours).</li>
 *   <li>{@code /orders?from&to}, {@code /daily}, {@code /daypart}, {@code /payment-methods} —
 *       without the feature, the last 7 days; longer windows throw 402 PLAN_REQUIRED.</li>
 *   <li>{@code /best-selling-items?limit} — without the feature, capped at 5 rows.</li>
 * </ul>
 * Platform admin bypasses every cap (preview).
 */
@RestController
@RequestMapping("/api/dashboard/analytics")
@Tag(name = "Dashboard analytics")
@PreAuthorize("hasAuthority('ANALYTICS')")
public class AnalyticsController {

    /** Best-seller rows without FULL_HISTORY; with it, the caller's limit stands. */
    private static final int CAPPED_BEST_SELLING_LIMIT = 5;
    /** Days of history without FULL_HISTORY. */
    private static final int CAPPED_RANGE_DAYS = 7;

    private final AnalyticsService analyticsService;
    private final Entitlements entitlements;

    public AnalyticsController(AnalyticsService analyticsService, Entitlements entitlements) {
        this.analyticsService = analyticsService;
        this.entitlements = entitlements;
    }

    @Operation(summary = "Today's analytics summary")
    @GetMapping("/today")
    public ApiResponse<AnalyticsSummaryResponse> today(
            @RequestParam(required = false) Long branchId) {
        LocalDate today = LocalDate.now(TimeZones.CAFES);
        return ApiResponse.ok(analyticsService.summary(startOfDay(today), startOfDay(today.plusDays(1)), branchId));
    }

    @Operation(summary = "Analytics summary for a date range")
    @GetMapping("/orders")
    public ApiResponse<AnalyticsSummaryResponse> orders(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        requireWindow(from, to);
        return ApiResponse.ok(analyticsService.summary(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Best-selling items for a date range")
    @GetMapping("/best-selling-items")
    public ApiResponse<List<BestSellingItem>> bestSelling(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) Long branchId) {
        int applied = limit;
        if (!entitlements.has(Feature.FULL_HISTORY)) {
            applied = Math.min(limit, CAPPED_BEST_SELLING_LIMIT);
        }
        return ApiResponse.ok(analyticsService.bestSelling(startOfDay(from), startOfDay(to.plusDays(1)), branchId, applied));
    }

    @Operation(summary = "Per-day orders & revenue for the trend chart")
    @GetMapping("/daily")
    public ApiResponse<List<DailyPoint>> daily(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        requireWindow(from, to);
        return ApiResponse.ok(analyticsService.dailyBreakdown(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Orders & revenue grouped by part of the day")
    @GetMapping("/daypart")
    public ApiResponse<List<DaypartPoint>> daypart(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        requireWindow(from, to);
        return ApiResponse.ok(analyticsService.daypartBreakdown(startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    @Operation(summary = "Paid revenue split by Cash and Card")
    @GetMapping("/payment-methods")
    public ApiResponse<List<PaymentMethodRevenueResponse>> paymentMethods(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long branchId) {
        requireWindow(from, to);
        return ApiResponse.ok(analyticsService.paymentMethodRevenue(
                startOfDay(from), startOfDay(to.plusDays(1)), branchId));
    }

    /**
     * A capped plan may ask for a short window; asking for more is a 402.
     *
     * <p>This check was written out five times, once per range endpoint, and the wording named
     * the tier that lifts the cap — a sentence that goes out of date the next time somebody
     * edits the Plans grid. One copy now, and it names the limit rather than the tier.
     */
    private void requireWindow(LocalDate from, LocalDate to) {
        if (entitlements.has(Feature.FULL_HISTORY)) {
            return;
        }
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days > CAPPED_RANGE_DAYS) {
            throw new PlanRequiredException(
                    "Your plan covers the last " + CAPPED_RANGE_DAYS + " days. "
                            + "Upgrade to query any date range.");
        }
    }

    private static Instant startOfDay(LocalDate date) {
        return date.atStartOfDay(TimeZones.CAFES).toInstant();
    }
}
