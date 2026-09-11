package com.cafeqr.menus.repository;

import com.cafeqr.menus.domain.MenuItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MenuItemRepository extends JpaRepository<MenuItem, Long> {

    List<MenuItem> findByCategoryIdOrderByDisplayOrderAscIdAsc(Long categoryId);

    List<MenuItem> findByRestaurantIdOrderByDisplayOrderAscIdAsc(Long restaurantId);

    @Query("""
            SELECT i FROM MenuItem i
            WHERE i.restaurantId = :restaurantId AND i.branchId IS NULL
            ORDER BY i.displayOrder ASC, i.id ASC
            """)
    List<MenuItem> findRestaurantWide(@Param("restaurantId") Long restaurantId);

    @Query("""
            SELECT i FROM MenuItem i
            WHERE i.restaurantId = :restaurantId
              AND (i.branchId IS NULL OR i.branchId = :branchId)
            ORDER BY i.displayOrder ASC, i.id ASC
            """)
    List<MenuItem> findForBranch(@Param("restaurantId") Long restaurantId,
                                 @Param("branchId") Long branchId);

    /** {@code [restaurantId, itemCount]} for the platform admin console. */
    @Query("SELECT i.restaurantId, COUNT(i) FROM MenuItem i GROUP BY i.restaurantId")
    List<Object[]> countPerRestaurant();
}
