package com.cafeqr.plans;

import com.cafeqr.analytics.Entitlements;
import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.PlanRequiredException;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.plans.domain.PlanFeature;
import com.cafeqr.plans.repository.PlanFeatureRepository;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.restaurants.domain.Restaurant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What a tier includes is now a row in {@code plan_features} rather than
 * {@code plan == PRO || plan == ENTERPRISE} written at every gate. These are the properties
 * that has to hold for that to be safe to hand a platform admin.
 */
class PlanFeatureGateTest {

    private static final long CAFE = 3L;

    private List<PlanFeature> rows;
    private PlanFeatureRepository repository;
    private AuditService audit;
    private PlanFeatureService features;

    private AccessGuard accessGuard;
    private RestaurantService restaurants;

    @BeforeEach
    void setUp() {
        rows = new ArrayList<>();
        repository = mock(PlanFeatureRepository.class);
        audit = mock(AuditService.class);
        when(repository.findAll()).thenAnswer(i -> List.copyOf(rows));
        when(repository.findByTierAndFeature(any(), any())).thenAnswer(i -> rows.stream()
                .filter(r -> r.getTier() == i.getArgument(0) && r.getFeature() == i.getArgument(1))
                .findFirst());
        when(repository.save(any(PlanFeature.class))).thenAnswer(i -> {
            PlanFeature saved = i.getArgument(0);
            if (!rows.contains(saved)) {
                rows.add(saved);
            }
            return saved;
        });

        accessGuard = mock(AccessGuard.class);
        restaurants = mock(RestaurantService.class);
    }

    private void seed(Plan tier, Feature feature, boolean enabled) {
        rows.add(new PlanFeature(tier, feature, enabled));
    }

    /** Built after seeding — the service loads the grid in its constructor. */
    private PlanFeatureService service() {
        features = new PlanFeatureService(repository, audit);
        return features;
    }

    private Entitlements entitlementsFor(Plan tier) {
        when(accessGuard.scopedRestaurantId()).thenReturn(CAFE);
        Restaurant cafe = new Restaurant();
        cafe.setPlan(tier);
        when(restaurants.getEntity(CAFE)).thenReturn(cafe);
        return new Entitlements(accessGuard, restaurants, features);
    }

    @Test
    void theGridDecidesWhatATierIncludes() {
        seed(Plan.STANDARD, Feature.LOYALTY, false);
        seed(Plan.PRO, Feature.LOYALTY, true);
        service();

        assertThat(entitlementsFor(Plan.STANDARD).has(Feature.LOYALTY)).isFalse();
        assertThat(entitlementsFor(Plan.PRO).has(Feature.LOYALTY)).isTrue();
    }

    /**
     * The whole point of the grid: loyalty without the analytics, if that is what somebody
     * wants to sell. The old comparison could not express this — one boolean answered for
     * every gated feature at once.
     */
    @Test
    void aTierCanIncludeOneFeatureWithoutTheOthers() {
        seed(Plan.STANDARD, Feature.LOYALTY, true);
        seed(Plan.STANDARD, Feature.PRO_ANALYTICS, false);
        service();
        Entitlements gate = entitlementsFor(Plan.STANDARD);

        assertThat(gate.has(Feature.LOYALTY)).isTrue();
        assertThat(gate.has(Feature.PRO_ANALYTICS)).isFalse();
    }

    /** A feature with no row yet — a new enum value ahead of its migration — is refused. */
    @Test
    void aFeatureWithNoRowIsNotIncluded() {
        service();

        assertThat(entitlementsFor(Plan.PRO).has(Feature.MULTI_BRANCH)).isFalse();
    }

    /** A platform admin has no café of their own, and sees everything they sell. */
    @Test
    void aPlatformAdminIsGrantedEverything() {
        service();
        when(accessGuard.scopedRestaurantId()).thenReturn(null);
        Entitlements gate = new Entitlements(accessGuard, restaurants, features);

        for (Feature feature : Feature.values()) {
            assertThat(gate.has(feature)).as(feature.name()).isTrue();
        }
        verify(restaurants, never()).getEntity(anyLong());
    }

    @Test
    void requireThrows402WhenTheTierDoesNotCoverIt() {
        seed(Plan.STANDARD, Feature.LOYALTY, false);
        service();

        assertThatThrownBy(() -> entitlementsFor(Plan.STANDARD).require(Feature.LOYALTY))
                .isInstanceOf(PlanRequiredException.class)
                .hasMessageContaining("Loyalty");
    }

    /**
     * The refusal names the feature, never the tier that unlocks it — "upgrade to Pro" is a
     * sentence that goes stale the next time the grid is edited.
     */
    @Test
    void noRefusalNamesATier() {
        service();
        Entitlements gate = entitlementsFor(Plan.STANDARD);

        for (Feature feature : Feature.values()) {
            assertThatThrownBy(() -> gate.require(feature))
                    .as(feature.name())
                    .isInstanceOf(PlanRequiredException.class)
                    .hasMessageNotContainingAny("Pro", "Standard", "Enterprise", "PRO");
        }
    }

