package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.menus.domain.OptionSelectionType;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.stock.domain.BaseUnit;
import com.cafeqr.stock.domain.OrderTypeScope;
import com.cafeqr.stock.domain.PackagingRule;
import com.cafeqr.stock.domain.PackagingRuleLine;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockMode;
import com.cafeqr.stock.repository.PackagingRuleRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * The consumption model, which is the load-bearing idea of the whole feature: what a sale draws
 * is {@code base recipe + SUM(chosen option deltas)}, exactly mirroring how price already works.
 *
 * <p>The cases that matter are the ones a café will actually hit — a Large that swaps an 8 oz cup
 * for a 12 oz one, and a dine-in drink that must not burn a paper cup.
 */
@ExtendWith(MockitoExtension.class)
class RecipeServiceExplodeTest {

    private static final Long RESTAURANT = 1L;
    private static final Long LATTE = 10L;
    private static final Long LARGE_OPTION = 20L;

    private static final Long BEANS = 100L;
    private static final Long MILK = 101L;
    private static final Long CUP_8 = 102L;
    private static final Long CUP_12 = 103L;
    private static final Long LID = 104L;

    @Mock private RecipeLineRepository recipeLineRepository;
    @Mock private PackagingRuleRepository packagingRuleRepository;
    @Mock private StockItemRepository stockItemRepository;
    @Mock private MenuItemRepository menuItemRepository;
    @Mock private AccessGuard accessGuard;

    private RecipeService recipeService;
    private MenuItem latte;

    @BeforeEach
    void setUp() {
        recipeService = new RecipeService(recipeLineRepository, packagingRuleRepository,
                stockItemRepository, menuItemRepository, accessGuard);
        // Most cases pick no options; the ones that do override this with a specific stub.
        lenient().when(recipeLineRepository.findByMenuItemOptionIdIn(anyList())).thenReturn(List.of());
        lenient().when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of());

        latte = new MenuItem();
        latte.setId(LATTE);
        latte.setRestaurantId(RESTAURANT);
        latte.setNameEn("Latte");
        latte.setNameAr("لاتيه");
        latte.setPrice(new BigDecimal("1.500"));
        latte.setStockMode(StockMode.RECIPE);

