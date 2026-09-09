package com.cafeqr.subscriptions;

import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The money arithmetic the billing board reports.
 *
 * <p>Each case here is a bug that shipped once: a trial counted as revenue, and a payment with
 * no transfer reference erasing the reference already on file.
 */
class BillingOverviewTest {

    private static Subscription sub(SubscriptionStatus status, BillingCycle cycle, String price) {
        Subscription s = new Subscription();
        s.setStatus(status);
        s.setBillingCycle(cycle);
        s.setPrice(new BigDecimal(price));
        s.setEndDate(LocalDate.now().plusMonths(6));
        return s;
    }

    @Test
    void onlyPayingCafesCountTowardMrr() {
        // MRR is what cafés pay us. A trial is a café that might pay us; counting it makes the
        // one number this board exists to report too big.
        assertThat(SubscriptionService.countsTowardMrr(sub(SubscriptionStatus.ACTIVE, BillingCycle.YEARLY, "120.000"))).isTrue();
        assertThat(SubscriptionService.countsTowardMrr(sub(SubscriptionStatus.TRIAL, BillingCycle.YEARLY, "120.000"))).isFalse();
        assertThat(SubscriptionService.countsTowardMrr(sub(SubscriptionStatus.PAST_DUE, BillingCycle.YEARLY, "120.000"))).isFalse();
        assertThat(SubscriptionService.countsTowardMrr(sub(SubscriptionStatus.EXPIRED, BillingCycle.YEARLY, "120.000"))).isFalse();
        assertThat(SubscriptionService.countsTowardMrr(sub(SubscriptionStatus.CANCELLED, BillingCycle.YEARLY, "120.000"))).isFalse();
    }

    @Test
    void lifetimeAccessIsRealMoneyButNotRecurringMoney() {
        Subscription lifetime = sub(SubscriptionStatus.ACTIVE, BillingCycle.ONE_TIME, "300.000");
        assertThat(SubscriptionService.countsTowardMrr(lifetime)).isTrue();
        assertThat(SubscriptionService.monthlyValue(lifetime)).isEqualByComparingTo("0");
    }

    @Test
    void aYearlyPriceSpreadsAcrossTwelveMonths() {
        assertThat(SubscriptionService.monthlyValue(sub(SubscriptionStatus.ACTIVE, BillingCycle.YEARLY, "29.000")))
                .isEqualByComparingTo("2.417");
    }

    @Test
    void aMonthlyPriceIsAlreadyMonthly() {
        assertThat(SubscriptionService.monthlyValue(sub(SubscriptionStatus.ACTIVE, BillingCycle.MONTHLY, "19.000")))
                .isEqualByComparingTo("19.000");
    }

    @Test
    void aSubscriptionWithNoPriceContributesNothing() {
        Subscription s = sub(SubscriptionStatus.ACTIVE, BillingCycle.YEARLY, "0");
        s.setPrice(null);
        assertThat(SubscriptionService.monthlyValue(s)).isEqualByComparingTo("0");
    }
}
