package com.cafeqr.subscriptions;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import com.cafeqr.subscriptions.dto.CreateSubscriptionRequest;
import com.cafeqr.subscriptions.dto.UpdateSubscriptionRequest;
import com.cafeqr.plans.domain.PricingPlan;
import com.cafeqr.plans.repository.PricingPlanRepository;
import com.cafeqr.subscriptions.repository.SubscriptionPaymentRepository;
import com.cafeqr.subscriptions.repository.SubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A café's tier is bought, not assigned.
 *
 * <p>It used to be written in two unrelated places — {@code restaurants.plan}, which gated every
 * Pro feature, and {@code subscriptions.plan_name}, a free-text string that decided the invoice.
 * Nothing reconciled them, so production ran a café gated PRO whose subscription said "Standard"
 * at the Standard price: every Pro feature for 15 OMR, invisible from either screen.
 *
 * <p>The subscription's tier is now the only input, and {@code restaurants.plan} is a mirror the
 * service writes. These tests pin the mirror to it, because the moment the two can be set
 * independently again the same silent drift returns.
 */
class TierIsTheSubscriptionTest {

    private static final long CAFE = 42L;

    private SubscriptionRepository subscriptions;
    private RestaurantRepository restaurants;
    private AuditService audit;
    private PricingPlanRepository pricingPlans;
    private SubscriptionService service;
    private Restaurant cafe;

    @BeforeEach
    void setUp() {
        subscriptions = mock(SubscriptionRepository.class);
        restaurants = mock(RestaurantRepository.class);
        audit = mock(AuditService.class);
        RestaurantService restaurantService = mock(RestaurantService.class);
        SubscriptionPaymentRepository payments = mock(SubscriptionPaymentRepository.class);
        pricingPlans = mock(PricingPlanRepository.class);
        when(pricingPlans.findByTier(any())).thenAnswer(i -> Optional.of(catalogue(i.getArgument(0))));

        cafe = new Restaurant();
        cafe.setName("Qurum Juice");
        cafe.setNameEn("Qurum Juice");
        cafe.setPlan(Plan.STANDARD);
        when(restaurants.findById(CAFE)).thenReturn(Optional.of(cafe));
        when(subscriptions.save(any(Subscription.class))).thenAnswer(i -> i.getArgument(0));

        service = new SubscriptionService(subscriptions, payments, restaurantService, restaurants,
                pricingPlans, audit);
    }

    /** List prices as the catalogue holds them: 15 Standard, 20 Pro, custom Enterprise. */
    private static PricingPlan catalogue(Plan tier) {
        PricingPlan p = new PricingPlan();
        p.setTier(tier);
        p.setName(tier.name());
        p.setMonthlyPrice(tier == Plan.STANDARD ? new BigDecimal("15.000")
                : tier == Plan.PRO ? new BigDecimal("20.000") : null);
        return p;
    }

    private static CreateSubscriptionRequest newSub(Plan tier) {
        return new CreateSubscriptionRequest(tier, BillingCycle.MONTHLY, new BigDecimal("20.000"),
                SubscriptionStatus.ACTIVE, LocalDate.now(), LocalDate.now().plusMonths(1));
    }

    @Test
    void creatingAProSubscriptionPutsTheCafeOnPro() {
        service.create(CAFE, newSub(Plan.PRO));

        assertThat(cafe.getPlan()).isEqualTo(Plan.PRO);
        verify(restaurants).save(cafe);
    }

    @Test
    void changingTheSubscriptionTierMovesTheGateWithIt() {
        Subscription existing = existingSubscription(Plan.STANDARD);
        cafe.setPlan(Plan.STANDARD);

        service.update(existing.getId(), update(Plan.PRO));

        assertThat(existing.getTier()).isEqualTo(Plan.PRO);
        assertThat(cafe.getPlan())
                .as("the café's gate must follow the tier it now pays for")
                .isEqualTo(Plan.PRO);
    }

    /** A downgrade has to travel too, or a café keeps Pro after it stops paying for it. */
    @Test
    void downgradingTakesProAwayAgain() {
        Subscription existing = existingSubscription(Plan.PRO);
        cafe.setPlan(Plan.PRO);

        service.update(existing.getId(), update(Plan.STANDARD));

        assertThat(cafe.getPlan()).isEqualTo(Plan.STANDARD);
    }

