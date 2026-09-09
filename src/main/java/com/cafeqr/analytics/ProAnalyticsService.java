package com.cafeqr.analytics;

import com.cafeqr.analytics.dto.BenchmarkResponse;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.analytics.dto.CustomerBaseResponse;
import com.cafeqr.analytics.dto.CustomerDirectoryResponse;
import com.cafeqr.analytics.dto.CustomerInsightResponse;
import com.cafeqr.analytics.dto.CustomersInsightResponse;
import com.cafeqr.analytics.dto.ForecastSlotResponse;
import com.cafeqr.analytics.dto.FunnelResponse;
import com.cafeqr.analytics.dto.ItemAffinityResponse;
import com.cafeqr.analytics.dto.ItemConversionResponse;
import com.cafeqr.analytics.dto.KitchenTimingResponse;
import com.cafeqr.analytics.dto.StaffPerformanceResponse;
import com.cafeqr.analytics.repository.AnalyticsEventRepository;
import com.cafeqr.analytics.repository.OrderEventLogRepository;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.customers.repository.CustomerProfileRepository;
import com.cafeqr.orders.repository.OrderItemRepository;
import com.cafeqr.orders.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Gated insights. Every method enforces the gate via {@link Entitlements#require} with
 * {@code Feature.PRO_ANALYTICS}
 * (called from the controller, not here — keeping this service pure-data) and applies the
 * caller's restaurant/branch scoping from {@link AccessGuard}.
 *
 * <p>All insights read the raw event/order tables on the fly — no pre-aggregation. Fine for
 * hundreds of thousands of orders per cafe; revisit a rollup table past ~1M.
 */
@Service
public class ProAnalyticsService {

    private static final int MONEY_SCALE = 3;
    private static final int TOP_REGULARS = 10;
    private static final int MIN_ORDERS_FOR_REGULAR = 3;
    private static final int AFFINITY_LIMIT = 10;
    private static final int DEFAULT_FORECAST_WEEKS = 4;

    private final AccessGuard accessGuard;
    private final BranchService branchService;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final AnalyticsEventRepository analyticsEventRepository;
    private final OrderEventLogRepository orderEventLogRepository;
    private final CustomerProfileRepository customerProfileRepository;

    public ProAnalyticsService(AccessGuard accessGuard,
                               BranchService branchService,
                               OrderRepository orderRepository,
                               OrderItemRepository orderItemRepository,
                               AnalyticsEventRepository analyticsEventRepository,
                               OrderEventLogRepository orderEventLogRepository,
                               CustomerProfileRepository customerProfileRepository) {
        this.accessGuard = accessGuard;
        this.branchService = branchService;
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.analyticsEventRepository = analyticsEventRepository;
        this.orderEventLogRepository = orderEventLogRepository;
        this.customerProfileRepository = customerProfileRepository;
    }

    /**
     * Resolves the branch scope for pro analytics. Branch-scoped staff are pinned to their
     * own branch; restaurant-wide users (owner / manager) may pass a branch id to filter to
     * one branch, or {@code null} for all branches. Mirrors {@code AnalyticsService}.
     */
    private Long resolveBranchScope(Long requestedBranchId) {
        Long scoped = accessGuard.scopedBranchId();
        if (scoped != null) return scoped;
        if (requestedBranchId != null) {
            Branch branch = branchService.getEntity(requestedBranchId);
            accessGuard.requireRestaurantAccess(branch.getRestaurantId());
            return requestedBranchId;
        }
        return null;
    }

    // ----------------------------------------------------------------- 1. item conversion radar

    @Transactional(readOnly = true)
    public List<ItemConversionResponse> itemConversion(Instant from, Instant to, Long branchId) {
        return itemConversion(accessGuard.scopedRestaurantId(), resolveBranchScope(branchId), from, to);
    }

    /** Explicit-restaurant overload — used by the weekly email job (no security context). */
    @Transactional(readOnly = true)
    public List<ItemConversionResponse> itemConversion(Long restaurantId, Long branchId,
                                                       Instant from, Instant to) {

        Map<Long, Long> viewsByItem = new HashMap<>();
        Map<Long, String> nameEn = new HashMap<>();
        Map<Long, String> nameAr = new HashMap<>();
        for (Object[] row : analyticsEventRepository.itemViewCounts(restaurantId, branchId, from, to)) {
            Long itemId = ((Number) row[0]).longValue();
            viewsByItem.put(itemId, ((Number) row[3]).longValue());
            nameEn.put(itemId, (String) row[1]);
            nameAr.put(itemId, (String) row[2]);
        }

        // Numerator = distinct orders that contained the item (not total quantity), so the
        // ratio reads as a real view→order conversion. Names come from the view scan above.
        Map<Long, Long> ordersByItem = new HashMap<>();
        for (Object[] row : orderItemRepository.orderCountByItem(restaurantId, branchId, from, to)) {
            ordersByItem.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }

        List<ItemConversionResponse> out = new ArrayList<>();
        for (Long itemId : viewsByItem.keySet()) {
            long views = viewsByItem.getOrDefault(itemId, 0L);
            long orders = ordersByItem.getOrDefault(itemId, 0L);
            // Cap the rate at 100%: a reorder placed without a fresh menu view can otherwise
            // push a popular item's orders above its views. The raw order count is still surfaced.
            BigDecimal rate = views > 0
                    ? BigDecimal.valueOf(Math.min(orders, views)).divide(BigDecimal.valueOf(views), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            out.add(new ItemConversionResponse(itemId, nameEn.get(itemId), nameAr.get(itemId),
                    views, orders, rate));
        }
        // Show the most-wasted opportunities first: high views, low conversion.
        out.sort(Comparator.comparing(ItemConversionResponse::conversionRate));
        return out;
    }

    // ----------------------------------------------------------------- 2. market basket

    @Transactional(readOnly = true)
    public List<ItemAffinityResponse> marketBasket(Instant from, Instant to, Long branchId, int limit) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        int cap = limit > 0 ? Math.min(limit, AFFINITY_LIMIT) : AFFINITY_LIMIT;
        List<Object[]> rows = orderItemRepository.itemAffinity(restaurantId, branchScope, from, to, cap);
        List<ItemAffinityResponse> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            out.add(new ItemAffinityResponse(
                    ((Number) r[0]).longValue(), (String) r[1], (String) r[2],
                    ((Number) r[3]).longValue(), (String) r[4], (String) r[5],
                    ((Number) r[6]).longValue()));
        }
        return out;
    }

    // ----------------------------------------------------------------- 3. staff leaderboard

    @Transactional(readOnly = true)
    public List<StaffPerformanceResponse> staffPerformance(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        return staffPerformance(restaurantId, resolveBranchScope(branchId), from, to);
    }

    /** Explicit-restaurant overload — used by the weekly email job (no security context). */
    @Transactional(readOnly = true)
    public List<StaffPerformanceResponse> staffPerformance(Long restaurantId, Long branchId,
                                                           Instant from, Instant to) {
        if (restaurantId == null) return List.of(); // platform admin has no "staff"
        List<Object[]> rows = orderEventLogRepository.staffPerformance(restaurantId, branchId, from, to);
        List<StaffPerformanceResponse> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Double avgAccept = r[7] == null ? null : ((Number) r[7]).doubleValue();
            out.add(new StaffPerformanceResponse(
                    r[0] == null ? null : ((Number) r[0]).longValue(),
                    (String) r[1],
                    (String) r[2],
                    (String) r[3],
                    ((Number) r[4]).longValue(),
                    ((Number) r[5]).longValue(),
                    ((Number) r[6]).longValue(),
                    avgAccept));
        }
        return out;
    }

    // ----------------------------------------------------------------- 4. demand forecast

    @Transactional(readOnly = true)
    public List<ForecastSlotResponse> forecast(int weeks, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) return List.of();
        Long branchScope = resolveBranchScope(branchId);
        int w = weeks > 0 ? Math.min(weeks, 12) : DEFAULT_FORECAST_WEEKS;
        Instant from = LocalDate.now(TimeZones.CAFES).minusWeeks(w).atStartOfDay(TimeZones.CAFES).toInstant();
        Instant to = Instant.now();
        List<Object[]> rows = orderRepository.demandByWeekdayHour(restaurantId, branchScope, from, to);
        long spanSeconds = Duration.between(from, to).getSeconds();
        double weeksInWindow = Math.max(1.0, spanSeconds / 604800.0);
        List<ForecastSlotResponse> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            int dow = ((Number) r[0]).intValue();
            int hour = ((Number) r[1]).intValue();
            long count = ((Number) r[2]).longValue();
            out.add(new ForecastSlotResponse(dow, hour, count / weeksInWindow));
        }
        return out;
    }

    // ----------------------------------------------------------------- 5. customers: regulars + at-risk

    @Transactional(readOnly = true)
    public CustomersInsightResponse customers(Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        return customers(restaurantId, resolveBranchScope(branchId));
    }

    @Transactional(readOnly = true)
    public Page<CustomerDirectoryResponse> customerDirectory(Long branchId, String search, int page, int size) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        String term = search == null ? "" : search.trim();
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)));
        Page<Object[]> rows = branchScope == null
                ? customerProfileRepository.customerDirectory(restaurantId, term, pageable)
                : customerProfileRepository.customerDirectoryByBranch(restaurantId, branchScope, term, pageable);
        return rows.map(r -> new CustomerDirectoryResponse(
                (String) r[0], (String) r[1], ((Number) r[2]).longValue(), toInstant(r[3])));
    }

    /** Explicit-restaurant overload — used by the weekly email job. */
    @Transactional(readOnly = true)
    public CustomersInsightResponse customers(Long restaurantId, Long branchId) {
        if (restaurantId == null) return new CustomersInsightResponse(List.of(), List.of());

        Instant cutoff = Instant.now().minus(Duration.ofDays(21));

        if (branchId != null) {
            List<CustomerInsightResponse> top = customerProfileRepository
                    .topRegularsByBranch(restaurantId, branchId, MIN_ORDERS_FOR_REGULAR, TOP_REGULARS).stream()
                    .map(ProAnalyticsService::toCustomerInsight).toList();
            List<CustomerInsightResponse> atRisk = customerProfileRepository
                    .atRiskCustomersByBranch(restaurantId, branchId, MIN_ORDERS_FOR_REGULAR, cutoff, TOP_REGULARS).stream()
                    .map(ProAnalyticsService::toCustomerInsight).toList();
            return new CustomersInsightResponse(top, atRisk);
        }

        List<CustomerInsightResponse> top = customerProfileRepository
                .topRegulars(restaurantId, MIN_ORDERS_FOR_REGULAR, TOP_REGULARS).stream()
                .map(ProAnalyticsService::toCustomerInsight).toList();
        List<CustomerInsightResponse> atRisk = customerProfileRepository
                .atRiskCustomers(restaurantId, MIN_ORDERS_FOR_REGULAR, cutoff, TOP_REGULARS).stream()
                .map(ProAnalyticsService::toCustomerInsight).toList();
        return new CustomersInsightResponse(top, atRisk);
    }

    /**
     * Customer-base KPIs (repeat rate, avg orders/customer, new & active in the last 30 days,
     * repeat-order share). Scopes to a single branch when one is requested (or the caller is
     * branch-pinned), otherwise spans the whole restaurant. Returns an all-zero response for a
     * platform admin.
     */
    @Transactional(readOnly = true)
    public CustomerBaseResponse customerBase(Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) return new CustomerBaseResponse(0, 0, 0, 0.0, 0, 0, 0);
        Long branchScope = resolveBranchScope(branchId);

        Instant cutoff = Instant.now().minus(Duration.ofDays(30));
        List<Object[]> rows = branchScope == null
                ? customerProfileRepository.customerBaseStats(restaurantId, cutoff)
                : customerProfileRepository.customerBaseStatsByBranch(restaurantId, branchScope, cutoff);
        if (rows.isEmpty()) return new CustomerBaseResponse(0, 0, 0, 0.0, 0, 0, 0);

        Object[] r = rows.get(0);
        long total = asLong(r[0]);
        long repeat = asLong(r[1]);
        double avgOrders = r[2] == null ? 0.0 : ((Number) r[2]).doubleValue();
        long totalOrders = asLong(r[3]);
        long newCustomers = asLong(r[4]);
        long activeCustomers = asLong(r[5]);

        int repeatRate = total > 0 ? (int) Math.round(repeat * 100.0 / total) : 0;
        // Every customer's first order is their own; the rest are repeat visits.
        int repeatOrderShare = totalOrders > 0 ? (int) Math.round((totalOrders - total) * 100.0 / totalOrders) : 0;

        return new CustomerBaseResponse(total, repeat, repeatRate, avgOrders,
                newCustomers, activeCustomers, repeatOrderShare);
    }

    private static CustomerInsightResponse toCustomerInsight(Object[] r) {
        return new CustomerInsightResponse(
                ((Number) r[0]).longValue(), (String) r[1], (String) r[2],
                ((Number) r[3]).intValue(), toInstant(r[4]));
    }

    // ----------------------------------------------------------------- 5b. conversion funnel

    /**
     * Customer journey funnel for the window: distinct browsing sessions that reached each stage —
     * menu view → add to cart → checkout started → order placed — all from {@code analytics_events}.
     * Every stage counts distinct sessions, so the steps share one unit and are directly comparable.
     */
    @Transactional(readOnly = true)
    public FunnelResponse funnel(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        List<Object[]> rows = analyticsEventRepository.funnelStages(restaurantId, branchScope, from, to);
        if (rows.isEmpty()) return new FunnelResponse(0, 0, 0, 0);
        Object[] r = rows.get(0);
        return new FunnelResponse(asLong(r[0]), asLong(r[1]), asLong(r[2]), asLong(r[3]));
    }

    private static long asLong(Object v) {
        return v == null ? 0L : ((Number) v).longValue();
    }

    private static Double asDouble(Object v) {
        return v == null ? null : ((Number) v).doubleValue();
    }

    // ----------------------------------------------------------------- 5c. kitchen / fulfillment timing

    /**
     * Average fulfillment-stage durations for the window — how long orders spend waiting to be
     * accepted, in prep, and in handoff. Reads the order event log; each stage averages only the
     * orders that reached both of its ends. Returns an all-null/zero response for a platform admin
     * (no restaurant scope) or when nothing was accepted in the window.
     */
    @Transactional(readOnly = true)
    public KitchenTimingResponse kitchenTiming(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) return new KitchenTimingResponse(null, null, null, null, null, 0);
        Long branchScope = resolveBranchScope(branchId);
        List<Object[]> rows = orderEventLogRepository.kitchenTiming(restaurantId, branchScope, from, to);
        if (rows.isEmpty()) return new KitchenTimingResponse(null, null, null, null, null, 0);
        Object[] r = rows.get(0);
        return new KitchenTimingResponse(
                asDouble(r[0]), asDouble(r[1]), asDouble(r[2]), asDouble(r[3]), asDouble(r[4]), asLong(r[5]));
    }

    // ----------------------------------------------------------------- 6. anonymous benchmarking

    @Transactional(readOnly = true)
    public BenchmarkResponse benchmark() {
        Long myRestaurantId = accessGuard.scopedRestaurantId();
        return benchmark(myRestaurantId);
    }

    /** Explicit-restaurant overload — used by the weekly email job. */
    @Transactional(readOnly = true)
    public BenchmarkResponse benchmark(Long myRestaurantId) {
        Instant to = Instant.now();
        Instant from = to.minus(Duration.ofDays(30));

        // To benchmark the calling cafe we need its own AOV and accept-latency.
        // AOV from the platform-wide query (includes this cafe's row); accept latency ditto.
        List<Object[]> aovRows = orderRepository.aovPerRestaurant(from, to);
        List<Object[]> latRows = orderEventLogRepository.acceptLatencyPerRestaurant(from, to);

        BigDecimal myAov = null;
        List<BigDecimal> aovs = new ArrayList<>();
        for (Object[] r : aovRows) {
            long rid = ((Number) r[0]).longValue();
            BigDecimal aov = r[1] == null ? null : (BigDecimal) r[1];
            if (myRestaurantId != null && rid == myRestaurantId) myAov = aov;
            if (aov != null) aovs.add(aov);
        }

        Double myAccept = null;
        List<Double> lats = new ArrayList<>();
        for (Object[] r : latRows) {
            long rid = ((Number) r[0]).longValue();
            Double avg = r[1] == null ? null : ((Number) r[1]).doubleValue();
            if (myRestaurantId != null && rid == myRestaurantId) myAccept = avg;
            if (avg != null) lats.add(avg);
        }

        // We need a min sample to anonymize — don't expose percentiles with < 5 cafes.
        long cafes = Math.max(aovs.size(), lats.size());
        if (cafes < 5) {
            return new BenchmarkResponse(myAov, null, 0, myAccept, null, 0, cafes);
        }

        BigDecimal medianAov = percentile(aovs.stream().sorted().toList(), 50);
        int aovPct = myAov == null ? 0 : percentileRank(aovs, myAov);

        Double medianAccept = medianDouble(lats);
        int acceptPct = myAccept == null ? 0 : percentileRankDouble(lats, myAccept);
        // Lower accept time is better, so flip: a faster (lower) time = higher percentile.
        acceptPct = 100 - acceptPct;

        return new BenchmarkResponse(myAov, medianAov, aovPct, myAccept, medianAccept, acceptPct, cafes);
    }

    // ---- helpers ----

    private static Instant toInstant(Object v) {
        return switch (v) {
            case null -> null;
            case Instant i -> i;
            case java.sql.Timestamp ts -> ts.toInstant();
            case java.time.OffsetDateTime odt -> odt.toInstant();
            default -> null;
        };
    }

    private static BigDecimal percentile(List<BigDecimal> sorted, int p) {
        if (sorted.isEmpty()) return null;
        int idx = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
    }

    private static int percentileRank(List<BigDecimal> all, BigDecimal value) {
        long below = all.stream().filter(v -> v.compareTo(value) < 0).count();
        return (int) (below * 100L / all.size());
    }

    private static Double medianDouble(List<Double> all) {
        if (all.isEmpty()) return null;
        List<Double> sorted = new ArrayList<>(all);
        sorted.sort(Double::compare);
        int mid = sorted.size() / 2;
        return sorted.size() % 2 == 1 ? sorted.get(mid)
                : (sorted.get(mid - 1) + sorted.get(mid)) / 2.0;
    }

    private static int percentileRankDouble(List<Double> all, double value) {
        long below = all.stream().filter(v -> v < value).count();
        return (int) (below * 100L / all.size());
    }
}
