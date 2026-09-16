package com.cafeqr.customers.repository;

import com.cafeqr.customers.domain.CustomerProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CustomerProfileRepository extends JpaRepository<CustomerProfile, Long> {

    Optional<CustomerProfile> findByRestaurantIdAndDeviceToken(Long restaurantId, String deviceToken);

    @Query(value = """
            SELECT o.customer_phone,
                   MAX(COALESCE(NULLIF(o.customer_name, ''), '—')) AS customer_name,
                   COUNT(DISTINCT o.id)                            AS order_count,
                   MAX(o.created_at)                               AS last_order_at
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND (:search = '' OR LOWER(COALESCE(o.customer_name, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR o.customer_phone LIKE CONCAT('%', :search, '%'))
            GROUP BY o.customer_phone
            ORDER BY last_order_at DESC
            """,
            countQuery = """
            SELECT COUNT(DISTINCT o.customer_phone)
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND (:search = '' OR LOWER(COALESCE(o.customer_name, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR o.customer_phone LIKE CONCAT('%', :search, '%'))
            """, nativeQuery = true)
    Page<Object[]> customerDirectory(@Param("restaurantId") Long restaurantId,
                                     @Param("search") String search,
                                     Pageable pageable);

    @Query(value = """
            SELECT o.customer_phone,
                   MAX(COALESCE(NULLIF(o.customer_name, ''), '—')) AS customer_name,
                   COUNT(DISTINCT o.id)                            AS order_count,
                   MAX(o.created_at)                               AS last_order_at
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.branch_id = :branchId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND (:search = '' OR LOWER(COALESCE(o.customer_name, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR o.customer_phone LIKE CONCAT('%', :search, '%'))
            GROUP BY o.customer_phone
            ORDER BY last_order_at DESC
            """,
            countQuery = """
            SELECT COUNT(DISTINCT o.customer_phone)
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.branch_id = :branchId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND (:search = '' OR LOWER(COALESCE(o.customer_name, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR o.customer_phone LIKE CONCAT('%', :search, '%'))
            """, nativeQuery = true)
    Page<Object[]> customerDirectoryByBranch(@Param("restaurantId") Long restaurantId,
                                             @Param("branchId") Long branchId,
                                             @Param("search") String search,
                                             Pageable pageable);

    /**
     * Time-decayed personal item frequency ("your usual"), the TIFU-style scoring that simple
     * repeat-consumption literature shows is near-unbeatable for food reorders: each ordered unit
     * counts {@code 0.9^age_in_weeks}, so favorites adapt when tastes change. Scans only this
     * customer's history (idx_orders_restaurant_phone), no training or background jobs.
     *
     * <p>Rows: {@code [menuItemId, nameEn, nameAr, totalQuantity, ordersContaining, score]}.
     */
    @Query(value = """
            SELECT oi.menu_item_id,
                   MAX(oi.name_en_snapshot)  AS name_en,
                   MAX(oi.name_ar_snapshot)  AS name_ar,
                   SUM(oi.quantity)          AS total_qty,
                   COUNT(DISTINCT o.id)      AS orders_containing,
                   SUM(oi.quantity * EXP(-0.10536
                       * GREATEST(EXTRACT(EPOCH FROM (NOW() - o.created_at)), 0) / 604800.0)) AS score
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.restaurant_id = :restaurantId
              AND o.customer_phone = :phone
              AND oi.menu_item_id IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
            GROUP BY oi.menu_item_id
            ORDER BY score DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> favoriteItems(@Param("restaurantId") Long restaurantId,
                                 @Param("phone") String phone,
                                 @Param("limit") int limit);

    /**
     * Restaurant-wide customer-base aggregate (one row) for the analytics summary card:
     * {@code [totalCustomers, repeatCustomers, avgOrders, totalOrders, newCustomers, activeCustomers]}.
     * Repeat = 2+ lifetime orders; new/active use the rolling {@code cutoff} (joined / last ordered since).
     */
    @Query(value = """
            SELECT COUNT(*)                                          AS total_customers,
                   COUNT(*) FILTER (WHERE order_count >= 2)          AS repeat_customers,
                   COALESCE(AVG(order_count), 0)                     AS avg_orders,
                   COALESCE(SUM(order_count), 0)                     AS total_orders,
                   COUNT(*) FILTER (WHERE created_at >= :cutoff)     AS new_customers,
                   COUNT(*) FILTER (WHERE last_order_at >= :cutoff)  AS active_customers
            FROM customer_profiles
            WHERE restaurant_id = :restaurantId
            """, nativeQuery = true)
    List<Object[]> customerBaseStats(@Param("restaurantId") Long restaurantId,
                                     @Param("cutoff") Instant cutoff);

    /**
     * Customer-base aggregate scoped to a single branch — counts each customer's orders at that
     * branch only (profile counters are restaurant-wide, so we derive per-branch counts from
     * orders, like {@code topRegularsByBranch}). For a branch, "new"/"active" mean first/last
     * ordered <em>at this branch</em> since {@code cutoff}. Same row shape as {@link #customerBaseStats}.
     */
    @Query(value = """
            SELECT COUNT(*)                                            AS total_customers,
                   COUNT(*) FILTER (WHERE branch_orders >= 2)          AS repeat_customers,
                   COALESCE(AVG(branch_orders), 0)                     AS avg_orders,
                   COALESCE(SUM(branch_orders), 0)                     AS total_orders,
                   COUNT(*) FILTER (WHERE first_order_at >= :cutoff)   AS new_customers,
                   COUNT(*) FILTER (WHERE last_order_at  >= :cutoff)   AS active_customers
            FROM (
                SELECT cp.id,
                       COUNT(DISTINCT o.id) AS branch_orders,
                       MIN(o.created_at)    AS first_order_at,
                       MAX(o.created_at)    AS last_order_at
                FROM customer_profiles cp
                JOIN orders o ON o.restaurant_id = cp.restaurant_id
                             AND o.customer_phone = cp.customer_phone
                             AND o.branch_id = :branchId
                             AND o.status NOT IN ('DECLINED', 'CANCELLED')
                WHERE cp.restaurant_id = :restaurantId
                GROUP BY cp.id
            ) per_customer
            """, nativeQuery = true)
    List<Object[]> customerBaseStatsByBranch(@Param("restaurantId") Long restaurantId,
                                             @Param("branchId") Long branchId,
                                             @Param("cutoff") Instant cutoff);

    /**
     * Top regulars by order count. Counts real orders grouped by <em>phone</em>, not the
     * per-device {@code customer_profiles.order_count} — a customer who orders from a fresh
     * device each visit (private tab, cleared storage, a different phone) would otherwise
     * shatter into many one-order profiles and never rank. Mirrors {@link #customerDirectory}.
     * Rows: {@code [id, name, phone, orderCount, lastOrderAt]} ({@code id} = MIN(order id), a
     * stable per-phone key for the UI, not a profile id).
     */
    @Query(value = """
            SELECT MIN(o.id)                                                AS id,
                   MAX(COALESCE(NULLIF(o.customer_name, ''), '(unknown)'))  AS name,
                   o.customer_phone                                         AS phone,
                   COUNT(DISTINCT o.id)                                     AS order_count,
                   MAX(o.created_at)                                        AS last_order_at
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
            GROUP BY o.customer_phone
            HAVING COUNT(DISTINCT o.id) >= :minOrders
            ORDER BY order_count DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> topRegulars(@Param("restaurantId") Long restaurantId,
                               @Param("minOrders") int minOrders,
                               @Param("limit") int limit);

    /** At-risk regulars: ordered before but haven't returned since {@code cutoff}. Grouped by
     *  phone, same as {@link #topRegulars}. Rows: {@code [id, name, phone, orderCount, lastOrderAt]}. */
    @Query(value = """
            SELECT MIN(o.id)                                                AS id,
                   MAX(COALESCE(NULLIF(o.customer_name, ''), '(unknown)'))  AS name,
                   o.customer_phone                                         AS phone,
                   COUNT(DISTINCT o.id)                                     AS order_count,
                   MAX(o.created_at)                                        AS last_order_at
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
            GROUP BY o.customer_phone
            HAVING COUNT(DISTINCT o.id) >= :minOrders
               AND MAX(o.created_at) < :cutoff
            ORDER BY last_order_at ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> atRiskCustomers(@Param("restaurantId") Long restaurantId,
                                   @Param("minOrders") int minOrders,
                                   @Param("cutoff") Instant cutoff,
                                   @Param("limit") int limit);

    /**
     * Top regulars scoped to a single branch. Counts only orders at that branch so the
     * numbers reflect loyalty to this location, not the restaurant chain as a whole. Grouped
     * by phone (not profile id) so one customer is one row regardless of how many devices
     * they've ordered from. Rows: {@code [id, name, phone, orderCount, lastOrderAt]}
     * ({@code id} = MIN(order id), a stable per-phone key).
     */
    @Query(value = """
            SELECT MIN(o.id)                                                AS id,
                   MAX(COALESCE(NULLIF(o.customer_name, ''), '(unknown)'))  AS name,
                   o.customer_phone                                         AS phone,
                   COUNT(DISTINCT o.id)                                     AS order_count,
                   MAX(o.created_at)                                        AS last_order_at
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.branch_id = :branchId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
            GROUP BY o.customer_phone
            HAVING COUNT(DISTINCT o.id) >= :minOrders
            ORDER BY order_count DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> topRegularsByBranch(@Param("restaurantId") Long restaurantId,
                                       @Param("branchId") Long branchId,
                                       @Param("minOrders") int minOrders,
                                       @Param("limit") int limit);

    /** At-risk regulars scoped to a single branch. Grouped by phone, same as
     *  {@link #topRegularsByBranch}. Rows: {@code [id, name, phone, orderCount, lastOrderAt]}. */
    @Query(value = """
            SELECT MIN(o.id)                                                AS id,
                   MAX(COALESCE(NULLIF(o.customer_name, ''), '(unknown)'))  AS name,
                   o.customer_phone                                         AS phone,
                   COUNT(DISTINCT o.id)                                     AS order_count,
                   MAX(o.created_at)                                        AS last_order_at
            FROM orders o
            WHERE o.restaurant_id = :restaurantId
              AND o.branch_id = :branchId
              AND o.customer_phone IS NOT NULL
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
            GROUP BY o.customer_phone
            HAVING COUNT(DISTINCT o.id) >= :minOrders
               AND MAX(o.created_at) < :cutoff
            ORDER BY last_order_at ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> atRiskCustomersByBranch(@Param("restaurantId") Long restaurantId,
                                           @Param("branchId") Long branchId,
                                           @Param("minOrders") int minOrders,
                                           @Param("cutoff") Instant cutoff,
                                           @Param("limit") int limit);
}
