package com.cafeqr.restaurants.repository;

import com.cafeqr.restaurants.domain.Restaurant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

import java.util.List;
import java.util.Optional;

public interface RestaurantRepository extends JpaRepository<Restaurant, Long> {

    Optional<Restaurant> findBySlug(String slug);

    boolean existsBySlug(String slug);

    Page<Restaurant> findByActive(boolean active, Pageable pageable);

    /** Active restaurants on the given plan — used by the weekly insights job. */
    List<Restaurant> findByPlanAndActiveTrue(com.cafeqr.restaurants.domain.Plan plan);

    /** {@code [day, cafésCreated]} since {@code from}, in the cafés' own timezone. */
    @Query(value = """
            SELECT (r.created_at AT TIME ZONE :tz)::date AS day, COUNT(*) AS signups
            FROM restaurants r
            WHERE r.created_at >= :from
            GROUP BY 1
            ORDER BY 1
            """, nativeQuery = true)
    List<Object[]> dailySignups(@Param("from") Instant from, @Param("tz") String timezone);
}
