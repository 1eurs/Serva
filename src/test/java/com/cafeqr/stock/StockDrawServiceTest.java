package com.cafeqr.stock;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.StockDrawService.ItemAvailability;
import com.cafeqr.stock.domain.MenuItemDailyTally;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The promises: nothing moves twice, a restore reverses what was recorded and not what the rule
 * now says, the count never goes below zero, and nothing is hidden unless the owner said so.
 */
@ExtendWith(MockitoExtension.class)
class StockDrawServiceTest {

    private static final long BRANCH = 2L;
    private static final long CROISSANT = 10L;   // menu item, backed by the box
    private static final long LATTE = 11L;       // menu item, no rule at all
    private static final long CAKE = 12L;        // menu item, capped at 3 a day
    private static final long BOX = 5L;          // the shelf row of croissants

    @Mock private MenuItemStockRepository rules;
    @Mock private StockItemRepository stockItems;
    @Mock private MenuItemDailyTallyRepository tallies;

    private StockDrawService service;
    private Restaurant restaurant;
    private StockItem box;
    private MenuItemStock croissantRule;
    private MenuItemStock cakeRule;

    @BeforeEach
    void setUp() {
        service = new StockDrawService(rules, stockItems, tallies);

        restaurant = new Restaurant();
        restaurant.setHideWhenOutOfStock(true);

        box = new StockItem();
        box.setId(BOX);
        box.setBranchId(BRANCH);
        box.setNameEn("Croissants");
        box.setUnit(StockUnit.PIECE);
        box.setQuantity(new BigDecimal("5.000"));

        croissantRule = rule(CROISSANT, BOX, null);
        cakeRule = rule(CAKE, null, 3);

        lenient().when(rules.findByBranchIdAndMenuItemIdIn(eq(BRANCH), anyCollection()))
                .thenAnswer(inv -> {
                    var ids = (java.util.Collection<?>) inv.getArgument(1);
                    return List.of(croissantRule, cakeRule).stream()
                            .filter(r -> ids.contains(r.getMenuItemId())).toList();
                });
        lenient().when(stockItems.findByIdIn(anyCollection())).thenReturn(List.of(box));
        lenient().when(stockItems.findByIdForUpdate(BOX)).thenReturn(Optional.of(box));
        lenient().when(tallies.findByBranchIdAndCafeDayAndMenuItemIdIn(eq(BRANCH), any(), anyCollection()))
                .thenReturn(List.of());
    }

    // ------------------------------------------------------------------ draw

