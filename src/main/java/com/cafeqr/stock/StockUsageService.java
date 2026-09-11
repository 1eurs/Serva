package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.dto.MenuStockDtos.UsageRow;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Where the beans went, and how long the milk will last.
 *
 * <p>Both figures come from the draws, because only the draw knows what a line actually took —
 * an almond latte took almond milk. The rate reads what the recipe <em>asked</em> for, so a tin
 * that had run out still counts as used; "since you last counted" reads what was <em>taken</em>,
 * because that figure has to match the shelf exactly — it is the explanation for the number on
 * the tile.
 *
 * <p>The window is inclusive of today. A café that opened this morning divides by one day and
 * gets a noisy figure; that is the truth of one day's data, and it settles by the weekend.
 */
@Service
public class StockUsageService {

    private final OrderItemDrawRepository draws;
    private final StockItemRepository stockItems;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public StockUsageService(OrderItemDrawRepository draws,
                             StockItemRepository stockItems,
                             BranchService branchService,
                             AccessGuard accessGuard) {
        this.draws = draws;
        this.stockItems = stockItems;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    @Transactional(readOnly = true)
    public List<UsageRow> usage(Long branchId, int days) {
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        int window = Math.max(1, Math.min(days, 90));

        // The window starts at the café's own midnight, window-1 days back.
        Instant since = LocalDate.now(TimeZones.CAFES).minusDays(window - 1L)
                .atStartOfDay(TimeZones.CAFES).toInstant();

        Map<Long, StockItem> shelf = new LinkedHashMap<>();
        for (StockItem s : stockItems.findByBranchIdOrderByIdAsc(branchId)) shelf.put(s.getId(), s);

        // Asked of each tin, in the tin's own unit. Keyed in shelf order so the answer is stable.
        Map<Long, BigDecimal> used = new LinkedHashMap<>();
        for (StockItem s : shelf.values()) used.put(s.getId(), BigDecimal.ZERO);
        for (Object[] row : draws.wantedByTinSince(branchId, since)) {
            Long tin = (Long) row[0];
            if (shelf.containsKey(tin)) used.merge(tin, (BigDecimal) row[1], BigDecimal::add);
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
