package com.cafeqr.plans.repository;

import com.cafeqr.plans.domain.PricingPlan;
import com.cafeqr.restaurants.domain.Plan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PricingPlanRepository extends JpaRepository<PricingPlan, Long> {

    List<PricingPlan> findAllByOrderByDisplayOrderAscIdAsc();

    /** The catalogue row for a tier. Exactly one exists per tier — the column is unique. */
    Optional<PricingPlan> findByTier(Plan tier);
}
