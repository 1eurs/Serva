package com.cafeqr.plans.repository;

import com.cafeqr.plans.domain.Feature;
import com.cafeqr.plans.domain.PlanFeature;
import com.cafeqr.restaurants.domain.Plan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlanFeatureRepository extends JpaRepository<PlanFeature, PlanFeature.Key> {

    Optional<PlanFeature> findByTierAndFeature(Plan tier, Feature feature);
}