        MenuItemOptionGroup size = new MenuItemOptionGroup();
        size.setId(2L);
        size.setMenuItem(latte);
        size.setNameEn("Size");
        size.setNameAr("الحجم");
        size.setSelectionType(OptionSelectionType.SINGLE);
        MenuItemOption large = new MenuItemOption();
        large.setId(LARGE_OPTION);
        large.setOptionGroup(size);
        large.setNameEn("Large");
        large.setNameAr("كبير");
        size.getOptions().add(large);
        latte.getOptionGroups().add(size);
    }

    private RecipeLine line(Long stockItemId, String quantity, OrderTypeScope scope) {
        RecipeLine l = new RecipeLine();
        l.setRestaurantId(RESTAURANT);
        l.setStockItemId(stockItemId);
        l.setQuantityBase(new BigDecimal(quantity));
        l.setOrderTypeScope(scope);
        return l;
    }

    private Map<Long, BigDecimal> asMap(List<RecipeService.Draw> draws) {
        return draws.stream().collect(Collectors.toMap(
                RecipeService.Draw::stockItemId, RecipeService.Draw::quantityBase));
    }

    @Test
    void baseRecipeIsDrawnWhenNoOptionsAreChosen() {
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL),
                line(MILK, "200", OrderTypeScope.ALL)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(), OrderType.DINE_IN, false));

        assertThat(draws).containsOnlyKeys(BEANS, MILK);
        assertThat(draws.get(BEANS)).isEqualByComparingTo("18");
        assertThat(draws.get(MILK)).isEqualByComparingTo("200");
    }

    @Test
    void optionQuantitiesAddOnTopOfTheBaseJustLikePriceDeltas() {
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL)));
        when(recipeLineRepository.findByMenuItemOptionIdIn(List.of(LARGE_OPTION))).thenReturn(List.of(
                line(BEANS, "9", OrderTypeScope.ALL)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(LARGE_OPTION), OrderType.DINE_IN, false));

        assertThat(draws.get(BEANS)).isEqualByComparingTo("27");
    }

    @Test
    void aNegativeOptionLineSwapsTheSmallCupOutAndTheLargeOneIn() {
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(CUP_8, "1", OrderTypeScope.ALL)));
        when(recipeLineRepository.findByMenuItemOptionIdIn(List.of(LARGE_OPTION))).thenReturn(List.of(
                line(CUP_8, "-1", OrderTypeScope.ALL),
                line(CUP_12, "1", OrderTypeScope.ALL)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(LARGE_OPTION), OrderType.CAR, false));

        // The 8 oz cup nets to zero and is dropped entirely — not credited back to stock.
        assertThat(draws).containsOnlyKeys(CUP_12);
        assertThat(draws.get(CUP_12)).isEqualByComparingTo("1");
    }

    @Test
    void aLineScopedToCarIsSkippedForDineIn() {
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL),
                line(CUP_8, "1", OrderTypeScope.CAR)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(), OrderType.DINE_IN, false));

        assertThat(draws).containsOnlyKeys(BEANS);
    }

    @Test
    void carOrdersAlwaysBurnTheMappedPackaging() {
        latte.setPackagingRuleId(5L);
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL)));
        when(packagingRuleRepository.findById(5L)).thenReturn(Optional.of(rule(5L)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(), OrderType.CAR, false));

        assertThat(draws).containsOnlyKeys(BEANS, CUP_12, LID);
        assertThat(draws.get(LID)).isEqualByComparingTo("1");
    }

    @Test
    void aCeramicCafeBurnsNoPackagingOnDineIn() {
        latte.setPackagingRuleId(5L);
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(), OrderType.DINE_IN, false));

        assertThat(draws).containsOnlyKeys(BEANS);
    }

    @Test
    void aPaperForEverythingCafeBurnsPackagingOnDineInToo() {
        latte.setPackagingRuleId(5L);
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL)));
        when(packagingRuleRepository.findById(5L)).thenReturn(Optional.of(rule(5L)));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(), OrderType.DINE_IN, true));

        assertThat(draws).containsKeys(CUP_12, LID);
    }

    @Test
    void theChosenSizesPackagingBeatsTheItemDefault() {
        latte.setPackagingRuleId(5L);
        latte.getOptionGroups().get(0).getOptions().get(0).setPackagingRuleId(6L);
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of());
        when(recipeLineRepository.findByMenuItemOptionIdIn(List.of(LARGE_OPTION))).thenReturn(List.of());
        PackagingRule big = new PackagingRule();
        big.setId(6L);
        big.setRestaurantId(RESTAURANT);
        PackagingRuleLine only = new PackagingRuleLine();
        only.setStockItemId(CUP_12);
        only.setQuantityBase(new BigDecimal("2")); // distinguishable from the item default
        big.addLine(only);
        when(packagingRuleRepository.findById(6L)).thenReturn(Optional.of(big));

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(LARGE_OPTION), OrderType.CAR, false));

        assertThat(draws).containsOnlyKeys(CUP_12);
        assertThat(draws.get(CUP_12)).isEqualByComparingTo("2");
    }

    @Test
    void aCountedGoodIsAOneLineRecipeSoTheEngineNeverSpecialCasesIt() {
        latte.setStockMode(StockMode.SIMPLE);
        latte.setStockItemId(BEANS);

        Map<Long, BigDecimal> draws = asMap(
                recipeService.explode(latte, List.of(), OrderType.DINE_IN, false));

        assertThat(draws).containsOnlyKeys(BEANS);
        assertThat(draws.get(BEANS)).isEqualByComparingTo("1");
    }

    @Test
    void plateCostAppliesTheWasteAllowanceOnTopOfTheRecipe() {
        when(recipeLineRepository.findByMenuItemId(LATTE)).thenReturn(List.of(
                line(BEANS, "18", OrderTypeScope.ALL)));
        StockItem beans = stockItem(BEANS, "0.01", "0");     // 0.01 per gram
        StockItem beansWithWaste = stockItem(BEANS, "0.01", "10"); // 10% grinder retention
        when(stockItemRepository.findAllById(anyList()))
                .thenReturn(List.of(beans))
                .thenReturn(List.of(beansWithWaste));

        BigDecimal plain = recipeService.plateCost(latte);
        BigDecimal withWaste = recipeService.plateCost(latte);

        assertThat(plain).isEqualByComparingTo("0.18");
        // 18 g + 10% = 19.8 g at 0.01
        assertThat(withWaste).isEqualByComparingTo("0.198");
    }

    @Test
    void foodCostPercentIsCostOverPrice() {
        assertThat(recipeService.foodCostPercent(new BigDecimal("0.185"), new BigDecimal("1.500")))
                .isEqualByComparingTo("12.3");
        assertThat(recipeService.foodCostPercent(null, new BigDecimal("1.5"))).isNull();
        assertThat(recipeService.foodCostPercent(new BigDecimal("0.1"), BigDecimal.ZERO)).isNull();
    }

    private PackagingRule rule(Long id) {
        PackagingRule rule = new PackagingRule();
        rule.setId(id);
        rule.setRestaurantId(RESTAURANT);
        rule.setNameEn("Large hot cup");
        rule.setNameAr("كوب كبير");
        PackagingRuleLine cup = new PackagingRuleLine();
        cup.setStockItemId(CUP_12);
        cup.setQuantityBase(BigDecimal.ONE);
        rule.addLine(cup);
        PackagingRuleLine lid = new PackagingRuleLine();
        lid.setStockItemId(LID);
        lid.setQuantityBase(BigDecimal.ONE);
        rule.addLine(lid);
        return rule;
    }

    private StockItem stockItem(Long id, String cost, String wastePct) {
        StockItem item = new StockItem();
        item.setId(id);
        item.setRestaurantId(RESTAURANT);
        item.setNameEn("Beans");
        item.setNameAr("بن");
        item.setBaseUnit(BaseUnit.G);
        item.setCostPerBaseUnit(new BigDecimal(cost));
        item.setWastePct(new BigDecimal(wastePct));
        return item;
    }
}
