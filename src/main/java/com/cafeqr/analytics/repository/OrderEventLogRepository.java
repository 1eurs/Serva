package com.cafeqr.analytics.repository;

import com.cafeqr.analytics.domain.OrderEventLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OrderEventLogRepository extends JpaRepository<OrderEventLog, Long> {

    /**
     * Per-staff transition stats for the leaderboard. Rows:
     * {@code [actorUserId, actorName, actorNameEn, actorNameAr, accepted, declined, completed,
     * avgAcceptSeconds]}. The two bilingual names come from {@code users}, not the event snapshot,
     * so a staff member who has since been given their other-script name shows it here too.
     * Latency is seconds from order creation to the staff member's ACCEPTED event.
     * When {@code branchId} is null, stats span every branch in the restaurant.
     */
    @Query(value = """
            SELECT oe.actor_user_id,
                   MAX(oe.actor_name) AS actor_name,
                   MAX(u.full_name_en) AS actor_name_en,
                   MAX(u.full_name_ar) AS actor_name_ar,
                   COUNT(*) FILTER (WHERE oe.event_type = 'ACCEPTED')  AS accepted,
                   COUNT(*) FILTER (WHERE oe.event_type IN ('DECLINED', 'CANCELLED')) AS declined,
                   COUNT(*) FILTER (WHERE oe.event_type = 'COMPLETED') AS completed,
                   AVG(EXTRACT(EPOCH FROM (oe.created_at - o.created_at)))
                       FILTER (WHERE oe.event_type = 'ACCEPTED')       AS avg_accept_seconds
            FROM order_events oe
            JOIN orders o ON o.id = oe.order_id
            LEFT JOIN users u ON u.id = oe.actor_user_id
            WHERE oe.restaurant_id = :restaurantId
              AND (:branchId IS NULL OR o.branch_id = :branchId)
              AND oe.actor_user_id IS NOT NULL
              AND oe.created_at >= :from AND oe.created_at < :to
            GROUP BY oe.actor_user_id
            ORDER BY accepted DESC
            """, nativeQuery = true)
    List<Object[]> staffPerformance(@Param("restaurantId") Long restaurantId,
                                    @Param("branchId") Long branchId,
                                    @Param("from") Instant from,
                                    @Param("to") Instant to);

    /**
     * Average accept latency (seconds) per restaurant — for anonymous cross-café
     * benchmarking. Rows: {@code [restaurantId, avgAcceptSeconds]}.
     */
    @Query(value = """
            SELECT oe.restaurant_id,
                   AVG(EXTRACT(EPOCH FROM (oe.created_at - o.created_at))) AS avg_accept_seconds
            FROM order_events oe
            JOIN orders o ON o.id = oe.order_id
            WHERE oe.event_type = 'ACCEPTED'
              AND oe.actor_user_id IS NOT NULL
              AND oe.created_at >= :from AND oe.created_at < :to
            GROUP BY oe.restaurant_id
            """, nativeQuery = true)
    List<Object[]> acceptLatencyPerRestaurant(@Param("from") Instant from,
                                              @Param("to") Instant to);

    /**
     * Average fulfillment-stage durations (seconds) for one restaurant in the window. Per
     * order we pivot the first timestamp of each stage from the event log, then average the
     * stage gaps across orders — AVG ignores nulls, so each stage reflects only the orders
     * that reached both of its ends. Returns a single row:
     * {@code [acceptSecs, prepSecs, handoffSecs, toReadySecs, toCompleteSecs, sampleOrders]}.
     */
    @Query(value = """
            SELECT AVG(EXTRACT(EPOCH FROM (accepted_at  - placed_at)))    AS accept_secs,
                   AVG(EXTRACT(EPOCH FROM (ready_at     - accepted_at)))  AS prep_secs,
                   AVG(EXTRACT(EPOCH FROM (completed_at - ready_at)))     AS handoff_secs,
                   AVG(EXTRACT(EPOCH FROM (ready_at     - placed_at)))    AS to_ready_secs,
                   AVG(EXTRACT(EPOCH FROM (completed_at - placed_at)))    AS to_complete_secs,
                   COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)        AS sample_orders
            FROM (
                SELECT o.id,
                       o.created_at                                                    AS placed_at,
                       MIN(oe.created_at) FILTER (WHERE oe.event_type = 'ACCEPTED')    AS accepted_at,
                       MIN(oe.created_at) FILTER (WHERE oe.event_type = 'READY')       AS ready_at,
                       MIN(oe.created_at) FILTER (WHERE oe.event_type = 'COMPLETED')   AS completed_at
                FROM orders o
                JOIN order_events oe ON oe.order_id = o.id
                WHERE o.restaurant_id = :restaurantId
                  AND (:branchId IS NULL OR o.branch_id = :branchId)
                  AND o.created_at >= :from AND o.created_at < :to
                  AND o.status NOT IN ('DECLINED','CANCELLED')
                GROUP BY o.id, o.created_at
            ) stages
            """, nativeQuery = true)
    List<Object[]> kitchenTiming(@Param("restaurantId") Long restaurantId,
                                 @Param("branchId") Long branchId,
                                 @Param("from") Instant from,
                                 @Param("to") Instant to);
}