    /** A tick on the Plans page takes effect on the next request, not the next restart. */
    @Test
    void aChangeIsVisibleImmediately() {
        seed(Plan.STANDARD, Feature.LOYALTY, false);
        service();
        Entitlements gate = entitlementsFor(Plan.STANDARD);
        assertThat(gate.has(Feature.LOYALTY)).isFalse();

        features.set(Plan.STANDARD, Feature.LOYALTY, true);

        assertThat(gate.has(Feature.LOYALTY)).isTrue();
    }

    /** Turning a tier's feature on or off changes what every café on it can open. It is audited. */
    @Test
    void aChangeIsAudited() {
        seed(Plan.STANDARD, Feature.LOYALTY, false);
        service();

        features.set(Plan.STANDARD, Feature.LOYALTY, true);

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(audit).record(eq(AuditAction.PLAN_FEATURES_CHANGED), anyString(), any(),
                eq("STANDARD"), detail.capture());
        assertThat(detail.getValue()).contains("LOYALTY").contains("off").contains("on");
    }

    /** Setting a value it already had is not a change, and does not fill the log with noise. */
    @Test
    void settingTheSameValueIsNotAudited() {
        seed(Plan.PRO, Feature.LOYALTY, true);
        service();

        features.set(Plan.PRO, Feature.LOYALTY, true);

        verify(audit, never()).record(any(), anyString(), any(), anyString(), anyString());
    }

    /** A feature never ticked for a tier can still be turned on — the row is created. */
    @Test
    void aMissingRowIsCreatedOnFirstEdit() {
        service();
        assertThat(repository.findByTierAndFeature(Plan.STANDARD, Feature.MULTI_BRANCH)).isEmpty();

        features.set(Plan.STANDARD, Feature.MULTI_BRANCH, true);

        assertThat(entitlementsFor(Plan.STANDARD).has(Feature.MULTI_BRANCH)).isTrue();
    }

    /**
     * A tier whose row says nothing gets nothing. The column is NOT NULL so a café cannot
     * really arrive without one — but if it ever did, "we could not tell" must not resolve the
     * same way as "this is a platform admin", or a failed read becomes a free upgrade.
     */
    @Test
    void aCafeWithNoTierGetsNothingRatherThanEverything() {
        seed(Plan.PRO, Feature.LOYALTY, true);
        service();
        when(accessGuard.scopedRestaurantId()).thenReturn(CAFE);
        when(restaurants.getEntity(CAFE)).thenReturn(new Restaurant()); // plan never set
        Entitlements gate = new Entitlements(accessGuard, restaurants, features);

        assertThat(gate.included()).isEmpty();
        for (Feature feature : Feature.values()) {
            assertThat(gate.has(feature)).as(feature.name()).isFalse();
        }
    }

    /**
     * The cache moves when the write commits, never when it is merely made. Publishing early
     * would leave a rolled-back edit granting a paid feature that no row supports, until the
     * next successful write or a restart.
     */
    @Test
    void aChangeThatNeverCommitsDoesNotMoveTheCache() {
        seed(Plan.STANDARD, Feature.LOYALTY, false);
        service();
        Entitlements gate = entitlementsFor(Plan.STANDARD);

        TransactionSynchronizationManager.initSynchronization();
        try {
            features.set(Plan.STANDARD, Feature.LOYALTY, true);
            // The row is written and the response says so, but nothing has committed.
            assertThat(features.matrix().included().get(Plan.STANDARD)).contains(Feature.LOYALTY);
            assertThat(gate.has(Feature.LOYALTY)).isFalse();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        // Rolled back: the cache never saw it, and the gate is still shut.
        assertThat(gate.has(Feature.LOYALTY)).isFalse();
    }

    /** Handing out the live set would let one caller's edit become everybody's answer. */
    @Test
    void theIncludedSetIsACopy() {
        seed(Plan.PRO, Feature.LOYALTY, true);
        service();

        features.includedFor(Plan.PRO).clear();

        assertThat(features.includes(Plan.PRO, Feature.LOYALTY)).isTrue();
    }

    /**
     * The matrix the Plans page renders covers every feature for every tier, so a switch never
     * goes missing from the grid just because nobody has ever set it.
     */
    @Test
    void theMatrixListsEveryFeature() {
        seed(Plan.PRO, Feature.LOYALTY, true);
        service();

        assertThat(features.matrix().features()).containsExactly(Feature.values());
        assertThat(features.matrix().included().get(Plan.PRO)).containsExactly(Feature.LOYALTY);
        assertThat(features.matrix().included()).containsKeys(Plan.values());
    }
}
