package com.cafeqr.stock;

import com.cafeqr.branches.BranchService;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMode;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import com.cafeqr.stock.repository.StockLevelRepository;
import com.cafeqr.stock.repository.StockMovementRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

/**
 * One branch's shelf must not speak for another's.
 *
 * <p>Two facts about a stock item are shared by the whole restaurant — the item's average
 * cost, and whether its menu item is switched on — while the quantity on the shelf is not.
 * Both shared facts were being written from a single branch's on-hand, so a delivery or a
 * shortage at one branch silently rewrote the other branch's prices and menu.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BranchScopedStockTest {

    private static final long RESTAURANT = 1L;
    private static final long BUSY = 7L;    // the branch with stock
    private static final long QUIET = 8L;   // the branch taking the delivery
    private static final long BEANS = 42L;

    @Mock private StockItemRepository itemRepository;
    @Mock private StockLevelRepository levelRepository;
    @Mock private StockMovementRepository movementRepository;
    @Mock private RecipeLineRepository recipeLineRepository;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;
    @Mock private MenuItemRepository menuItemRepository;
    @Mock private RestaurantRepository restaurantRepository;
    @Mock private DailyLimitService dailyLimitService;
    @Mock private RecipeService recipeService;

    private StockService stockService;

    @BeforeEach
    void setUp() {
        stockService = new StockService(itemRepository, levelRepository, movementRepository,
                recipeLineRepository, branchService, accessGuard);
    }

    private StockItem beans(String costPerGram) {
        StockItem item = new StockItem();
        item.setId(BEANS);
        item.setRestaurantId(RESTAURANT);
        item.setNameEn("Beans");
        item.setCostPerBaseUnit(new BigDecimal(costPerGram));
        when(itemRepository.findById(BEANS)).thenReturn(Optional.of(item));
        return item;
    }

    private StockLevel level(long branchId, String quantity) {
        StockLevel level = new StockLevel();
        level.setStockItemId(BEANS);
        level.setBranchId(branchId);
        level.setQuantityBase(new BigDecimal(quantity));
        return level;
    }

    /**
     * A delivery into the quiet branch, blended against every branch's stock.
     *
     * <p>10 kg already on hand at 0.010/g, 1 kg arriving at 0.020/g:
     * (10000×0.010 + 1000×0.020) ÷ 11000 = 0.010909. Weighing it against the receiving
     * branch's empty shelf instead gave 0.020 — the new price outright — and every branch
     * read that as its cost of goods.
     */
    @Test
    void deliveryBlendsAgainstEveryBranchesStock() {
        StockItem item = beans("0.010");
        when(levelRepository.totalOnHand(BEANS)).thenReturn(new BigDecimal("10000"));
        when(levelRepository.lock(BEANS, QUIET)).thenReturn(Optional.of(level(QUIET, "0")));

        stockService.receive(QUIET, BEANS, new BigDecimal("1000"), new BigDecimal("0.020"), null);

        assertThat(item.getCostPerBaseUnit()).isEqualByComparingTo("0.010909");
        assertThat(item.getCostPerBaseUnit()).isNotEqualByComparingTo("0.020");
    }

    /** With nothing anywhere to blend against, the delivery's price is simply the price. */
    @Test
    void firstEverDeliverySetsTheCostOutright() {
        StockItem item = beans("0");
        when(levelRepository.totalOnHand(BEANS)).thenReturn(BigDecimal.ZERO);
        when(levelRepository.lock(BEANS, QUIET)).thenReturn(Optional.of(level(QUIET, "0")));

        stockService.receive(QUIET, BEANS, new BigDecimal("1000"), new BigDecimal("0.020"), null);

        assertThat(item.getCostPerBaseUnit()).isEqualByComparingTo("0.020");
    }

    // ---------------------------------------------------------------- availability

    private StockConsumptionService consumption() {
        return consumption(true);
    }

    private StockConsumptionService consumption(boolean autoHide) {
        /* These items are not capped, so the real service answers "no cap". Mockito's default
           for an Integer return is 0, which would read as "sold out" and mask what is being
           tested here. */
        when(dailyLimitService.remainingAt(any(), any(), any())).thenReturn(null);
        when(dailyLimitService.remainingFrom(any(), any())).thenReturn(null);

        Restaurant restaurant = new Restaurant();
        restaurant.setAutoHideOutOfStock(autoHide);
        when(restaurantRepository.findById(RESTAURANT)).thenReturn(Optional.of(restaurant));
        return new StockConsumptionService(stockService, recipeService, levelRepository,
                movementRepository, recipeLineRepository, menuItemRepository, restaurantRepository,
                dailyLimitService, new ObjectMapper());
    }

    private MenuItem latte() {
        MenuItem item = new MenuItem();
        item.setId(100L);
        item.setRestaurantId(RESTAURANT);
        item.setBranchId(null);            // sold at every branch — the shared row
        item.setNameEn("Latte");
        item.setStockMode(StockMode.SIMPLE);
        item.setStockItemId(BEANS);
        item.setAvailable(true);
        return item;
    }

    /**
     * The busy branch running out must not take the item off sale at the quiet one.
     *
     * <p>This is the shape of the original bug: availability was computed per branch and then
     * written to the restaurant-wide {@code menu_items.available}, so whichever branch moved
     * stock last decided the menu for all of them.
     */
    @Test
    void runningOutAtOneBranchDoesNotSellOutTheOther() {
        MenuItem latte = latte();
        when(menuItemRepository.findByRestaurantIdAndStockModeNot(RESTAURANT, StockMode.NONE))
                .thenReturn(List.of(latte));
        when(recipeLineRepository.findByMenuItemIdIn(any())).thenReturn(List.of());
        when(levelRepository.findByBranchId(BUSY)).thenReturn(List.of(level(BUSY, "0")));
        when(levelRepository.findByBranchId(QUIET)).thenReturn(List.of(level(QUIET, "5000")));

        StockConsumptionService service = consumption();

        assertThat(service.soldOutItemIds(RESTAURANT, BUSY)).contains(latte.getId());
        assertThat(service.soldOutItemIds(RESTAURANT, QUIET)).doesNotContain(latte.getId());
    }

    /**
     * The dashboard's own menu row has to be told the same thing the customer's menu is.
     *
     * <p>An owner reading a switch that says "Available now" over an item every order for
     * which is being refused has been lied to by their own screen — so the row carries both
     * the fact and the ingredient behind it, which is the only part they can act on.
     */
    @Test
    void theDashboardIsToldWhichIngredientTookTheItemOff() {
        MenuItem latte = latte();
        StockItem beans = beans("0.010");
        when(menuItemRepository.findByRestaurantIdAndStockModeNot(RESTAURANT, StockMode.NONE))
                .thenReturn(List.of(latte));
        when(recipeLineRepository.findByMenuItemIdIn(any())).thenReturn(List.of());
        when(itemRepository.findAllById(any())).thenReturn(List.of(beans));
        when(levelRepository.findByBranchId(BUSY)).thenReturn(List.of(level(BUSY, "0")));
        when(levelRepository.findByBranchId(QUIET)).thenReturn(List.of(level(QUIET, "5000")));

        StockConsumptionService service = consumption();

        StockConsumptionService.SoldOut off = service.soldOutByItem(RESTAURANT, BUSY).get(latte.getId());
        assertThat(off).isNotNull();
        assertThat(off.reason()).isEqualTo(StockConsumptionService.OUT_OF_STOCK);
        assertThat(off.blockerNameEn()).isEqualTo("Beans");
        // and the branch with beans on the shelf keeps its switch on, as its customers do
        assertThat(service.soldOutByItem(RESTAURANT, QUIET)).doesNotContainKey(latte.getId());
    }

    /**
     * A café that switched automatic hiding off is still selling the drink, so the switch has
     * to keep saying so — while the stock page goes on reporting the shortfall, because that
     * page's whole job is to warn about exactly those sales.
     */
    @Test
    void withAutoHideOffTheSwitchStaysOnAndOnlyTheStockPageWarns() {
        MenuItem latte = latte();
        StockItem beans = beans("0.010");
        when(menuItemRepository.findByRestaurantIdAndStockModeNot(RESTAURANT, StockMode.NONE))
                .thenReturn(List.of(latte));
        when(recipeLineRepository.findByMenuItemIdIn(any())).thenReturn(List.of());
        when(itemRepository.findAllById(any())).thenReturn(List.of(beans));
        when(levelRepository.findByBranchId(BUSY)).thenReturn(List.of(level(BUSY, "0")));

        StockConsumptionService service = consumption(false);

        assertThat(service.soldOutByItem(RESTAURANT, BUSY)).doesNotContainKey(latte.getId());
        assertThat(service.soldOutItemIds(RESTAURANT, BUSY)).doesNotContain(latte.getId());
        assertThat(service.soldOutDetail(RESTAURANT, BUSY)).isNotEmpty();
    }

    /** And asking the question must not write the answer down on the shared row. */
    @Test
    void askingWhatIsSoldOutNeverPersistsAvailability() {
        MenuItem latte = latte();
        when(menuItemRepository.findByRestaurantIdAndStockModeNot(RESTAURANT, StockMode.NONE))
                .thenReturn(List.of(latte));
        when(recipeLineRepository.findByMenuItemIdIn(any())).thenReturn(List.of());
        when(levelRepository.findByBranchId(BUSY)).thenReturn(List.of(level(BUSY, "0")));

        consumption().soldOutItemIds(RESTAURANT, BUSY);

        assertThat(latte.isAvailable()).isTrue();
        verify(menuItemRepository, never()).save(any());
    }
}
