package com.cafeqr.orders.repository;

import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByTrackingToken(String trackingToken);

    @EntityGraph(attributePaths = "items")
    Optional<Order> findWithItemsById(Long id);

    @EntityGraph(attributePaths = "items")
    Optional<Order> findWithItemsByTrackingToken(String trackingToken);

    @Query(value = "SELECT nextval('order_number_seq')", nativeQuery = true)
    long nextOrderNumber();

    /**
     * Atomically bumps (or creates) the ticket counter for one branch's business day and returns
     * the new value. The upsert's row lock serializes concurrent order creation for the same
     * branch/day, so two tickets can never come out with the same number.
     */
    @Query(value = """
            INSERT INTO branch_daily_counters (branch_id, business_date, last_number)
            VALUES (:branchId, :businessDate, 1)
            ON CONFLICT (branch_id, business_date)
            DO UPDATE SET last_number = branch_daily_counters.last_number + 1
            RETURNING last_number
            """, nativeQuery = true)
    int nextDailyNumber(@Param("branchId") Long branchId, @Param("businessDate") LocalDate businessDate);

    // -------- returning customers --------

    @EntityGraph(attributePaths = "items")
    Optional<Order> findFirstByRestaurantIdAndCustomerPhoneAndStatusNotInOrderByCreatedAtDesc(
            Long restaurantId, String customerPhone, Collection<OrderStatus> excludedStatuses);

    long countByRestaurantIdAndCustomerPhoneAndStatusNotIn(
            Long restaurantId, String customerPhone, Collection<OrderStatus> excludedStatuses);

    @Query("""
            SELECT o FROM Order o
            WHERE (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND (:status IS NULL OR o.status = :status)
            ORDER BY o.createdAt DESC
            """)
    Page<Order> search(@Param("restaurantId") Long restaurantId,
                       @Param("branchId") Long branchId,
                       @Param("status") OrderStatus status,
                       Pageable pageable);

    @EntityGraph(attributePaths = "items")
    @Query("""
            SELECT o FROM Order o
            WHERE (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND o.status IN :statuses
            ORDER BY o.createdAt ASC
            """)
    List<Order> findLive(@Param("restaurantId") Long restaurantId,
                         @Param("branchId") Long branchId,
                         @Param("statuses") List<OrderStatus> statuses);

    /** Counter-mode sweep: paid orders that went READY before {@code cutoff} in branches running counter mode. */
    @Query("""
            SELECT o.id FROM Order o
            WHERE o.status = com.cafeqr.orders.domain.OrderStatus.READY
              AND o.paymentStatus = com.cafeqr.orders.domain.PaymentStatus.PAID
              AND o.readyAt < :cutoff
              AND o.branchId IN (SELECT b.id FROM Branch b WHERE b.counterMode = true)
            """)
    List<Long> findCounterModeHandedOver(@Param("cutoff") Instant cutoff);

    // -------- analytics --------

    @Query("""
            SELECT o.status, COUNT(o) FROM Order o
            WHERE (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND o.createdAt >= :from AND o.createdAt < :to
            GROUP BY o.status
            """)
    List<Object[]> countByStatus(@Param("restaurantId") Long restaurantId,
                                 @Param("branchId") Long branchId,
                                 @Param("from") Instant from,
                                 @Param("to") Instant to);

    @Query("""
            SELECT COALESCE(SUM(o.total), 0) FROM Order o
            WHERE (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND o.status = :status
              AND o.createdAt >= :from AND o.createdAt < :to
            """)
    java.math.BigDecimal sumTotalByStatus(@Param("restaurantId") Long restaurantId,
                                          @Param("branchId") Long branchId,
                                          @Param("status") OrderStatus status,
                                          @Param("from") Instant from,
                                          @Param("to") Instant to);

    @Query(value = """
            SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Muscat') AS hour, COUNT(*) AS cnt
            FROM orders
            WHERE (:restaurantId IS NULL OR restaurant_id = :restaurantId)
              AND (:branchId IS NULL OR branch_id = :branchId)
              AND status NOT IN ('DECLINED', 'CANCELLED')
              AND created_at >= :from AND created_at < :to
            GROUP BY hour
            ORDER BY cnt DESC
            """, nativeQuery = true)
    List<Object[]> busiestHours(@Param("restaurantId") Long restaurantId,
                                @Param("branchId") Long branchId,
                                @Param("from") Instant from,
                                @Param("to") Instant to);

    /**
     * Per-day order count (non-cancelled/declined) and completed revenue, bucketed by
     * the cafés' timezone. Rows: {@code [day(LocalDate), orders, revenue(BigDecimal)]}.
     * The service fills missing days with zeros so the trend series is continuous.
     */
    @Query(value = """
            SELECT (created_at AT TIME ZONE 'Asia/Muscat')::date                     AS day,
                   COUNT(*) FILTER (WHERE status NOT IN ('DECLINED','CANCELLED'))    AS orders,
                   COALESCE(SUM(total) FILTER (WHERE status = 'COMPLETED'), 0)       AS revenue
            FROM orders
            WHERE (:restaurantId IS NULL OR restaurant_id = :restaurantId)
              AND (:branchId IS NULL OR branch_id = :branchId)
              AND created_at >= :from AND created_at < :to
            GROUP BY day
            ORDER BY day
            """, nativeQuery = true)
    List<Object[]> dailyBreakdown(@Param("restaurantId") Long restaurantId,
                                  @Param("branchId") Long branchId,
                                  @Param("from") Instant from,
                                  @Param("to") Instant to);

    /**
     * Orders + completed revenue bucketed by part of the day (café timezone). Rows:
     * {@code [daypart(String), orders, revenue(BigDecimal)]} — one per non-empty bucket; the
     * service fills the rest. Same semantics as {@link #dailyBreakdown}: orders exclude
     * declined/cancelled, revenue counts completed only.
     */
    @Query(value = """
            SELECT CASE
                       WHEN h >= 6  AND h < 11 THEN 'MORNING'
                       WHEN h >= 11 AND h < 14 THEN 'MIDDAY'
                       WHEN h >= 14 AND h < 17 THEN 'AFTERNOON'
                       WHEN h >= 17 AND h < 22 THEN 'EVENING'
                       ELSE 'LATE'
                   END                                                            AS daypart,
                   COUNT(*) FILTER (WHERE status NOT IN ('DECLINED','CANCELLED'))  AS orders,
                   COALESCE(SUM(total) FILTER (WHERE status = 'COMPLETED'), 0)     AS revenue
            FROM (
                SELECT status, total,
                       EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Muscat') AS h
                FROM orders
                WHERE (:restaurantId IS NULL OR restaurant_id = :restaurantId)
                  AND (:branchId IS NULL OR branch_id = :branchId)
                  AND created_at >= :from AND created_at < :to
            ) hours
            GROUP BY daypart
            """, nativeQuery = true)
    List<Object[]> daypartBreakdown(@Param("restaurantId") Long restaurantId,
                                    @Param("branchId") Long branchId,
                                    @Param("from") Instant from,
                                    @Param("to") Instant to);

    /**
     * Platform-wide per-restaurant order stats for the admin console, one grouped scan:
     * {@code [restaurantId, ordersInWindow, completedRevenueInWindow, ordersToday, ordersTotal,
     * lastOrderAt, orders7d, ordersPrev7d]}.
     * Declined/cancelled orders are excluded from counts; revenue counts COMPLETED only.
     *
     * <p>The last two columns are the churn radar: this week against the week before it. A café
     * whose volume halves is in trouble long before it stops ordering entirely, and a single
     * "last order was N days ago" number can't see that coming.
     */
    @Query(value = """
            SELECT o.restaurant_id,
                   COUNT(*) FILTER (WHERE o.created_at >= :from
                                      AND o.status NOT IN ('DECLINED','CANCELLED'))           AS orders_window,
                   COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= :from
                                                   AND o.status = 'COMPLETED'), 0)            AS revenue_window,
                   COUNT(*) FILTER (WHERE o.created_at >= :today
                                      AND o.status NOT IN ('DECLINED','CANCELLED'))           AS orders_today,
                   COUNT(*) FILTER (WHERE o.status NOT IN ('DECLINED','CANCELLED'))           AS orders_total,
                   MAX(o.created_at)                                                          AS last_order_at,
                   COUNT(*) FILTER (WHERE o.created_at >= :week
                                      AND o.status NOT IN ('DECLINED','CANCELLED'))           AS orders_7d,
                   COUNT(*) FILTER (WHERE o.created_at >= :prevWeek AND o.created_at < :week
                                      AND o.status NOT IN ('DECLINED','CANCELLED'))           AS orders_prev_7d
            FROM orders o
            GROUP BY o.restaurant_id
            """, nativeQuery = true)
    List<Object[]> platformOrderStats(@Param("from") Instant from,
                                      @Param("today") Instant today,
                                      @Param("week") Instant week,
                                      @Param("prevWeek") Instant prevWeek);

    /**
     * Daily platform totals since {@code from}: {@code [day, orders, completedRevenue]}, in the
     * cafés' own timezone so a "day" means the day a café actually worked, not a UTC slice of it.
     */
    @Query(value = """
            SELECT (o.created_at AT TIME ZONE :tz)::date                                      AS day,
                   COUNT(*) FILTER (WHERE o.status NOT IN ('DECLINED','CANCELLED'))           AS orders,
                   COALESCE(SUM(o.total) FILTER (WHERE o.status = 'COMPLETED'), 0)            AS revenue
            FROM orders o
            WHERE o.created_at >= :from
            GROUP BY 1
            ORDER BY 1
            """, nativeQuery = true)
    List<Object[]> platformDailyTotals(@Param("from") Instant from, @Param("tz") String timezone);

    /** Orders + revenue grouped per (table, type) for a branch since {@code from} — for QR activity. */
    @Query("""
            SELECT o.tableId, o.orderType, COUNT(o), COALESCE(SUM(o.total), 0) FROM Order o
            WHERE o.restaurantId = :restaurantId
              AND o.branchId = :branchId
              AND o.status NOT IN :excluded
              AND o.createdAt >= :from AND o.createdAt < :to
            GROUP BY o.tableId, o.orderType
            """)
    List<Object[]> qrActivityToday(@Param("restaurantId") Long restaurantId,
                                   @Param("branchId") Long branchId,
                                   @Param("excluded") List<OrderStatus> excluded,
                                   @Param("from") Instant from,
                                   @Param("to") Instant to);

    // -------- Pro analytics --------

    /**
     * Demand forecast: total orders per (ISO weekday, hour) in the window. The service
     * divides by the number of weeks in the window to get the average expected orders per
     * slot. Rows: {@code [dayOfWeek(1=Mon..7=Sun), hour(0..23), count]}.
     */
    @Query(value = """
            SELECT EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Asia/Muscat') AS dow,
                   EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Muscat')    AS hour,
                   COUNT(*)                                                    AS cnt
            FROM orders
            WHERE restaurant_id = :restaurantId
              AND (:branchId IS NULL OR branch_id = :branchId)
              AND status NOT IN ('DECLINED', 'CANCELLED')
              AND created_at >= :from AND created_at < :to
            GROUP BY dow, hour
            ORDER BY dow, hour
            """, nativeQuery = true)
    List<Object[]> demandByWeekdayHour(@Param("restaurantId") Long restaurantId,
                                       @Param("branchId") Long branchId,
                                       @Param("from") Instant from,
                                       @Param("to") Instant to);

    /**
     * Per-restaurant average order value (completed orders) for anonymous cross-café
     * benchmarking. Rows: {@code [restaurantId, aov, completedOrders]}.
     */
    @Query(value = """
            SELECT restaurant_id,
                   AVG(total) FILTER (WHERE status = 'COMPLETED')           AS aov,
                   COUNT(*) FILTER (WHERE status = 'COMPLETED')            AS completed_orders,
                   COUNT(*) FILTER (WHERE status NOT IN ('DECLINED','CANCELLED')) AS all_orders
            FROM orders
            WHERE created_at >= :from AND created_at < :to
              AND status NOT IN ('DECLINED', 'CANCELLED')
            GROUP BY restaurant_id
            """, nativeQuery = true)
    List<Object[]> aovPerRestaurant(@Param("from") Instant from, @Param("to") Instant to);
}
