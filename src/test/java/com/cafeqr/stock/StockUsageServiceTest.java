package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.dto.MenuStockDtos.UsageRow;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Usage is what sales asked of each tin, over the window — read from the draws, because only the
 * draw knows an almond latte took almond milk.
 */
@ExtendWith(MockitoExtension.class)
class StockUsageServiceTest {

    @Mock private OrderItemDrawRepository draws;
    @Mock private StockItemRepository stockItems;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;

    private StockUsageService service;
    private StockItem beans;      // 2 kg on the shelf
    private StockItem croissants; // 6 in the box

    @BeforeEach
    void setUp() {
        service = new StockUsageService(draws, stockItems, branchService, accessGuard);
        Branch branch = new Branch();
        branch.setId(2L);
        branch.setRestaurantId(1L);
        lenient().when(branchService.getEntity(2L)).thenReturn(branch);

        beans = tin(5L, StockUnit.KG, "2.000");
        croissants = tin(6L, StockUnit.PIECE, "6");
        lenient().when(stockItems.findByBranchIdOrderByIdAsc(2L)).thenReturn(List.of(beans, croissants));
        lenient().when(draws.wantedByTinSince(eq(2L), any())).thenReturn(List.of());
        lenient().when(draws.usedSince(any(), any())).thenReturn(BigDecimal.ZERO);
    }

    @Test
    void theRateIsWhatSalesAskedOverTheWindow() {
        // 14 croissants and 6.3 kg of beans asked for over the week
        when(draws.wantedByTinSince(eq(2L), any())).thenReturn(List.of(
                new Object[]{6L, new BigDecimal("14")}, new Object[]{5L, new BigDecimal("6.300")}));

        List<UsageRow> rows = service.usage(2L, 7);

        UsageRow b = rows.stream().filter(r -> r.stockItemId() == 5L).findFirst().orElseThrow();
        assertThat(b.used()).isEqualByComparingTo("6.300");
        assertThat(b.perDay()).isEqualByComparingTo("0.900");
        assertThat(b.daysLeft()).isEqualByComparingTo("2.2");   // 2 kg ÷ 0.9, floored to a tenth
        UsageRow c = rows.stream().filter(r -> r.stockItemId() == 6L).findFirst().orElseThrow();
        assertThat(c.perDay()).isEqualByComparingTo("2");
        assertThat(c.daysLeft()).isEqualByComparingTo("3.0");
    }

    @Test
    void nothingAskedMeansNoRateAndNoVerdict() {
        List<UsageRow> rows = service.usage(2L, 7);

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).used()).isEqualByComparingTo("0");
        assertThat(rows.get(0).daysLeft()).isNull();
    }

    @Test
    void usedSinceTheLastCountComesFromWhatWasTakenAndOnlyWhenSomebodyCounted() {
        beans.setLastMovedAt(Instant.now().minusSeconds(3600));
        when(draws.usedSince(eq(5L), any())).thenReturn(new BigDecimal("0.414"));

        UsageRow b = service.usage(2L, 7).stream().filter(r -> r.stockItemId() == 5L).findFirst().orElseThrow();
        assertThat(b.usedSinceCount()).isEqualByComparingTo("0.414");

        // A tin nobody has ever counted has no "since" to speak of.
        beans.setLastMovedAt(null);
        UsageRow again = service.usage(2L, 7).stream().filter(r -> r.stockItemId() == 5L).findFirst().orElseThrow();
        assertThat(again.usedSinceCount()).isNull();
    }

    private static StockItem tin(long id, StockUnit unit, String qty) {
        StockItem s = new StockItem();
        s.setId(id);
        s.setBranchId(2L);
        s.setUnit(unit);
        s.setQuantity(new BigDecimal(qty));
        return s;
    }
}
