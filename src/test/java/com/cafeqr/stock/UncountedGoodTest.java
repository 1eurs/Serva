package com.cafeqr.stock;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMode;
import com.cafeqr.stock.repository.RecipeLineRepository;
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
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.when;

/**
 * A countable good that nobody has counted yet must not refuse sales.
 *
 * <p>Choosing "bought ready-made" creates the backing good automatically, so the count
 * starts with no level row at all. Reading that as zero meant the feature's first act was
 * to refuse a croissant sitting in the display case. Never-counted is unknown, not none —
 * the same rule {@code canMake} already applies to a RECIPE item with no recipe.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UncountedGoodTest {

    private static final long RESTAURANT = 1L;
    private static final long BRANCH = 7L;
    private static final long GOOD = 42L;

    @Mock private StockService stockService;
    @Mock private RecipeService recipeService;
    @Mock private StockLevelRepository levelRepository;
    @Mock private StockMovementRepository movementRepository;
    @Mock private RecipeLineRepository recipeLineRepository;
    @Mock private MenuItemRepository menuItemRepository;
    @Mock private RestaurantRepository restaurantRepository;

    private StockConsumptionService service;

    @BeforeEach
    void setUp() {
        service = new StockConsumptionService(stockService, recipeService, levelRepository,
                movementRepository, recipeLineRepository, menuItemRepository, restaurantRepository,
                new ObjectMapper());

        Restaurant restaurant = new Restaurant();
        restaurant.setAutoHideOutOfStock(true);   // the default, and the strict case
        when(restaurantRepository.findById(RESTAURANT)).thenReturn(Optional.of(restaurant));

        // Named so the refusal message can be built when a refusal is the correct outcome.
        StockItem good = new StockItem();
        good.setId(GOOD);
        good.setNameEn("Croissant");
        when(stockService.getItem(GOOD)).thenReturn(good);
    }

    private MenuItem readyMade() {
        MenuItem item = new MenuItem();
        item.setId(100L);
        item.setRestaurantId(RESTAURANT);
        item.setNameEn("Croissant");
        item.setStockMode(StockMode.SIMPLE);
        item.setStockItemId(GOOD);
        item.setAvailable(true);
        return item;
    }

    /** No level row for the branch: the café has never said how many it has. */
    private void neverCounted() {
        when(levelRepository.findByStockItemIdAndBranchId(GOOD, BRANCH)).thenReturn(Optional.empty());
    }

    /** A level row saying zero: the café HAS counted, and the answer was none. */
    private void countedTo(BigDecimal quantity) {
        StockLevel level = new StockLevel();
        level.setStockItemId(GOOD);
        level.setBranchId(BRANCH);
        level.setQuantityBase(quantity);
        when(levelRepository.findByStockItemIdAndBranchId(GOOD, BRANCH)).thenReturn(Optional.of(level));
    }

    @Test
    void sellsWhenTheGoodHasNeverBeenCounted() {
        MenuItem item = readyMade();
        neverCounted();
        when(recipeService.explode(any(), any(), any(), anyBoolean()))
                .thenReturn(List.of(new RecipeService.Draw(GOOD, BigDecimal.ONE)));

        assertThatCode(() -> service.requireSellable(item, BRANCH, 1, List.of(), OrderType.DINE_IN, false))
                .doesNotThrowAnyException();
    }

    @Test
    void refusesOnceCountedToZero() {
        MenuItem item = readyMade();
        countedTo(BigDecimal.ZERO);
        when(recipeService.explode(any(), any(), any(), anyBoolean()))
                .thenReturn(List.of(new RecipeService.Draw(GOOD, BigDecimal.ONE)));

        assertThatThrownBy(() -> service.requireSellable(item, BRANCH, 1, List.of(), OrderType.DINE_IN, false))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void sellsWhenCounted() {
        MenuItem item = readyMade();
        countedTo(new BigDecimal("6"));
        when(recipeService.explode(any(), any(), any(), anyBoolean()))
                .thenReturn(List.of(new RecipeService.Draw(GOOD, BigDecimal.ONE)));

        assertThatCode(() -> service.requireSellable(item, BRANCH, 1, List.of(), OrderType.DINE_IN, false))
                .doesNotThrowAnyException();
    }

    /** The sold-out report drives the stock page's "off your menu" strip and the greyed-out
     *  customer menu, and it reached the same wrong conclusion from the same missing row. */
    @Test
    void uncountedGoodIsNotReportedSoldOut() {
        MenuItem item = readyMade();
        neverCounted();
        when(menuItemRepository.findByRestaurantIdAndStockModeNot(RESTAURANT, StockMode.NONE))
                .thenReturn(List.of(item));
        when(levelRepository.findByBranchId(BRANCH)).thenReturn(List.of());
        when(recipeLineRepository.findByMenuItemIdIn(any())).thenReturn(List.of());

        assertThat(service.soldOutItemIds(RESTAURANT, BRANCH)).doesNotContain(item.getId());
    }

    /** …but a good counted to zero belongs in it. */
    @Test
    void goodCountedToZeroIsReportedSoldOut() {
        MenuItem item = readyMade();
        StockLevel level = new StockLevel();
        level.setStockItemId(GOOD);
        level.setBranchId(BRANCH);
        level.setQuantityBase(BigDecimal.ZERO);
        when(menuItemRepository.findByRestaurantIdAndStockModeNot(RESTAURANT, StockMode.NONE))
                .thenReturn(List.of(item));
        when(levelRepository.findByBranchId(BRANCH)).thenReturn(List.of(level));
        when(recipeLineRepository.findByMenuItemIdIn(any())).thenReturn(List.of());

        assertThat(service.soldOutItemIds(RESTAURANT, BRANCH)).contains(item.getId());
    }
}
