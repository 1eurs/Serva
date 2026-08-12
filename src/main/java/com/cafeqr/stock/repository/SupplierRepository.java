package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

    List<Supplier> findByRestaurantIdOrderByNameAsc(Long restaurantId);

    List<Supplier> findByRestaurantIdAndActiveTrueOrderByNameAsc(Long restaurantId);
}
