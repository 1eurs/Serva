package com.cafeqr.plans.dto;

import com.cafeqr.plans.domain.Feature;
import com.cafeqr.restaurants.domain.Plan;
import jakarta.validation.constraints.NotNull;

/** Turn one feature on or off for one tier. */
public record SetPlanFeatureRequest(
        @NotNull Plan tier,
        @NotNull Feature feature,
        @NotNull Boolean enabled
) {}
