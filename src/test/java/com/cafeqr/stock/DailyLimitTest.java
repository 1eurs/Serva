package com.cafeqr.stock;

import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.stock.domain.StockMode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The cheapest rung of the ladder: "only 12 cheesecakes today".
 *
 * <p>The behaviour worth pinning down is that the tally resets <em>implicitly</em> — a stale
 * {@code dailyLimitDate} means zero sold today. There is no nightly job, so if this rolls over
 * wrongly a café silently stops selling at midnight.
 */
class DailyLimitTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 5);
    private static final LocalDate YESTERDAY = TODAY.minusDays(1);

    private MenuItem capped(int limit) {
        MenuItem item = new MenuItem();
        item.setNameEn("Cheesecake");
        item.setStockMode(StockMode.DAILY_LIMIT);
        item.setDailyLimit(limit);
        return item;
    }

    @Test
    void untrackedItemHasNoRemainingCount() {
        MenuItem plain = new MenuItem();
        assertThat(plain.remainingToday(TODAY)).isNull();
    }

    @Test
    void remainingStartsAtTheFullLimit() {
        assertThat(capped(12).remainingToday(TODAY)).isEqualTo(12);
    }

    @Test
    void sellingDrawsDownTodaysTally() {
        MenuItem item = capped(12);

        assertThat(item.consumeDailyLimit(TODAY, 5)).isTrue();

        assertThat(item.remainingToday(TODAY)).isEqualTo(7);
    }

    @Test
    void theCapCannotBeExceededAndNothingIsBookedWhenItWouldBe() {
        MenuItem item = capped(12);
        item.consumeDailyLimit(TODAY, 10);

        assertThat(item.consumeDailyLimit(TODAY, 3)).isFalse();

        // The rejected attempt must not have partially consumed the remainder.
        assertThat(item.remainingToday(TODAY)).isEqualTo(2);
    }

    @Test
    void yesterdaysTallyDoesNotCountAgainstToday() {
        MenuItem item = capped(12);
        item.consumeDailyLimit(YESTERDAY, 12);

        assertThat(item.remainingToday(TODAY)).isEqualTo(12);
        assertThat(item.consumeDailyLimit(TODAY, 12)).isTrue();
    }

    @Test
    void cancellingTheSameDayGivesTheAllowanceBack() {
        MenuItem item = capped(12);
        item.consumeDailyLimit(TODAY, 4);

        item.releaseDailyLimit(TODAY, 4);

        assertThat(item.remainingToday(TODAY)).isEqualTo(12);
    }

    @Test
    void cancellingAnOrderFromAnotherDayLeavesTodayAlone() {
        MenuItem item = capped(12);
        item.consumeDailyLimit(TODAY, 4);

        item.releaseDailyLimit(YESTERDAY, 4);

        assertThat(item.remainingToday(TODAY)).isEqualTo(8);
    }

    @Test
    void aModeWithoutALimitNeverBlocks() {
        MenuItem item = capped(1);
        item.setDailyLimit(null);

        assertThat(item.consumeDailyLimit(TODAY, 999)).isTrue();
        assertThat(item.remainingToday(TODAY)).isNull();
    }
}
