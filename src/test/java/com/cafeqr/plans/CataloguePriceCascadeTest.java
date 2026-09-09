package com.cafeqr.plans;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.plans.domain.PricingPlan;
import com.cafeqr.plans.dto.UpdatePlanRequest;
import com.cafeqr.plans.repository.PricingPlanRepository;
import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.subscriptions.SubscriptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The catalogue is the price. Editing it has to move the cafés already on the tier — otherwise
 * the catalogue and the subscriptions are two writable copies of one number again, which is the
 * bug that had a café gated PRO while billed at the STANDARD rate.
 */
class CataloguePriceCascadeTest {

    private static final long PLAN_ID = 2L;

    private PricingPlanRepository plans;
    private SubscriptionService subscriptions;
    private AuditService audit;
    private PricingPlanService service;
    private PricingPlan pro;

    @BeforeEach
    void setUp() {
        plans = mock(PricingPlanRepository.class);
        subscriptions = mock(SubscriptionService.class);
        audit = mock(AuditService.class);
        pro = new PricingPlan();
        pro.setTier(Plan.PRO);
        pro.setName("Pro");
        pro.setMonthlyPrice(new BigDecimal("20.000"));
        when(plans.findById(PLAN_ID)).thenReturn(Optional.of(pro));
        service = new PricingPlanService(plans, subscriptions, audit);
    }

    private static UpdatePlanRequest priceOf(String monthly) {
        return new UpdatePlanRequest(null, monthly == null ? null : new BigDecimal(monthly),
                false, null, null, null);
    }

    @Test
    void raisingTheListPriceRepricesTheCafesOnThatTier() {
        when(subscriptions.repriceTier(Plan.PRO)).thenReturn(3);

        service.update(PLAN_ID, priceOf("25.000"));

        verify(subscriptions).repriceTier(Plan.PRO);
    }

    /** Saving the same number is not a price change, and must not churn live subscriptions. */
    @Test
    void savingTheSamePriceChangesNothing() {
        service.update(PLAN_ID, priceOf("20.000"));

        verify(subscriptions, never()).repriceTier(any());
        verify(audit, never()).record(anyString(), anyString(), any(), anyString(), anyString());
    }

    /** Renaming a tier is not a pricing decision either. */
    @Test
    void renamingDoesNotTouchAnybodysBill() {
        service.update(PLAN_ID, new UpdatePlanRequest("Pro Plus", null, false, null, null, null));

        verify(subscriptions, never()).repriceTier(any());
    }

    /** Money moving for every café on a tier leaves no other trace, so it is written down. */
    @Test
    void aPriceChangeIsAudited() {
        when(subscriptions.repriceTier(Plan.PRO)).thenReturn(3);

        service.update(PLAN_ID, priceOf("25.000"));

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        // The id comes off the entity, which a unit test's plan does not have — the tier label
        // is the part that has to be right, since that is what the log is read by.
        verify(audit).record(eq(AuditAction.PLAN_PRICE_CHANGED), anyString(), any(),
                eq("PRO"), detail.capture());
        assertThat(detail.getValue()).contains("20.000").contains("25.000").contains("3 subscriptions");
    }

    /**
     * ENTERPRISE moves between a number and "custom", so the before/after comparison sees a
     * null on either side. It must not throw on the way to deciding nothing needs repricing.
     */
    @Test
    void anEnterpriseTierMovingToAndFromCustomDoesNotBlowUp() {
        PricingPlan enterprise = new PricingPlan();
        enterprise.setTier(Plan.ENTERPRISE);
        enterprise.setMonthlyPrice(null);
        when(plans.findById(9L)).thenReturn(Optional.of(enterprise));

        service.update(9L, priceOf("500.000"));
        assertThat(enterprise.getMonthlyPrice()).isEqualByComparingTo("500.000");

        service.update(9L, new UpdatePlanRequest(null, null, true, null, null, null));
        assertThat(enterprise.getMonthlyPrice()).isNull();

        // Negotiated deals are never repriced from a catalogue they do not follow.
        verify(subscriptions, never()).repriceTier(Plan.PRO);
    }
}