    @Test
    void aTierChangeIsAudited() {
        Subscription existing = existingSubscription(Plan.STANDARD);
        cafe.setPlan(Plan.STANDARD);

        service.update(existing.getId(), update(Plan.PRO));

        verify(audit).recordCafe(eq(AuditAction.PLAN_CHANGED), eq(CAFE), any(),
                eq("STANDARD → PRO"));
    }

    /** Editing something else must not rewrite the café's tier, nor log a change that did not happen. */
    @Test
    void editingSomethingElseLeavesTheTierAndTheLogAlone() {
        Subscription existing = existingSubscription(Plan.PRO);
        cafe.setPlan(Plan.PRO);

        service.update(existing.getId(), new UpdateSubscriptionRequest(
                null, null, null, SubscriptionStatus.PAST_DUE, null, null));

        assertThat(existing.getTier()).isEqualTo(Plan.PRO);
        assertThat(cafe.getPlan()).isEqualTo(Plan.PRO);
        verify(restaurants, never()).save(any());
        verify(audit, never()).recordCafe(any(), anyLong(), any(), any());
    }

    /* ── only Enterprise is negotiable ──────────────────────────────────────────────── */

    /** A typed price on a list-price tier is ignored, not honoured. */
    @Test
    void aProCafeIsChargedTheProListPriceWhateverIsTyped() {
        Subscription existing = existingSubscription(Plan.PRO);

        service.update(existing.getId(), new UpdateSubscriptionRequest(
                null, null, new BigDecimal("18.000"), null, null, null));

        assertThat(existing.getPrice()).isEqualByComparingTo("20.000");
    }

    @Test
    void aYearlyTermIsTwelveMonthsOfTheListPrice() {
        service.create(CAFE, new CreateSubscriptionRequest(Plan.PRO, BillingCycle.YEARLY,
                new BigDecimal("1.000"), SubscriptionStatus.ACTIVE, LocalDate.now(), LocalDate.now().plusYears(1)));

        verify(subscriptions).save(argThat(s -> s.getPrice().compareTo(new BigDecimal("240.000")) == 0));
    }

    /** Upgrading has to move the money too, or a PRO café keeps paying the STANDARD fee. */
    @Test
    void upgradingRepricesEvenWhenNoPriceIsSent() {
        Subscription existing = existingSubscription(Plan.STANDARD);
        existing.setPrice(new BigDecimal("15.000"));

        service.update(existing.getId(), update(Plan.PRO));

        assertThat(existing.getPrice()).isEqualByComparingTo("20.000");
    }

    @Test
    void enterpriseKeepsTheNegotiatedNumber() {
        service.create(CAFE, new CreateSubscriptionRequest(Plan.ENTERPRISE, BillingCycle.MONTHLY,
                new BigDecimal("137.500"), SubscriptionStatus.ACTIVE, LocalDate.now(), LocalDate.now().plusMonths(1)));

        verify(subscriptions).save(argThat(s -> s.getPrice().compareTo(new BigDecimal("137.500")) == 0));
    }

