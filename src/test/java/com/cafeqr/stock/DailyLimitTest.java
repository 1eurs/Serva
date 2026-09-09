package com.cafeqr.stock;

import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemDailyTally;
import com.cafeqr.menus.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.domain.StockMode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The cheapest rung of the ladder: "only 12 cheesecakes today".
 *
 * <p>Two behaviours are worth pinning down. The tally resets <em>implicitly</em> — a stale
 * {@code tallyDate} means zero sold today, and there is no nightly job, so if this rolls over
 * wrongly a café silently stops selling at midnight. And the tally is counted per branch:
 * the cap reads the same everywhere, but a cheesecake is eaten somewhere in particular.
 */
class DailyLimitTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 5);
    private static final LocalDate YESTERDAY = TODAY.minusDays(1);
    private static final long BUSY = 7L;
    private static final long QUIET = 8L;

    private DailyLimitService service;

    /** An in-memory stand-in for the table, so roll-over and per-branch keying are real. */
    private final Map<String, MenuItemDailyTally> rows = new HashMap<>();

    private static String key(Object menuItemId, Object branchId) {
        return menuItemId + ":" + branchId;
    }

    @BeforeEach
    void setUp() {
        rows.clear();
        MenuItemDailyTallyRepository repo = mock(MenuItemDailyTallyRepository.class);

        when(repo.lock(any(), any())).thenAnswer(i ->
                Optional.ofNullable(rows.get(key(i.getArgument(0), i.getArgument(1)))));
        when(repo.findByMenuItemIdAndBranchId(any(), any())).thenAnswer(i ->
                Optional.ofNullable(rows.get(key(i.getArgument(0), i.getArgument(1)))));
        doAnswer(i -> rows.computeIfAbsent(key(i.getArgument(0), i.getArgument(1)), k -> {
            MenuItemDailyTally fresh = new MenuItemDailyTally();
            fresh.setMenuItemId(i.getArgument(0));
            fresh.setBranchId(i.getArgument(1));
            fresh.setTallyDate(i.getArgument(2));
            fresh.setSold(0);
            return fresh;
        })).when(repo).insertIfAbsent(any(), any(), any());
        when(repo.save(any())).thenAnswer(i -> {
            MenuItemDailyTally t = i.getArgument(0);
            rows.put(key(t.getMenuItemId(), t.getBranchId()), t);
            return t;
        });
        when(repo.findByBranchIdAndMenuItemIdIn(any(), any())).thenAnswer(i -> rows.values().stream()
                .filter(t -> t.getBranchId().equals(i.getArgument(0)))
                .filter(t -> ((List<?>) i.getArgument(1)).contains(t.getMenuItemId()))
                .toList());

        service = new DailyLimitService(repo);
    }

    private MenuItem capped(int limit) {
        MenuItem item = new MenuItem();
        item.setId(1L);
        item.setNameEn("Cheesecake");
        item.setStockMode(StockMode.DAILY_LIMIT);
        item.setDailyLimit(limit);
        return item;
    }

    @Test
    void uncappedItemHasNoRemainingFigure() {
        MenuItem plain = new MenuItem();
        plain.setId(1L);
        plain.setStockMode(StockMode.NONE);

        assertThat(service.remainingAt(plain, BUSY, TODAY)).isNull();
    }

    @Test
    void freshCapIsFullyAvailable() {
        assertThat(service.remainingAt(capped(12), BUSY, TODAY)).isEqualTo(12);
    }

    @Test
    void sellingDrawsTheCapDown() {
        MenuItem item = capped(12);

        assertThat(service.consume(item, BUSY, 5, TODAY)).isTrue();

        assertThat(service.remainingAt(item, BUSY, TODAY)).isEqualTo(7);
    }

    @Test
    void refusesToOversellTheCap() {
        MenuItem item = capped(12);
        service.consume(item, BUSY, 10, TODAY);

        assertThat(service.consume(item, BUSY, 3, TODAY)).isFalse();

        assertThat(service.remainingAt(item, BUSY, TODAY)).isEqualTo(2);
    }

    @Test
    void tallyResetsWithoutANightlyJob() {
        MenuItem item = capped(12);
        service.consume(item, BUSY, 12, YESTERDAY);

        assertThat(service.remainingAt(item, BUSY, TODAY)).isEqualTo(12);
        assertThat(service.consume(item, BUSY, 12, TODAY)).isTrue();
    }

    @Test
    void cancellingTheSameDayGivesTheSlotBack() {
        MenuItem item = capped(12);
        service.consume(item, BUSY, 4, TODAY);

        service.release(item, BUSY, 4, TODAY);

        assertThat(service.remainingAt(item, BUSY, TODAY)).isEqualTo(12);
    }

    @Test
    void cancellingAgainstAResetTallyChangesNothing() {
        MenuItem item = capped(12);
        service.consume(item, BUSY, 4, TODAY);

        service.release(item, BUSY, 4, YESTERDAY);

        assertThat(service.remainingAt(item, BUSY, TODAY)).isEqualTo(8);
    }

    @Test
    void modeSetButNoNumberMeansUncapped() {
        MenuItem item = capped(12);
        item.setDailyLimit(null);

        assertThat(service.consume(item, BUSY, 999, TODAY)).isTrue();
        assertThat(service.remainingAt(item, BUSY, TODAY)).isNull();
    }

    // ---------------------------------------------------------------- per branch

    /** The bug this table exists to fix: one branch's sales must not close another's. */
    @Test
    void oneBranchSellingOutLeavesTheOtherUntouched() {
        MenuItem item = capped(10);

        assertThat(service.consume(item, BUSY, 10, TODAY)).isTrue();

        assertThat(service.remainingAt(item, BUSY, TODAY)).isZero();
        assertThat(service.remainingAt(item, QUIET, TODAY)).isEqualTo(10);
        assertThat(service.consume(item, QUIET, 10, TODAY)).isTrue();
    }

    /** And a cancellation must give the slot back to the branch that lost it, not the other. */
    @Test
    void cancellingGivesTheSlotBackToItsOwnBranch() {
        MenuItem item = capped(10);
        service.consume(item, BUSY, 6, TODAY);
        service.consume(item, QUIET, 2, TODAY);

        service.release(item, BUSY, 6, TODAY);

        assertThat(service.remainingAt(item, BUSY, TODAY)).isEqualTo(10);
        assertThat(service.remainingAt(item, QUIET, TODAY)).isEqualTo(8);
    }

    /** No branch named is not "branch zero" — there is no restaurant-wide figure to give. */
    @Test
    void withoutABranchThereIsNoFigure() {
        MenuItem item = capped(10);

        assertThat(service.remainingAt(item, null, TODAY)).isNull();
    }

    @Test
    void bulkLookupCountsOnlyTheBranchAsked() {
        MenuItem item = capped(10);
        service.consume(item, BUSY, 3, TODAY);

        Map<Long, Integer> busy = service.soldByItem(BUSY, List.of(item.getId()), TODAY);
        Map<Long, Integer> quiet = service.soldByItem(QUIET, List.of(item.getId()), TODAY);

        assertThat(service.remainingFrom(item, busy)).isEqualTo(7);
        assertThat(service.remainingFrom(item, quiet)).isEqualTo(10);
    }
}
