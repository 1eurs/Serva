package com.cafeqr.plans.dto;

import com.cafeqr.plans.domain.Feature;
import com.cafeqr.plans.domain.PlanFeature;
import com.cafeqr.restaurants.domain.Plan;

import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * The whole tier/feature grid in one response, so the Plans page renders from a single request
 * and cannot show a half-loaded matrix where an unticked box means "still loading".
 */
public record PlanFeatureMatrix(
        /** Every feature the platform can gate, in enum order — the rows. */
        List<Feature> features,
        /** Tier → the features it includes. Every tier is present, even if it includes nothing. */
        Map<Plan, List<Feature>> included
) {
    public static PlanFeatureMatrix of(Collection<PlanFeature> rows) {
        Map<Plan, List<Feature>> included = new EnumMap<>(Plan.class);
        for (Plan tier : Plan.values()) {
            included.put(tier, rows.stream()
                    .filter(r -> r.getTier() == tier && r.isEnabled())
                    .map(PlanFeature::getFeature)
                    .sorted()
                    .toList());
        }
        return new PlanFeatureMatrix(List.of(Feature.values()), included);
    }
}
