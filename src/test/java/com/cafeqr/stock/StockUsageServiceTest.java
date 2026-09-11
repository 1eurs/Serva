package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.stock.domain.MenuItemDailyTally;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.dto.MenuStockDtos.UsageRow;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/** Usage is what was sold times what a sale takes — in the tin's own unit, over the window. */
@ExtendWith(MockitoExtension.class)
class StockUsageServiceTest {

    @Mock private MenuItemDailyTallyRepository tallies;
    @Mock private MenuItemStockRepository rules;
    @Mock private RecipeLineRepository recipes;
    @Mock private StockItemRepository stockItems;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;

    private StockUsageService service;
    private StockItem beans;      // 2 kg on the shelf
    private StockItem croissants; // 6 in the box

    @BeforeEach
    void setUp() {
        service = new StockUsageService(tallies, rules, recipes, stockItems, branchService, accessGuard);
        Branch branch = new Branch();
        branch.setId(2L);
        branch.setRestaurantId(1L);
        lenient().when(branchService.getEntity(2L)).thenReturn(branch);

        beans = tin(5L, StockUnit.KG, "2.000");
        croissants = tin(6L, StockUnit.PIECE, "6");
        lenient().when(stockItems.findByBranchIdOrderByIdAsc(2L)).thenReturn(List.of(beans, croissants));
        lenient().when(rules.findByBranchId(2L)).thenReturn(List.of());
        lenient().when(recipes.findByBranchId(2L)).thenReturn(List.of());
        lenient().when(tallies.findByBranchIdAndCafeDayBetween(eq(2L), any(), any())).thenReturn(List.of());
    }

    @Test
    void aCountableLinkIsAOnePieceRecipe() throws Exception {
        MenuItemStock rule = new MenuItemStock();
        rule.setMenuItemId(10L);
        rule.setStockItemId(6L);
        when(rules.findByBranchId(2L)).thenReturn(List.of(rule));
        // 14 croissants over the week
        when(tallies.findByBranchIdAndCafeDayBetween(eq(2L), any(), any()))
                .thenReturn(List.of(sold(10L, 9), sold(10L, 5)));

        List<UsageRow> rows = service.usage(2L, 7);

        UsageRow r = rows.get(0);
        assertThat(r.stockItemId()).isEqualTo(6L);
        assertThat(r.used()).isEqualByComparingTo("14");
        assertThat(r.perDay()).isEqualByComparingTo("2");
        assertThat(r.daysLeft()).isEqualByComparingTo("3.0");
    }

    @Test
    void aRecipeInGramsIsSummedAgainstAShelfInKilos() throws Exception {
        RecipeLine line = new RecipeLine();
        line.setMenuItemId(11L);
        line.setStockItemId(5L);
        line.setQuantity(new BigDecimal("18"));
        line.setUnit(StockUnit.G);
        when(recipes.findByBranchId(2L)).thenReturn(List.of(line));
        // 350 lattes over the week: 6.3 kg
        when(tallies.findByBranchIdAndCafeDayBetween(eq(2L), any(), any()))
                .thenReturn(List.of(sold(11L, 350)));

        List<UsageRow> rows = service.usage(2L, 7);

        UsageRow r = rows.get(0);
        assertThat(r.used()).isEqualByComparingTo("6.300");
        assertThat(r.perDay()).isEqualByComparingTo("0.900");
        assertThat(r.daysLeft()).isEqualByComparingTo("2.2");   // 2 kg ÷ 0.9, floored to a tenth
    }

    @Test
    void nothingSoldMeansNoRateAndNoVerdict() {
        RecipeLine line = new RecipeLine();
        line.setMenuItemId(11L);
        line.setStockItemId(5L);
        line.setQuantity(new BigDecimal("18"));
        line.setUnit(StockUnit.G);
        when(recipes.findByBranchId(2L)).thenReturn(List.of(line));

        List<UsageRow> rows = service.usage(2L, 7);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).used()).isEqualByComparingTo("0");
        assertThat(rows.get(0).daysLeft()).isNull();
    }

    private static StockItem tin(long id, StockUnit unit, String qty) {
        StockItem s = new StockItem();
        s.setId(id);
        s.setBranchId(2L);
        s.setUnit(unit);
        s.setQuantity(new BigDecimal(qty));
        return s;
    }

    private static MenuItemDailyTally sold(long menuItemId, int n) throws ReflectiveOperationException {
        MenuItemDailyTally t = new MenuItemDailyTally();
        set(t, "menuItemId", menuItemId);
        set(t, "branchId", 2L);
        set(t, "cafeDay", LocalDate.now());
        set(t, "sold", n);
        return t;
    }

    private static void set(Object target, String field, Object value) throws ReflectiveOperationException {
        Field f = target.getClass().getDeclaredField(field);
        f.setAccessible(true);
        f.set(target, value);
    }
}
