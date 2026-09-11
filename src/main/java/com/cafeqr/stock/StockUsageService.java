package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.stock.domain.MenuItemDailyTally;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.dto.MenuStockDtos.UsageRow;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Where the beans went, and how long the milk will last.
 *
 * <p>The rate is worked out from what was sold, not from what was counted: every accepted line
 * lands in the daily tally, and a recipe says what each of those took. Sum it over a window,
 * divide by the days, divide the shelf by that — days of cover. What was <em>sold</em> is the
 * honest rate even on a day the count was wrong and the draw clamped.
 *
 * <p>"Used since you last counted" reads the draws instead, because that figure has to match
 * the shelf exactly: it is the explanation for the number on the tile.
 *
 * <p>The window is inclusive of today. A café that opened this morning divides by one day and
 * gets a noisy figure; that is the truth of one day's data, and it settles by the weekend.
 */
@Service
public class StockUsageService {

    private final MenuItemDailyTallyRepository tallies;
    private final RecipeLineRepository recipes;
    private final OrderItemDrawRepository draws;
    private final StockItemRepository stockItems;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public StockUsageService(MenuItemDailyTallyRepository tallies,
                             RecipeLineRepository recipes,
                             OrderItemDrawRepository draws,
                             StockItemRepository stockItems,
                             BranchService branchService,
                             AccessGuard accessGuard) {
        this.tallies = tallies;
        this.draws = draws;
        this.recipes = recipes;
        this.stockItems = stockItems;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    @Transactional(readOnly = true)
    public List<UsageRow> usage(Long branchId, int days) {
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        int window = Math.max(1, Math.min(days, 90));

        LocalDate today = LocalDate.now(TimeZones.CAFES);
        Map<Long, Integer> sold = new HashMap<>();
        for (MenuItemDailyTally t : tallies.findByBranchIdAndCafeDayBetween(branchId, today.minusDays(window - 1L), today)) {
            sold.merge(t.getMenuItemId(), t.getSold(), Integer::sum);
        }

        Map<Long, StockItem> shelf = stockItems.findByBranchIdOrderByIdAsc(branchId).stream()
                .collect(Collectors.toMap(StockItem::getId, Function.identity()));

        // Used per tin, in the tin's own unit. Keyed in shelf order so the answer is stable.
        Map<Long, BigDecimal> used = new LinkedHashMap<>();
        for (RecipeLine line : recipes.findByBranchId(branchId)) {
            StockItem tin = shelf.get(line.getStockItemId());
            if (tin == null) continue;
            BigDecimal factor = tin.factorFrom(line.getUnit());
            if (factor == null) continue;   // refused on the way in; belt and braces
            BigDecimal perSale = line.getQuantity().multiply(factor);
            used.merge(line.getStockItemId(),
                    perSale.multiply(BigDecimal.valueOf(sold.getOrDefault(line.getMenuItemId(), 0))),
                    BigDecimal::add);
        }

        BigDecimal daysBd = BigDecimal.valueOf(window);
        return used.entrySet().stream().map(e -> {
            StockItem tin = shelf.get(e.getKey());
            BigDecimal total = e.getValue().setScale(3, RoundingMode.HALF_UP);
            BigDecimal perDay = total.divide(daysBd, 3, RoundingMode.HALF_UP);
            BigDecimal daysLeft = perDay.signum() > 0
                    ? tin.getQuantity().max(BigDecimal.ZERO).divide(perDay, 1, RoundingMode.DOWN)
                    : null;
            BigDecimal sinceCount = tin.getLastMovedAt() == null ? null
                    : draws.usedSince(tin.getId(), tin.getLastMovedAt()).setScale(3, RoundingMode.HALF_UP);
            return new UsageRow(e.getKey(), total, perDay, daysLeft, sinceCount);
        }).toList();
    }
}
