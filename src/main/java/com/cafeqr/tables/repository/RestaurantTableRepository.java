package com.cafeqr.tables.repository;

import com.cafeqr.tables.domain.RestaurantTable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface RestaurantTableRepository extends JpaRepository<RestaurantTable, Long> {

    List<RestaurantTable> findByBranchIdOrderByTableNumberAsc(Long branchId);

    Optional<RestaurantTable> findByQrCodeToken(String qrCodeToken);

    /** {@code [restaurantId, tableCount]} — how much of a café is actually reachable by QR. */
    @Query("SELECT t.restaurantId, COUNT(t) FROM RestaurantTable t GROUP BY t.restaurantId")
    List<Object[]> countPerRestaurant();
}