    /** A lifetime deal is a negotiation, so it needs the tier that allows one. */
    @Test
    void aOneTimePriceNeedsEnterprise() {
        assertThatThrownBy(() -> service.create(CAFE, new CreateSubscriptionRequest(
                Plan.PRO, BillingCycle.ONE_TIME, new BigDecimal("500.000"),
                SubscriptionStatus.ACTIVE, LocalDate.now(), null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Enterprise");
    }

    /**
     * A negotiated fee is the agreement itself, so an edit that says nothing about it must
     * leave it alone. The price is optional on the PATCH, and marking an Enterprise café
     * ACTIVE used to send a null through the pricing rule and settle the account at 0.000.
     */
    @Test
    void anEditThatIgnoresThePriceDoesNotWipeAnEnterpriseDeal() {
        Subscription existing = existingSubscription(Plan.ENTERPRISE);
        existing.setPrice(new BigDecimal("137.500"));
        cafe.setPlan(Plan.ENTERPRISE);

        service.update(existing.getId(), new UpdateSubscriptionRequest(
                null, null, null, SubscriptionStatus.ACTIVE, null, null));

        assertThat(existing.getPrice()).isEqualByComparingTo("137.500");
    }

    /** The negotiated number still moves when somebody actually types a new one. */
    @Test
    void anEnterpriseDealCanStillBeRepriced() {
        Subscription existing = existingSubscription(Plan.ENTERPRISE);
        existing.setPrice(new BigDecimal("137.500"));
        cafe.setPlan(Plan.ENTERPRISE);

        service.update(existing.getId(), new UpdateSubscriptionRequest(
                null, null, new BigDecimal("99.000"), null, null, null));

        assertThat(existing.getPrice()).isEqualByComparingTo("99.000");
    }

    /**
     * Carrying the old price forward must not leak into the list-price tiers: a Standard café
     * sitting on a stale 20.000 is repriced to its list price by an unrelated edit, not left.
     */
    @Test
    void aStalePriceOnAListTierIsStillCorrected() {
        Subscription existing = existingSubscription(Plan.STANDARD);
        existing.setPrice(new BigDecimal("20.000"));
        cafe.setPlan(Plan.STANDARD);

        service.update(existing.getId(), new UpdateSubscriptionRequest(
                null, null, null, SubscriptionStatus.ACTIVE, null, null));

        assertThat(existing.getPrice()).isEqualByComparingTo("15.000");
    }

    /**
     * Repricing a tier moves the cafés on it — that is the whole point of the catalogue being
     * the price. A yearly term is twelve of the new monthly figure, not the old one.
     */
    @Test
    void repricingATierMovesEveryCafeOnIt() {
        Subscription monthly = sub(Plan.PRO, BillingCycle.MONTHLY, "18.000");
        Subscription yearly = sub(Plan.PRO, BillingCycle.YEARLY, "180.000");
        Subscription alreadyRight = sub(Plan.PRO, BillingCycle.MONTHLY, "20.000");
        when(subscriptions.findByTier(Plan.PRO)).thenReturn(List.of(monthly, yearly, alreadyRight));

        int moved = service.repriceTier(Plan.PRO);

        assertThat(monthly.getPrice()).isEqualByComparingTo("20.000");
        assertThat(yearly.getPrice()).isEqualByComparingTo("240.000");
        assertThat(moved).as("a row already on the list price has not moved").isEqualTo(2);
    }

    /** A negotiated deal does not follow a catalogue it was never priced from. */
    @Test
    void repricingNeverTouchesEnterprise() {
        assertThat(service.repriceTier(Plan.ENTERPRISE)).isZero();
        verify(subscriptions, never()).findByTier(Plan.ENTERPRISE);
    }

    /** A lifetime price has no monthly figure behind it, so there is nothing to recompute. */
    @Test
    void repricingSkipsALifetimeTerm() {
        Subscription lifetime = sub(Plan.PRO, BillingCycle.ONE_TIME, "500.000");
        when(subscriptions.findByTier(Plan.PRO)).thenReturn(List.of(lifetime));

        assertThat(service.repriceTier(Plan.PRO)).isZero();
        assertThat(lifetime.getPrice()).isEqualByComparingTo("500.000");
    }

    private static Subscription sub(Plan tier, BillingCycle cycle, String price) {
        Subscription s = new Subscription();
        s.setRestaurantId(CAFE);
        s.setTier(tier);
        s.setBillingCycle(cycle);
        s.setPrice(new BigDecimal(price));
        return s;
    }

    private Subscription existingSubscription(Plan tier) {
        Subscription s = new Subscription();
        s.setRestaurantId(CAFE);
        s.setTier(tier);
        s.setBillingCycle(BillingCycle.MONTHLY);
        s.setPrice(new BigDecimal("20.000"));
        s.setStatus(SubscriptionStatus.ACTIVE);
        s.setStartDate(LocalDate.now());
        s.setEndDate(LocalDate.now().plusMonths(1));
        when(subscriptions.findById(any())).thenReturn(Optional.of(s));
        return s;
    }

    private static UpdateSubscriptionRequest update(Plan tier) {
        return new UpdateSubscriptionRequest(tier, null, null, null, null, null);
    }
}
