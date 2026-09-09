package com.cafeqr.subscriptions;

import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The term arithmetic behind "record a payment". This is the one place in the console where a
 * quiet bug is expensive in both directions — a free year given away, or a café billed for a
 * term it already paid for — so each rule gets its own case.
 */
class SubscriptionTermTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 26);

    private static Subscription sub(BillingCycle cycle, SubscriptionStatus status,
                                    LocalDate endDate, boolean everPaid) {
        Subscription s = new Subscription();
        s.setBillingCycle(cycle);
        s.setStatus(status);
        s.setEndDate(endDate);
        s.setPrice(new BigDecimal("120.000"));
        if (everPaid) {
            s.setPaymentConfirmedAt(Instant.now());
        }
        return s;
    }

    @Test
    void firstPaymentOnATrialConfirmsTheTermItAlreadyHas() {
        // Onboarding hands a new café a full provisional year. That date is the offer, so the
        // first payment must confirm it rather than stack a second year on top.
        Subscription s = sub(BillingCycle.YEARLY, SubscriptionStatus.TRIAL, TODAY.plusYears(1), false);
        assertThat(SubscriptionService.extendedTerm(s, TODAY)).isEqualTo(TODAY.plusYears(1));
    }

    @Test
    void secondPaymentRenewsAFullYearFromTheExistingEnd() {
        // Paying early must not cost the café the days it already bought.
        Subscription s = sub(BillingCycle.YEARLY, SubscriptionStatus.ACTIVE, LocalDate.of(2027, 8, 26), true);
        assertThat(SubscriptionService.extendedTerm(s, LocalDate.of(2027, 8, 20)))
                .isEqualTo(LocalDate.of(2028, 8, 26));
    }

    @Test
    void aLatePaymentBuysAFullTermFromTheDayItArrived() {
        // Extending from a long-expired end date would sell a term that is already half spent.
        Subscription s = sub(BillingCycle.YEARLY, SubscriptionStatus.PAST_DUE, LocalDate.of(2026, 6, 1), true);
        assertThat(SubscriptionService.extendedTerm(s, TODAY)).isEqualTo(TODAY.plusYears(1));
    }

    @Test
    void aTrialThatAlreadyLapsedStillBuysAFullTerm() {
        // The provisional term only counts while it is still in the future; a trial that ran out
        // before anyone paid is a late payment, not a confirmation.
        Subscription s = sub(BillingCycle.YEARLY, SubscriptionStatus.TRIAL, TODAY.minusDays(3), false);
        assertThat(SubscriptionService.extendedTerm(s, TODAY)).isEqualTo(TODAY.plusYears(1));
    }

    @Test
    void monthlyCyclesAdvanceByAMonth() {
        Subscription s = sub(BillingCycle.MONTHLY, SubscriptionStatus.ACTIVE, TODAY.plusDays(5), true);
        assertThat(SubscriptionService.extendedTerm(s, TODAY)).isEqualTo(TODAY.plusDays(5).plusMonths(1));
    }

    @Test
    void yearlyAndMonthlyPricesBothNormaliseToAMonth() {
        // MRR adds cafés on different cycles together, so both have to land on the same scale.
        Subscription yearly = sub(BillingCycle.YEARLY, SubscriptionStatus.ACTIVE, TODAY, true);
        assertThat(SubscriptionService.monthlyValue(yearly)).isEqualByComparingTo("10.000");

        Subscription monthly = sub(BillingCycle.MONTHLY, SubscriptionStatus.ACTIVE, TODAY, true);
        assertThat(SubscriptionService.monthlyValue(monthly)).isEqualByComparingTo("120.000");
    }

    @Test
    void lifetimeAccessContributesNothingRecurring() {
        Subscription oneTime = sub(BillingCycle.ONE_TIME, SubscriptionStatus.ACTIVE, null, true);
        assertThat(SubscriptionService.monthlyValue(oneTime)).isEqualByComparingTo("0");
    }
}
