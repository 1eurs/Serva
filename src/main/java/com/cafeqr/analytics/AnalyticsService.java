package com.cafeqr.analytics;

import com.cafeqr.analytics.dto.AnalyticsSummaryResponse;
import com.cafeqr.analytics.dto.BestSellingItem;
import com.cafeqr.analytics.dto.DailyPoint;
import com.cafeqr.analytics.dto.DaypartPoint;
import com.cafeqr.analytics.dto.HourlyCount;
import com.cafeqr.analytics.dto.PaymentMethodRevenueResponse;
import com.cafeqr.analytics.dto.PlatformTrendPoint;
import com.cafeqr.analytics.dto.RestaurantStatsResponse;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.branches.repository.BranchRepository;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.repository.OrderItemRepository;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.payments.repository.PaymentRepository;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.tables.repository.RestaurantTableRepository;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AnalyticsService {

    private static final int MONEY_SCALE = 3;
    private static final int DEFAULT_BEST_SELLING_LIMIT = 10;
    /** Daypart buckets in display order — must match the CASE in {@code OrderRepository.daypartBreakdown}. */
    private static final List<String> DAYPARTS = List.of("MORNING", "MIDDAY", "AFTERNOON", "EVENING", "LATE");

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final BranchRepository branchRepository;
    private final BranchService branchService;
    private final MenuItemRepository menuItemRepository;
    private final AccessGuard accessGuard;
    private final PaymentRepository paymentRepository;
    private final UserRepository userRepository;
    private final RestaurantTableRepository tableRepository;
    private final RestaurantRepository restaurantRepository;

    public AnalyticsService(OrderRepository orderRepository,
                            OrderItemRepository orderItemRepository,
                            BranchRepository branchRepository,
                            BranchService branchService,
                            MenuItemRepository menuItemRepository,
                            AccessGuard accessGuard,
                            PaymentRepository paymentRepository,
                            UserRepository userRepository,
                            RestaurantTableRepository tableRepository,
                            RestaurantRepository restaurantRepository) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.branchRepository = branchRepository;
        this.branchService = branchService;
        this.menuItemRepository = menuItemRepository;
        this.accessGuard = accessGuard;
        this.paymentRepository = paymentRepository;
        this.userRepository = userRepository;
        this.tableRepository = tableRepository;
        this.restaurantRepository = restaurantRepository;
    }

    @Transactional(readOnly = true)
    public List<PaymentMethodRevenueResponse> paymentMethodRevenue(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        return paymentRepository.revenueByMethod(restaurantId, branchScope, from, to).stream()
                .map(row -> new PaymentMethodRevenueResponse(
                        String.valueOf(row[0]),
                        ((Number) row[1]).longValue(),
                        (BigDecimal) row[2]))
                .toList();
    }

    /**
     * Resolves the branch scope for analytics queries. Branch-scoped staff are pinned
     * to their own branch (the requested id is ignored). Restaurant-wide users (owner /
     * manager) may pass a branch id to filter to one branch, or {@code null} to see all
     * branches. Mirrors {@link com.cafeqr.orders.OrderService#resolveBranchScope}.
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

    @Transactional(readOnly = true)
    public AnalyticsSummaryResponse summary(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);

        Map<OrderStatus, Long> counts = statusCounts(restaurantId, branchScope, from, to);
        // "Orders" means valid orders — exclude declined/cancelled so the headline reconciles
        // with the trend and daypart (which already drop them). The status breakdown still
        // surfaces cancellations via the declined/cancelled fields below.
        long total = counts.entrySet().stream()
                .filter(e -> e.getKey() != OrderStatus.DECLINED && e.getKey() != OrderStatus.CANCELLED)
                .mapToLong(Map.Entry::getValue).sum();

        BigDecimal revenue = orderRepository.sumTotalByStatus(
                restaurantId, branchScope, OrderStatus.COMPLETED, from, to);
        long completed = counts.getOrDefault(OrderStatus.COMPLETED, 0L);
        BigDecimal aov = completed > 0
                ? revenue.divide(BigDecimal.valueOf(completed), MONEY_SCALE, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(MONEY_SCALE, RoundingMode.HALF_UP);

        return new AnalyticsSummaryResponse(
                from, to, total,
                counts.getOrDefault(OrderStatus.PENDING, 0L),
                counts.getOrDefault(OrderStatus.ACCEPTED, 0L),
                counts.getOrDefault(OrderStatus.DECLINED, 0L),
                counts.getOrDefault(OrderStatus.PREPARING, 0L),
                counts.getOrDefault(OrderStatus.READY, 0L),
                completed,
                counts.getOrDefault(OrderStatus.CANCELLED, 0L),
                revenue,
                aov,
                bestSellingScoped(restaurantId, branchScope, from, to, DEFAULT_BEST_SELLING_LIMIT),
                busiestHours(restaurantId, branchScope, from, to));
    }

    @Transactional(readOnly = true)
    public List<BestSellingItem> bestSelling(Instant from, Instant to, Long branchId, int limit) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        return bestSellingScoped(restaurantId, branchScope, from, to, limit);
    }

    /** Pre-resolved scope overload — avoids re-calling resolveBranchScope (and its DB lookup). */
    private List<BestSellingItem> bestSellingScoped(Long restaurantId, Long branchScope,
                                                     Instant from, Instant to, int limit) {
        return orderItemRepository.bestSelling(restaurantId, branchScope, from, to).stream()
                .limit(limit)
                .map(row -> new BestSellingItem(
                        row[0] == null ? null : ((Number) row[0]).longValue(),
                        (String) row[1],
                        (String) row[2],
                        ((Number) row[3]).longValue(),
                        (BigDecimal) row[4]))
                .toList();
    }

    /**
     * Per-day order count and completed revenue for the analytics trend chart, bucketed
     * by the cafés' timezone. Days with no orders are filled with zeros so the series is
     * continuous across the requested range.
     */
    @Transactional(readOnly = true)
    public List<DailyPoint> dailyBreakdown(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);

        Map<LocalDate, DailyPoint> byDay = new HashMap<>();
        for (Object[] row : orderRepository.dailyBreakdown(restaurantId, branchScope, from, to)) {
            java.sql.Date sqlDate = (java.sql.Date) row[0];
            LocalDate day = sqlDate.toLocalDate();
            long orders = ((Number) row[1]).longValue();
            BigDecimal revenue = row[2] == null ? BigDecimal.ZERO : (BigDecimal) row[2];
            byDay.put(day, new DailyPoint(day, orders, revenue));
        }
        // Fill gaps so the chart has a point for every day in the range.
        List<DailyPoint> out = new ArrayList<>();
        for (LocalDate d = from.atZone(TimeZones.CAFES).toLocalDate();
             !d.isAfter(to.atZone(TimeZones.CAFES).toLocalDate().minusDays(1));
             d = d.plusDays(1)) {
            out.add(byDay.getOrDefault(d, new DailyPoint(d, 0L, BigDecimal.ZERO)));
        }
        return out;
    }

    /**
     * Orders + completed revenue grouped into parts of the day (café timezone). Always returns
     * all five dayparts in display order, zero-filled for empty buckets, so the frontend renders
     * a stable row set regardless of which times had traffic.
     */
    @Transactional(readOnly = true)
    public List<DaypartPoint> daypartBreakdown(Instant from, Instant to, Long branchId) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);

        Map<String, DaypartPoint> byPart = new HashMap<>();
        for (Object[] row : orderRepository.daypartBreakdown(restaurantId, branchScope, from, to)) {
            String part = (String) row[0];
            long orders = ((Number) row[1]).longValue();
            BigDecimal revenue = row[2] == null ? BigDecimal.ZERO : (BigDecimal) row[2];
            byPart.put(part, new DaypartPoint(part, orders, revenue));
        }
        List<DaypartPoint> out = new ArrayList<>(DAYPARTS.size());
        for (String part : DAYPARTS) {
            out.add(byPart.getOrDefault(part, new DaypartPoint(part, 0L, BigDecimal.ZERO)));
        }
        return out;
    }

    /**
     * Per-restaurant snapshot for the platform admin console — five grouped scans
     * (orders, branches, menu items, owners, tables) merged in memory, regardless of
     * restaurant count.
     */
    @Transactional(readOnly = true)
    public List<RestaurantStatsResponse> platformRestaurantStats() {
        Instant todayStart = LocalDate.now(TimeZones.CAFES).atStartOfDay(TimeZones.CAFES).toInstant();
        Instant now = Instant.now();
        Instant windowStart = now.minus(Duration.ofDays(30));
        Instant weekStart = now.minus(Duration.ofDays(7));
        Instant prevWeekStart = now.minus(Duration.ofDays(14));

        Map<Long, Long> branches = countMap(branchRepository.countPerRestaurant());
        Map<Long, Long> menuItems = countMap(menuItemRepository.countPerRestaurant());
        Map<Long, Long> owners = countMap(userRepository.countOwnersPerRestaurant());
        Map<Long, Long> tables = countMap(tableRepository.countPerRestaurant());
        List<Object[]> orderRows = orderRepository.platformOrderStats(
                windowStart, todayStart, weekStart, prevWeekStart);

        // A café that has anything at all — a branch, an item, an owner, a QR table —
        // must appear, even with zero orders. Those are exactly the ones needing attention.
        Set<Long> ids = new HashSet<>(branches.keySet());
        ids.addAll(menuItems.keySet());
        ids.addAll(owners.keySet());
        ids.addAll(tables.keySet());

        Map<Long, RestaurantStatsResponse> stats = new HashMap<>();
        for (Object[] row : orderRows) {
            Long restaurantId = ((Number) row[0]).longValue();
            ids.remove(restaurantId);
            stats.put(restaurantId, new RestaurantStatsResponse(
                    restaurantId,
                    ((Number) row[3]).longValue(),
                    ((Number) row[1]).longValue(),
                    (BigDecimal) row[2],
                    ((Number) row[4]).longValue(),
                    toInstant(row[5]),
                    branches.getOrDefault(restaurantId, 0L),
                    menuItems.getOrDefault(restaurantId, 0L),
                    owners.getOrDefault(restaurantId, 0L),
                    tables.getOrDefault(restaurantId, 0L),
                    ((Number) row[6]).longValue(),
                    ((Number) row[7]).longValue()));
        }
        for (Long restaurantId : ids) {
            stats.put(restaurantId, RestaurantStatsResponse.empty(
                    restaurantId,
                    branches.getOrDefault(restaurantId, 0L),
                    menuItems.getOrDefault(restaurantId, 0L),
                    owners.getOrDefault(restaurantId, 0L),
                    tables.getOrDefault(restaurantId, 0L)));
        }
        return List.copyOf(stats.values());
    }

    /**
     * Daily platform totals for the last {@code days} days — one row per day, gaps filled with
     * zeros so a chart doesn't quietly close up the days nobody ordered.
     */
    @Transactional(readOnly = true)
    public List<PlatformTrendPoint> platformTrend(int days) {
        LocalDate today = LocalDate.now(TimeZones.CAFES);
        LocalDate from = today.minusDays(days - 1L);
        Instant fromInstant = from.atStartOfDay(TimeZones.CAFES).toInstant();

        Map<LocalDate, Object[]> orders = new HashMap<>();
        for (Object[] row : orderRepository.platformDailyTotals(fromInstant, TimeZones.CAFES.getId())) {
            orders.put(toLocalDate(row[0]), row);
        }
        Map<LocalDate, Long> signups = new HashMap<>();
        for (Object[] row : restaurantRepository.dailySignups(fromInstant, TimeZones.CAFES.getId())) {
            signups.put(toLocalDate(row[0]), ((Number) row[1]).longValue());
        }

        List<PlatformTrendPoint> points = new ArrayList<>(days);
        for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
            Object[] row = orders.get(day);
            points.add(new PlatformTrendPoint(
                    day,
                    row == null ? 0L : ((Number) row[1]).longValue(),
                    row == null ? BigDecimal.ZERO : (BigDecimal) row[2],
                    signups.getOrDefault(day, 0L)));
        }
        return points;
    }

    /** Native {@code ::date} values arrive as {@link java.sql.Date} or already-typed dates. */
    private static LocalDate toLocalDate(Object value) {
        return switch (value) {
            case LocalDate d -> d;
            case java.sql.Date d -> d.toLocalDate();
            default -> throw new IllegalStateException("Unexpected date type: " + value.getClass());
        };
    }

    /** Native timestamptz values arrive as different temporal types depending on the JDBC mapping. */
    private static Instant toInstant(Object value) {
        return switch (value) {
            case null -> null;
            case Instant i -> i;
            case java.sql.Timestamp ts -> ts.toInstant();
            case java.time.OffsetDateTime odt -> odt.toInstant();
            default -> throw new IllegalStateException("Unexpected timestamp type: " + value.getClass());
        };
    }

    private static Map<Long, Long> countMap(List<Object[]> rows) {
        Map<Long, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return map;
    }

    private Map<OrderStatus, Long> statusCounts(Long restaurantId, Long branchId, Instant from, Instant to) {
        Map<OrderStatus, Long> counts = new EnumMap<>(OrderStatus.class);
        for (Object[] row : orderRepository.countByStatus(restaurantId, branchId, from, to)) {
            counts.put((OrderStatus) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    private List<HourlyCount> busiestHours(Long restaurantId, Long branchId, Instant from, Instant to) {
        return orderRepository.busiestHours(restaurantId, branchId, from, to).stream()
                .map(row -> new HourlyCount(((Number) row[0]).intValue(), ((Number) row[1]).longValue()))
                .toList();
    }
}
