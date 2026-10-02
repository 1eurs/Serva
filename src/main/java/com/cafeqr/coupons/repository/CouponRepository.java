package com.cafeqr.coupons.repository;

import com.cafeqr.coupons.domain.Coupon;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CouponRepository extends JpaRepository<Coupon, Long> {

    List<Coupon> findByRestaurantIdOrderByCreatedAtDesc(Long restaurantId);

    Optional<Coupon> findByRestaurantIdAndCode(Long restaurantId, String code);

    boolean existsByRestaurantIdAndCode(Long restaurantId, String code);
}