    @Test
    void drawTakesOnePerUnitSoldAndWritesItOnTheLine() {
        Order order = order(line(CROISSANT, 2), line(LATTE, 1));

        service.draw(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("3");
        OrderItem croissants = order.getItems().get(0);
        assertThat(croissants.getDrawnStockItemId()).isEqualTo(BOX);
        assertThat(croissants.getDrawnQty()).isEqualByComparingTo("2");
        // The latte has no rule: nothing drawn, nothing recorded.
        assertThat(order.getItems().get(1).getDrawnStockItemId()).isNull();
        assertThat(order.getStockDrawnAt()).isNotNull();
    }

    @Test
    void drawClampsAtZeroAndRecordsWhatItActuallyGot() {
        box.setQuantity(new BigDecimal("1"));
        Order order = order(line(CROISSANT, 4));

        service.draw(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("0");
        assertThat(order.getItems().get(0).getDrawnQty()).isEqualByComparingTo("1");
    }

    @Test
    void drawingTwiceMovesNothingTwice() {
        Order order = order(line(CROISSANT, 2));

        service.draw(order);
        service.draw(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("3");
        verify(tallies, times(1)).add(eq(CROISSANT), eq(BRANCH), any(), eq(2));
    }

    @Test
    void drawTalliesEveryLineWhetherOrNotItHasARule() {
        Order order = order(line(CROISSANT, 2), line(LATTE, 3), line(CAKE, 1));

        service.draw(order);

        LocalDate today = LocalDate.now(TimeZones.CAFES);
        verify(tallies).add(CROISSANT, BRANCH, today, 2);
        verify(tallies).add(LATTE, BRANCH, today, 3);
        verify(tallies).add(CAKE, BRANCH, today, 1);
    }

    @Test
    void drawSkipsALineWhoseTinHasBeenThrownAway() {
        when(stockItems.findByIdForUpdate(BOX)).thenReturn(Optional.empty());
        Order order = order(line(CROISSANT, 2));

        service.draw(order);

        assertThat(order.getItems().get(0).getDrawnStockItemId()).isNull();
        assertThat(order.getStockDrawnAt()).isNotNull();   // still marked: the tally was made
    }

    // ------------------------------------------------------------------ restore

    @Test
    void restorePutsBackWhatTheLineRecordedNotWhatTheRuleNowSays() {
        Order order = order(line(CROISSANT, 2));
        service.draw(order);
        // Owner re-points the croissant at a different tin between accept and cancel.
        croissantRule.setStockItemId(99L);

        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("5");
        verify(stockItems, never()).findByIdForUpdate(99L);
        assertThat(order.getStockDrawnAt()).isNull();
        assertThat(order.getItems().get(0).getDrawnStockItemId()).isNull();
    }

    @Test
    void restoreOfAnOrderThatNeverDrewIsANoOp() {
        Order order = order(line(CROISSANT, 2));   // declined straight from PENDING

        service.restore(order);
        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("5");
        verify(tallies, never()).subtract(anyLong(), anyLong(), any(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void restoringTwiceMovesNothingTwice() {
        Order order = order(line(CROISSANT, 2));
        service.draw(order);

        service.restore(order);
        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("5");
        verify(tallies, times(1)).subtract(eq(CROISSANT), eq(BRANCH), any(), eq(2));
    }

    @Test
    void restoreComesOffTheDayTheDrawWasMadeNotToday() {
        Order order = order(line(CROISSANT, 1));
        service.draw(order);
        // Accepted last night; cancelled this morning.
        Instant lastNight = Instant.now().minus(1, ChronoUnit.DAYS);
        order.setStockDrawnAt(lastNight);

        service.restore(order);

        verify(tallies).subtract(CROISSANT, BRANCH, LocalDate.ofInstant(lastNight, TimeZones.CAFES), 1);
    }

    @Test
    void restoreLeavesAClampedDrawExactlyBalanced() {
        box.setQuantity(new BigDecimal("1"));
        Order order = order(line(CROISSANT, 4));
        service.draw(order);   // took 1 of the 4

        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("1");   // not 4
    }

    // ------------------------------------------------------------------ the guard

    @Test
    void anItemWithNoRuleIsNeverRefused() {
        box.setQuantity(BigDecimal.ZERO);
        service.requireAvailable(restaurant, BRANCH, List.of(line(LATTE, 50)));
    }

    @Test
    void withTheSwitchOffAnEmptyTinRefusesNothing() {
        restaurant.setHideWhenOutOfStock(false);
        box.setQuantity(BigDecimal.ZERO);

        service.requireAvailable(restaurant, BRANCH, List.of(line(CROISSANT, 3)));
    }

    @Test
    void withTheSwitchOnAShortTinRefusesAndSaysHowManyAreLeft() {
        box.setQuantity(new BigDecimal("2"));

        assertThatThrownBy(() -> service.requireAvailable(restaurant, BRANCH, List.of(line(CROISSANT, 3))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Only 2")
                .extracting(e -> ((BadRequestException) e).getErrorCode())
                .isEqualTo(ErrorCode.MENU_ITEM_UNAVAILABLE);
    }

    @Test
    void theGuardAddsUpEveryLineThatDrawsFromTheSameTin() {
        box.setQuantity(new BigDecimal("3"));
        // Two lines of the same item — say, plain and with jam — is one box being asked for four.
        assertThatThrownBy(() -> service.requireAvailable(restaurant, BRANCH,
                List.of(line(CROISSANT, 2), line(CROISSANT, 2))))
                .isInstanceOf(BadRequestException.class);

        service.requireAvailable(restaurant, BRANCH, List.of(line(CROISSANT, 2), line(CROISSANT, 1)));
    }

    @Test
    void aDailyLimitRefusesRegardlessOfTheSwitch() {
        restaurant.setHideWhenOutOfStock(false);
        soldToday(CAKE, 2);   // 2 of 3 gone

        assertThatThrownBy(() -> service.requireAvailable(restaurant, BRANCH, List.of(line(CAKE, 2))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Only 1");
        service.requireAvailable(restaurant, BRANCH, List.of(line(CAKE, 1)));
    }

    // ------------------------------------------------------------------ the menu's verdict

    @Test
    void availabilitySaysSoldOutAndHowManyAreLeft() {
        box.setQuantity(BigDecimal.ZERO);
        soldToday(CAKE, 1);

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(CROISSANT, LATTE, CAKE));

        assertThat(a.get(CROISSANT).soldOut()).isTrue();
        assertThat(a.get(CROISSANT).remainingToday()).isNull();
        assertThat(a.get(CAKE).soldOut()).isFalse();
        assertThat(a.get(CAKE).remainingToday()).isEqualTo(2);
        assertThat(a).doesNotContainKey(LATTE);   // nothing to say
    }

    @Test
    void withTheSwitchOffTheShelfHidesNothingButALimitStillCounts() {
        restaurant.setHideWhenOutOfStock(false);
        box.setQuantity(BigDecimal.ZERO);
        soldToday(CAKE, 3);

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(CROISSANT, CAKE));

        assertThat(a.get(CROISSANT).soldOut()).isFalse();
        assertThat(a.get(CAKE).soldOut()).isTrue();
        assertThat(a.get(CAKE).remainingToday()).isZero();
    }

    @Test
    void aLimitLoweredBelowTodaysSalesReadsAsZeroLeftNotNegative() {
        soldToday(CAKE, 7);

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(CAKE));

        assertThat(a.get(CAKE).remainingToday()).isZero();
        assertThat(a.get(CAKE).soldOut()).isTrue();
    }

    @Test
    void aRuleWhoseTinCannotBeFoundHidesNothing() {
        // The FK nulls the link when a tin is thrown away; a miss can only be a race, and a race
        // must not cost a sale.
        when(stockItems.findByIdIn(anyCollection())).thenReturn(List.of());

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(CROISSANT));

        assertThat(a.get(CROISSANT).soldOut()).isFalse();
        service.requireAvailable(restaurant, BRANCH, List.of(line(CROISSANT, 9)));
    }

    // ------------------------------------------------------------------ fixtures

    private static MenuItemStock rule(long menuItemId, Long stockItemId, Integer limit) {
        MenuItemStock r = new MenuItemStock();
        r.setMenuItemId(menuItemId);
        r.setBranchId(BRANCH);
        r.setStockItemId(stockItemId);
        r.setDailyLimit(limit);
        return r;
    }

    private static OrderItem line(long menuItemId, int qty) {
        OrderItem i = new OrderItem();
        i.setMenuItemId(menuItemId);
        i.setQuantity(qty);
        i.setNameEnSnapshot("item " + menuItemId);
        i.setNameArSnapshot("صنف " + menuItemId);
        i.setPriceSnapshot(BigDecimal.ONE);
        i.setLineTotal(BigDecimal.valueOf(qty));
        return i;
    }

    private static Order order(OrderItem... lines) {
        Order o = new Order();
        o.setId(1L);
        o.setRestaurantId(1L);
        o.setBranchId(BRANCH);
        for (OrderItem l : lines) o.addItem(l);
        return o;
    }

    /** The tally entity is write-only from Java; the test reaches in to build a read. */
    private void soldToday(long menuItemId, int sold) {
        try {
            MenuItemDailyTally t = new MenuItemDailyTally();
            set(t, "menuItemId", menuItemId);
            set(t, "branchId", BRANCH);
            set(t, "cafeDay", LocalDate.now(TimeZones.CAFES));
            set(t, "sold", sold);
            when(tallies.findByBranchIdAndCafeDayAndMenuItemIdIn(eq(BRANCH), any(), anyCollection()))
                    .thenReturn(List.of(t));
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }

    private static void set(Object target, String field, Object value) throws ReflectiveOperationException {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }
}
