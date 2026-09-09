package com.cafeqr.plans.domain;

import com.cafeqr.restaurants.domain.Plan;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;

/**
 * One cell of the tier/feature grid: does this tier include this feature?
 *
 * <p>Keyed by the pair rather than a surrogate id — there is exactly one answer per
 * (tier, feature), and letting the database say so is cheaper than defending it in code.
 */
@Entity
@Table(name = "plan_features")
@IdClass(PlanFeature.Key.class)
public class PlanFeature {

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "tier", nullable = false, length = 20)
    private Plan tier;

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "feature", nullable = false, length = 40)
    private Feature feature;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    protected PlanFeature() {
    }

    public PlanFeature(Plan tier, Feature feature, boolean enabled) {
        this.tier = tier;
        this.feature = feature;
        this.enabled = enabled;
    }

    public Plan getTier() { return tier; }
    public Feature getFeature() { return feature; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    /** Composite key: the pair is the identity. */
    public static class Key implements Serializable {
        private Plan tier;
        private Feature feature;

        public Key() {
        }

        public Key(Plan tier, Feature feature) {
            this.tier = tier;
            this.feature = feature;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key key)) return false;
            return tier == key.tier && feature == key.feature;
        }

        @Override
        public int hashCode() {
            return Objects.hash(tier, feature);
        }
    }
}
