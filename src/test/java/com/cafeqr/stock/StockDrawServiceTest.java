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
import com.cafeqr.stock.domain.OrderItemDraw;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
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
import java.util.ArrayList;
import java.util.Collection;
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
 * The promises: a sale draws its whole recipe, nothing moves twice, a restore reverses what was
 * recorded and not what the recipe now says, the count never goes below zero, and nothing is
 * hidden unless the owner said so.
 */
@ExtendWith(MockitoExtension.class)
class StockDrawServiceTest {

    private static final long BRANCH = 2L;
    private static final long CROISSANT = 10L;   // takes 1 from the box
    private static final long LATTE = 11L;       // takes 200 ml of milk and 18 g of beans
    private static final long TEA = 12L;         // no recipe, capped at 3 a day
    private static final long BOX = 5L;
    private static final long MILK = 6L;         // bottles of 1 L
    private static final long BEANS = 7L;        // kilos

    @Mock private MenuItemStockRepository caps;
    @Mock private RecipeLineRepository recipes;
    @Mock private StockItemRepository stockItems;
    @Mock private OrderItemDrawRepository draws;
    @Mock private MenuItemDailyTallyRepository tallies;

    private StockDrawService service;
    private Restaurant restaurant;
    private StockItem box;
    private StockItem milk;
    private StockItem beans;
    private final List<RecipeLine> allRecipes = new ArrayList<>();
    private final List<OrderItemDraw> savedDraws = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new StockDrawService(caps, recipes, stockItems, draws, tallies);

        restaurant = new Restaurant();
        restaurant.setHideWhenOutOfStock(true);

        box = tin(BOX, "Croissants", StockUnit.PIECE, "5");
        milk = tin(MILK, "Milk", StockUnit.PIECE, "4");
        milk.setPackSize(BigDecimal.ONE);
        milk.setPackUnit(StockUnit.L);
        beans = tin(BEANS, "Beans", StockUnit.KG, "2");

        allRecipes.add(recipe(CROISSANT, BOX, "1", StockUnit.PIECE));
        allRecipes.add(recipe(LATTE, MILK, "200", StockUnit.ML));
        allRecipes.add(recipe(LATTE, BEANS, "18", StockUnit.G));
        MenuItemStock teaCap = new MenuItemStock();
        teaCap.setMenuItemId(TEA);
        teaCap.setBranchId(BRANCH);
        teaCap.setDailyLimit(3);

