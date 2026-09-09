package com.cafeqr.analytics;

import com.cafeqr.analytics.dto.PlatformTrendPoint;
import com.cafeqr.analytics.dto.RestaurantStatsResponse;
import com.cafeqr.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "Platform analytics")
@PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
public class PlatformAnalyticsController {

    /** A year of daily points is the most the console will chart; beyond that it's a report, not a page. */
    private static final int MAX_TREND_DAYS = 365;

    private final AnalyticsService analyticsService;

    public PlatformAnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @Operation(summary = "Per-restaurant activity stats (orders, revenue, activation checklist, weekly trend)")
    @GetMapping("/restaurants/stats")
    public ApiResponse<List<RestaurantStatsResponse>> stats() {
        return ApiResponse.ok(analyticsService.platformRestaurantStats());
    }

    @Operation(summary = "Daily platform totals — orders, revenue and café signups per day")
    @GetMapping("/trends")
    public ApiResponse<List<PlatformTrendPoint>> trends(@RequestParam(defaultValue = "90") int days) {
        return ApiResponse.ok(analyticsService.platformTrend(Math.clamp(days, 7, MAX_TREND_DAYS)));
    }
}
