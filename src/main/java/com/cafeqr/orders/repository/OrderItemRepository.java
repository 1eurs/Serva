package com.cafeqr.orders.repository;

import com.cafeqr.orders.domain.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    @Query("""
            SELECT oi.menuItemId, oi.nameEnSnapshot, oi.nameArSnapshot,
                   SUM(oi.quantity), SUM(oi.lineTotal)
            FROM OrderItem oi
            JOIN oi.order o
            WHERE (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND o.status <> com.cafeqr.orders.domain.OrderStatus.DECLINED
              AND o.status <> com.cafeqr.orders.domain.OrderStatus.CANCELLED
              AND o.createdAt >= :from AND o.createdAt < :to
            GROUP BY oi.menuItemId, oi.nameEnSnapshot, oi.nameArSnapshot
            ORDER BY SUM(oi.quantity) DESC
            """)
    List<Object[]> bestSelling(@Param("restaurantId") Long restaurantId,
                               @Param("branchId") Long branchId,
                               @Param("from") Instant from,
                               @Param("to") Instant to);

    /**
     * Revenue attributable to the cart's "goes well with your order" upsell: summed line totals of
     * items the customer added from a suggestion, across orders that were actually collected
     * (COMPLETED and PAID) — matching the collected-revenue definition of the headline so the two
     * numbers reconcile.
     */
    @Query("""
            SELECT COALESCE(SUM(oi.lineTotal), 0)
            FROM OrderItem oi JOIN oi.order o
            WHERE oi.fromSuggestion = true
              AND (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND o.status = com.cafeqr.orders.domain.OrderStatus.COMPLETED
              AND o.paymentStatus = com.cafeqr.orders.domain.PaymentStatus.PAID
              AND o.createdAt >= :from AND o.createdAt < :to
            """)
    java.math.BigDecimal sumSuggestionRevenue(@Param("restaurantId") Long restaurantId,
                                              @Param("branchId") Long branchId,
                                              @Param("from") Instant from,
                                              @Param("to") Instant to);

    /**
     * Distinct orders containing each menu item in the window (non-cancelled/declined) — the
     * numerator for the conversion radar (orders-per-view, not quantity-per-view). Branch-scoped
     * like {@link #bestSelling}. Rows: {@code [menuItemId, distinctOrders]}.
     */
    @Query("""
            SELECT oi.menuItemId, COUNT(DISTINCT o.id)
            FROM OrderItem oi
            JOIN oi.order o
            WHERE (:restaurantId IS NULL OR o.restaurantId = :restaurantId)
              AND (:branchId IS NULL OR o.branchId = :branchId)
              AND o.status <> com.cafeqr.orders.domain.OrderStatus.DECLINED
              AND o.status <> com.cafeqr.orders.domain.OrderStatus.CANCELLED
              AND o.createdAt >= :from AND o.createdAt < :to
              AND oi.menuItemId IS NOT NULL
            GROUP BY oi.menuItemId
            """)
    List<Object[]> orderCountByItem(@Param("restaurantId") Long restaurantId,
                                    @Param("branchId") Long branchId,
                                    @Param("from") Instant from,
                                    @Param("to") Instant to);

    /**
     * Top seller name + total quantity for one restaurant — used by the weekly email job
     * which runs without a security context (so it can't use {@link #bestSelling} which
     * relies on AccessGuard scoping). Rows: {@code [nameEn, totalQuantity]}.
     */
    @Query(value = """
            SELECT oi.name_en_snapshot AS name_en,
                   SUM(oi.quantity)    AS total_qty
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.restaurant_id = :restaurantId
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND oi.menu_item_id IS NOT NULL
              AND o.created_at >= :from AND o.created_at < :to
            GROUP BY oi.name_en_snapshot
            ORDER BY total_qty DESC
            LIMIT 1
            """, nativeQuery = true)
    List<Object[]> topSellerName(@Param("restaurantId") Long restaurantId,
                                 @Param("from") Instant from,
                                 @Param("to") Instant to);

    /**
     * Market-basket co-occurrence: how often each pair of items appeared in the same order.
     * Self-pairs and duplicates excluded by {@code a.menu_item_id < b.menu_item_id}. A pair
     * must co-occur in at least {@code MIN_CO_ORDERS} distinct orders to be reported — a single
     * order containing N items would otherwise emit C(N,2) pairs all tied at 1, which reads as
     * "lots of signal" but is really one transaction. Rows:
     * {@code [itemAId, aNameEn, aNameAr, itemBId, bNameEn, bNameAr, coOrders]}.
     */
    @Query(value = """
            SELECT a.menu_item_id,
                   MAX(a.name_en_snapshot) AS a_name_en,
                   MAX(a.name_ar_snapshot) AS a_name_ar,
                   b.menu_item_id,
                   MAX(b.name_en_snapshot) AS b_name_en,
                   MAX(b.name_ar_snapshot) AS b_name_ar,
                   COUNT(DISTINCT a.order_id) AS co_orders
            FROM order_items a
            JOIN order_items b ON a.order_id = b.order_id AND a.menu_item_id < b.menu_item_id
            JOIN orders o ON o.id = a.order_id
            WHERE (:restaurantId IS NULL OR o.restaurant_id = :restaurantId)
              AND (:branchId IS NULL OR o.branch_id = :branchId)
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND a.menu_item_id IS NOT NULL
              AND b.menu_item_id IS NOT NULL
              AND o.created_at >= :from AND o.created_at < :to
            GROUP BY a.menu_item_id, b.menu_item_id
            HAVING COUNT(DISTINCT a.order_id) >= 2
            ORDER BY co_orders DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> itemAffinity(@Param("restaurantId") Long restaurantId,
                                @Param("branchId") Long branchId,
                                @Param("from") Instant from,
                                @Param("to") Instant to,
                                @Param("limit") int limit);

    /**
     * Cart-directed market basket: given the items already in a customer's cart ({@code seedIds}),
     * find the other items most often ordered alongside them, ranked by how many distinct orders
     * they co-occurred in. Powers the "goes well with your order" upsell on the cart.
     *
     * <p>A suggestion must complete the order, not duplicate it. Raw co-occurrence conflates
     * complements (coffee + pastry) with duplicates ordered because two people are at the table
     * (coffee + coffee). So a candidate is dropped when it shares the cart's <em>course type</em>
     * (DRINK/FOOD/DESSERT) — which spans categories, so a second drink from a different drink
     * category is caught too. Categories the owner hasn't tagged (null type) fall back to
     * excluding only the exact same category. Joining {@code menu_items} also drops items no
     * longer on the menu. The seeds themselves are excluded, and a suggestion must have
     * co-occurred in at least two distinct orders — one shared basket is a coincidence, not a
     * pairing. Rows: {@code [menuItemId, coOrders]}.
     */
    @Query(value = """
            SELECT other.menu_item_id AS item_id,
                   COUNT(DISTINCT other.order_id) AS co_orders
            FROM order_items seed
            JOIN order_items other ON other.order_id = seed.order_id
                                  AND other.menu_item_id <> seed.menu_item_id
            JOIN orders o ON o.id = seed.order_id
            JOIN menu_items mi ON mi.id = other.menu_item_id
            JOIN menu_categories mc ON mc.id = mi.category_id
            WHERE o.restaurant_id = :restaurantId
              AND seed.menu_item_id IN (:seedIds)
              AND other.menu_item_id IS NOT NULL
              AND other.menu_item_id NOT IN (:seedIds)
              AND mi.category_id NOT IN (SELECT m2.category_id FROM menu_items m2 WHERE m2.id IN (:seedIds))
              AND (mc.course_type IS NULL OR mc.course_type NOT IN (
                      SELECT mc2.course_type FROM menu_items m3
                      JOIN menu_categories mc2 ON mc2.id = m3.category_id
                      WHERE m3.id IN (:seedIds) AND mc2.course_type IS NOT NULL))
              AND o.status NOT IN ('DECLINED', 'CANCELLED')
              AND o.created_at >= :from AND o.created_at < :to
            GROUP BY other.menu_item_id
            HAVING COUNT(DISTINCT other.order_id) >= 2
            ORDER BY co_orders DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> suggestionsForItems(@Param("restaurantId") Long restaurantId,
                                       @Param("seedIds") List<Long> seedIds,
                                       @Param("from") Instant from,
                                       @Param("to") Instant to,
                                       @Param("limit") int limit);
}