        lenient().when(recipes.findByBranchIdAndMenuItemIdIn(eq(BRANCH), anyCollection())).thenAnswer(inv -> {
            Collection<?> ids = inv.getArgument(1);
            return allRecipes.stream().filter(r -> ids.contains(r.getMenuItemId())).toList();
        });
        lenient().when(caps.findByBranchIdAndMenuItemIdIn(eq(BRANCH), anyCollection())).thenAnswer(inv -> {
            Collection<?> ids = inv.getArgument(1);
            return ids.contains(TEA) ? List.of(teaCap) : List.of();
        });
        lenient().when(stockItems.findByIdIn(anyCollection())).thenAnswer(inv -> {
            Collection<?> ids = inv.getArgument(0);
            return List.of(box, milk, beans).stream().filter(t -> ids.contains(t.getId())).toList();
        });
        for (StockItem t : List.of(box, milk, beans)) {
            lenient().when(stockItems.findByIdForUpdate(t.getId())).thenReturn(Optional.of(t));
        }
        lenient().when(tallies.findByBranchIdAndCafeDayAndMenuItemIdIn(eq(BRANCH), any(), anyCollection()))
                .thenReturn(List.of());
        // The draw table is a list in memory: saved rows are what a restore later finds.
        lenient().when(draws.saveAll(any())).thenAnswer(inv -> {
            List<OrderItemDraw> in = new ArrayList<>();
            ((Iterable<OrderItemDraw>) inv.getArgument(0)).forEach(in::add);
            savedDraws.addAll(in);
            return in;
        });
        lenient().when(draws.findByOrderItemIdIn(anyCollection())).thenAnswer(inv -> {
            Collection<?> ids = inv.getArgument(0);
            return savedDraws.stream().filter(d -> ids.contains(d.getOrderItemId())).toList();
        });
        lenient().doAnswer(inv -> {
            Collection<?> ids = inv.getArgument(0);
            savedDraws.removeIf(d -> ids.contains(d.getOrderItemId()));
            return null;
        }).when(draws).deleteByOrderItemIdIn(anyCollection());
    }

    // ------------------------------------------------------------------ draw

    @Test
    void aSaleDrawsEveryLineOfItsRecipeInTheTinsOwnUnit() {
        Order order = order(line(1L, LATTE, 2), line(2L, CROISSANT, 1));

        service.draw(order);

        assertThat(milk.getQuantity()).isEqualByComparingTo("3.6");     // 2 × 200 ml of 1 L bottles
        assertThat(beans.getQuantity()).isEqualByComparingTo("1.964");  // 2 × 18 g of a kg
        assertThat(box.getQuantity()).isEqualByComparingTo("4");
        assertThat(savedDraws).hasSize(3);
        assertThat(order.getStockDrawnAt()).isNotNull();
    }

    @Test
    void aLineWithNoRecipeDrawsNothingButStillCounts() {
        Order order = order(line(1L, TEA, 2));

        service.draw(order);

        assertThat(savedDraws).isEmpty();
        verify(tallies).add(TEA, BRANCH, LocalDate.now(TimeZones.CAFES), 2);
        assertThat(order.getStockDrawnAt()).isNotNull();
    }

    @Test
    void drawClampsAtZeroAndRecordsWhatItActuallyGot() {
        box.setQuantity(new BigDecimal("1"));
        Order order = order(line(1L, CROISSANT, 4));

        service.draw(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("0");
        assertThat(savedDraws.get(0).getQuantity()).isEqualByComparingTo("1");
    }

    @Test
    void drawingTwiceMovesNothingTwice() {
        Order order = order(line(1L, CROISSANT, 2));

        service.draw(order);
        service.draw(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("3");
        verify(tallies, times(1)).add(eq(CROISSANT), eq(BRANCH), any(), eq(2));
    }

    @Test
    void drawSkipsATinThatHasBeenThrownAway() {
        when(stockItems.findByIdForUpdate(BOX)).thenReturn(Optional.empty());
        Order order = order(line(1L, CROISSANT, 2));

        service.draw(order);

        assertThat(savedDraws).isEmpty();
        assertThat(order.getStockDrawnAt()).isNotNull();   // still marked: the tally was made
    }

    // ------------------------------------------------------------------ restore

    @Test
    void restorePutsBackWhatWasRecordedNotWhatTheRecipeNowSays() {
        Order order = order(line(1L, LATTE, 1));
        service.draw(order);
        // The owner rewrites the latte to take a whole litre between accept and cancel.
        allRecipes.removeIf(r -> r.getMenuItemId() == LATTE);
        allRecipes.add(recipe(LATTE, MILK, "1", StockUnit.L));

        service.restore(order);

        assertThat(milk.getQuantity()).isEqualByComparingTo("4");
        assertThat(beans.getQuantity()).isEqualByComparingTo("2");
        assertThat(savedDraws).isEmpty();
        assertThat(order.getStockDrawnAt()).isNull();
    }

    @Test
    void restoreOfAnOrderThatNeverDrewIsANoOp() {
        Order order = order(line(1L, CROISSANT, 2));   // declined straight from PENDING

        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("5");
        verify(tallies, never()).subtract(anyLong(), anyLong(), any(), org.mockito.ArgumentMatchers.anyInt());
        verify(draws, never()).deleteByOrderItemIdIn(anyCollection());
    }

    @Test
    void restoringTwiceMovesNothingTwice() {
        Order order = order(line(1L, CROISSANT, 2));
        service.draw(order);

        service.restore(order);
        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("5");
        verify(tallies, times(1)).subtract(eq(CROISSANT), eq(BRANCH), any(), eq(2));
    }

    @Test
    void restoreComesOffTheDayTheDrawWasMadeNotToday() {
        Order order = order(line(1L, CROISSANT, 1));
        service.draw(order);
        Instant lastNight = Instant.now().minus(1, ChronoUnit.DAYS);
        order.setStockDrawnAt(lastNight);

        service.restore(order);

        verify(tallies).subtract(CROISSANT, BRANCH, LocalDate.ofInstant(lastNight, TimeZones.CAFES), 1);
    }

    @Test
    void restoreLeavesAClampedDrawExactlyBalanced() {
        box.setQuantity(new BigDecimal("1"));
        Order order = order(line(1L, CROISSANT, 4));
        service.draw(order);   // took 1 of the 4

        service.restore(order);

        assertThat(box.getQuantity()).isEqualByComparingTo("1");   // not 4
    }

    // ------------------------------------------------------------------ the guard

    @Test
    void anItemWithNoRecipeIsNeverRefusedByTheShelf() {
        box.setQuantity(BigDecimal.ZERO);
        service.requireAvailable(restaurant, BRANCH, List.of(line(1L, TEA, 2)));
    }

    @Test
    void withTheSwitchOffAnEmptyShelfRefusesNothing() {
        restaurant.setHideWhenOutOfStock(false);
        milk.setQuantity(BigDecimal.ZERO);

        service.requireAvailable(restaurant, BRANCH, List.of(line(1L, LATTE, 3)));
    }

    @Test
    void withTheSwitchOnAShortTinRefusesAndNamesIt() {
        milk.setQuantity(new BigDecimal("0.3"));   // 300 ml: one latte, not two

        service.requireAvailable(restaurant, BRANCH, List.of(line(1L, LATTE, 1)));
        assertThatThrownBy(() -> service.requireAvailable(restaurant, BRANCH, List.of(line(1L, LATTE, 2))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Not enough Milk")
                .extracting(e -> ((BadRequestException) e).getErrorCode())
                .isEqualTo(ErrorCode.MENU_ITEM_UNAVAILABLE);
    }

    @Test
    void theGuardAddsUpEveryLineThatPoursFromTheSameTin() {
        milk.setQuantity(new BigDecimal("0.5"));   // 500 ml: two lattes, not three
        assertThatThrownBy(() -> service.requireAvailable(restaurant, BRANCH,
                List.of(line(1L, LATTE, 2), line(2L, LATTE, 1))))
                .isInstanceOf(BadRequestException.class);

        service.requireAvailable(restaurant, BRANCH, List.of(line(1L, LATTE, 1), line(2L, LATTE, 1)));
    }

    @Test
    void aDailyCapRefusesRegardlessOfTheSwitch() {
        restaurant.setHideWhenOutOfStock(false);
        soldToday(TEA, 2);   // 2 of 3 gone

        assertThatThrownBy(() -> service.requireAvailable(restaurant, BRANCH, List.of(line(1L, TEA, 2))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Only 1");
        service.requireAvailable(restaurant, BRANCH, List.of(line(1L, TEA, 1)));
    }

    // ------------------------------------------------------------------ the menu's verdict

    @Test
    void availabilityIsOutWhenOneIngredientCannotCoverASingleSale() {
        milk.setQuantity(new BigDecimal("0.1"));   // 100 ml cannot make a 200 ml latte
        soldToday(TEA, 1);

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(CROISSANT, LATTE, TEA, 99L));

        assertThat(a.get(LATTE).soldOut()).isTrue();
        assertThat(a.get(CROISSANT).soldOut()).isFalse();
        assertThat(a.get(TEA).soldOut()).isFalse();
        assertThat(a.get(TEA).remainingToday()).isEqualTo(2);
        assertThat(a).doesNotContainKey(99L);   // no recipe, no cap: nothing to say
    }

    @Test
    void withTheSwitchOffTheShelfHidesNothingButACapStillCounts() {
        restaurant.setHideWhenOutOfStock(false);
        milk.setQuantity(BigDecimal.ZERO);
        soldToday(TEA, 3);

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(LATTE, TEA));

        assertThat(a.get(LATTE).soldOut()).isFalse();
        assertThat(a.get(TEA).soldOut()).isTrue();
        assertThat(a.get(TEA).remainingToday()).isZero();
    }

    @Test
    void aCapLoweredBelowTodaysSalesReadsAsZeroLeftNotNegative() {
        soldToday(TEA, 7);

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(TEA));

        assertThat(a.get(TEA).remainingToday()).isZero();
        assertThat(a.get(TEA).soldOut()).isTrue();
    }

    @Test
    void aRecipeWhoseTinCannotBeFoundHidesNothing() {
        when(stockItems.findByIdIn(anyCollection())).thenReturn(List.of());

        Map<Long, ItemAvailability> a = service.availability(restaurant, BRANCH, List.of(CROISSANT));

        assertThat(a.get(CROISSANT).soldOut()).isFalse();
        service.requireAvailable(restaurant, BRANCH, List.of(line(1L, CROISSANT, 9)));
    }

    // ------------------------------------------------------------------ fixtures

    private static StockItem tin(long id, String name, StockUnit unit, String qty) {
        StockItem t = new StockItem();
        t.setId(id);
        t.setBranchId(BRANCH);
        t.setNameEn(name);
        t.setUnit(unit);
        t.setQuantity(new BigDecimal(qty));
        return t;
    }

    private static RecipeLine recipe(long menuItemId, long tin, String qty, StockUnit unit) {
        RecipeLine r = new RecipeLine();
        r.setMenuItemId(menuItemId);
        r.setBranchId(BRANCH);
        r.setStockItemId(tin);
        r.setQuantity(new BigDecimal(qty));
        r.setUnit(unit);
        return r;
    }

    private static OrderItem line(long id, long menuItemId, int qty) {
        OrderItem i = new OrderItem();
        i.setId(id);
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
