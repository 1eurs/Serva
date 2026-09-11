package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.dto.MenuStockDtos.OptionLineInput;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeLineInput;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeLineResponse;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeRequest;
import com.cafeqr.stock.dto.MenuStockDtos.RuleRequest;
import com.cafeqr.stock.dto.MenuStockDtos.RuleResponse;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.OptionRecipeLineRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The owner's answers are kept consistent, and a rule never points across the road. */
@ExtendWith(MockitoExtension.class)
class MenuStockServiceTest {

    @Mock private MenuItemStockRepository rules;
    @Mock private RecipeLineRepository recipes;
    @Mock private OptionRecipeLineRepository optionRecipes;
    @Mock private StockItemRepository stockItems;
    @Mock private MenuItemRepository menuItems;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;

    private MenuStockService service;
    private StockItem beansHere;
    private StockItem milkThere;

    @BeforeEach
    void setUp() {
        service = new MenuStockService(rules, recipes, optionRecipes, stockItems, menuItems, branchService, accessGuard);

        Branch here = new Branch();
        here.setId(2L);
        here.setRestaurantId(1L);
        lenient().when(branchService.getEntity(2L)).thenReturn(here);

        MenuItem latte = new MenuItem();
        latte.setId(10L);
        latte.setRestaurantId(1L);
        // The latte offers one choice: Almond Milk.
        MenuItemOptionGroup g = new MenuItemOptionGroup();
        g.setNameEn("Options");
        g.setNameAr("خيارات");
        MenuItemOption almondChoice = new MenuItemOption();
        almondChoice.setNameEn("Almond Milk");
        almondChoice.setNameAr("حليب لوز");
        g.getOptions().add(almondChoice);
        latte.getOptionGroups().add(g);
        lenient().when(menuItems.findById(10L)).thenReturn(Optional.of(latte));

        MenuItem foreign = new MenuItem();
        foreign.setId(77L);
        foreign.setRestaurantId(9L);
        lenient().when(menuItems.findById(77L)).thenReturn(Optional.of(foreign));

        beansHere = new StockItem();
        beansHere.setId(5L);
        beansHere.setBranchId(2L);
        beansHere.setNameEn("Beans");
        beansHere.setUnit(StockUnit.KG);
        lenient().when(stockItems.findById(5L)).thenReturn(Optional.of(beansHere));

        milkThere = new StockItem();
        milkThere.setId(6L);
        milkThere.setBranchId(3L);   // the other branch's fridge
        milkThere.setNameEn("Milk");
        milkThere.setUnit(StockUnit.L);
        lenient().when(stockItems.findById(6L)).thenReturn(Optional.of(milkThere));

        lenient().when(rules.save(any(MenuItemStock.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(recipes.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(optionRecipes.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void aRuleWithNothingInItIsDeletedNotKept() {
        MenuItemStock existing = new MenuItemStock();
        existing.setMenuItemId(10L);
        existing.setBranchId(2L);
        existing.setDailyLimit(3);
        when(rules.findByMenuItemIdAndBranchId(10L, 2L)).thenReturn(Optional.of(existing));

        RuleResponse r = service.setRule(2L, 10L, new RuleRequest(null));

        verify(rules).delete(existing);
        verify(rules, never()).save(any());
        assertThat(r.dailyLimit()).isNull();
    }

    @Test
    void aRecipeCannotNameATinFromAnotherBranch() {
        assertThatThrownBy(() -> service.setRecipe(2L, 10L, new RecipeRequest(List.of(
                new RecipeLineInput(6L, BigDecimal.ONE, StockUnit.L)), null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("another branch");
    }

    @Test
    void aCapCannotBeSetOnAnotherCafesMenuItem() {
        assertThatThrownBy(() -> service.setRule(2L, 77L, new RuleRequest(3)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void aRecipeMayUseTheTinsThousandthSiblingAndNothingElse() {
        // 18 g against a shelf in kilos: that is the whole point.
        List<RecipeLineResponse> ok = service.setRecipe(2L, 10L, new RecipeRequest(List.of(
                new RecipeLineInput(5L, new BigDecimal("18"), StockUnit.G)), null));
        assertThat(ok).hasSize(1);
        assertThat(ok.get(0).unit()).isEqualTo(StockUnit.G);

        // 18 ml against a shelf in kilos: a mistake, refused before it can mean anything.
        assertThatThrownBy(() -> service.setRecipe(2L, 10L, new RecipeRequest(List.of(
                new RecipeLineInput(5L, new BigDecimal("18"), StockUnit.ML)), null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("counted in KG");
    }

    @Test
    void aRecipeMayPourFromABottleThatSaysWhatItHolds() {
        StockItem bottles = new StockItem();
        bottles.setId(7L);
        bottles.setBranchId(2L);
        bottles.setNameEn("Milk");
        bottles.setUnit(StockUnit.PIECE);
        bottles.setPackSize(BigDecimal.ONE);
        bottles.setPackUnit(StockUnit.L);
        when(stockItems.findById(7L)).thenReturn(Optional.of(bottles));

        // 200 ml against a shelf counted in 1 L bottles: the whole reason contents exist.
        List<RecipeLineResponse> ok = service.setRecipe(2L, 10L, new RecipeRequest(List.of(
                new RecipeLineInput(7L, new BigDecimal("200"), StockUnit.ML)), null));
        assertThat(ok.get(0).unit()).isEqualTo(StockUnit.ML);

        // Grams against a bottle of milk are still nonsense, and the refusal names the bottle.
        assertThatThrownBy(() -> service.setRecipe(2L, 10L, new RecipeRequest(List.of(
                new RecipeLineInput(7L, new BigDecimal("18"), StockUnit.G)), null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("PIECE of 1 L");
    }

    @Test
    void anOptionMayStandInForABaseIngredientIfItCanReadTheSameUnit() {
        StockItem milk = bottles(7L, "Milk");
        StockItem almond = bottles(8L, "Almond milk");
        when(stockItems.findById(7L)).thenReturn(Optional.of(milk));
        when(stockItems.findById(8L)).thenReturn(Optional.of(almond));

        service.setRecipe(2L, 10L, new RecipeRequest(
                List.of(new RecipeLineInput(7L, new BigDecimal("200"), StockUnit.ML)),
                List.of(new OptionLineInput("Options", "Almond Milk", 8L, 7L, null, null))));

        verify(optionRecipes).saveAll(org.mockito.ArgumentMatchers.argThat(l ->
                ((List<?>) l).size() == 1));
    }

    @Test
    void anOptionCannotReplaceSomethingTheRecipeDoesNotUse() {
        StockItem almond = bottles(8L, "Almond milk");
        when(stockItems.findById(8L)).thenReturn(Optional.of(almond));

        assertThatThrownBy(() -> service.setRecipe(2L, 10L, new RecipeRequest(
                List.of(new RecipeLineInput(5L, new BigDecimal("18"), StockUnit.G)),
                List.of(new OptionLineInput("Options", "Almond Milk", 8L, 7L, null, null)))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("does not use");
    }

    @Test
    void anOptionRuleForAChoiceTheItemDoesNotOfferIsRefused() {
        StockItem almond = bottles(8L, "Almond milk");
        lenient().when(stockItems.findById(8L)).thenReturn(Optional.of(almond));

        assertThatThrownBy(() -> service.setRecipe(2L, 10L, new RecipeRequest(
                List.of(),
                List.of(new OptionLineInput("Options", "Oat Milk", 8L, null, BigDecimal.ONE, StockUnit.L)))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("no option");
    }

    @Test
    void aRecipeCannotListTheSameIngredientTwice() {
        assertThatThrownBy(() -> service.setRecipe(2L, 10L, new RecipeRequest(List.of(
                new RecipeLineInput(5L, BigDecimal.ONE, StockUnit.KG),
                new RecipeLineInput(5L, BigDecimal.TEN, StockUnit.G)), null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("twice");
        verify(recipes, never()).deleteByMenuItemIdAndBranchId(any(), any());
    }

    private static StockItem bottles(long id, String name) {
        StockItem s = new StockItem();
        s.setId(id);
        s.setBranchId(2L);
        s.setNameEn(name);
        s.setUnit(StockUnit.PIECE);
        s.setPackSize(BigDecimal.ONE);
        s.setPackUnit(StockUnit.L);
        return s;
    }

    @Test
    void anEmptyRecipeClearsWhatWasThere() {
        service.setRecipe(2L, 10L, new RecipeRequest(List.of(), List.of()));

        verify(recipes).deleteByMenuItemIdAndBranchId(10L, 2L);
        verify(recipes).saveAll(List.<RecipeLine>of());
    }
}
