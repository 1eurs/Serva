package com.cafeqr.stock;

import com.cafeqr.common.util.TimeZones;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.repository.OrderItemRepository;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMovement;
import com.cafeqr.stock.repository.StockMovementRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The reports that make entering stock data worth the trouble.
 *
 * <p>Everything here is derived from the ledger and from sales the café already records, so none
 * of it asks for extra typing:
 *
 * <ul>
 *   <li><b>Days of cover</b> — recent usage projected forward. Answers "what do I run out of
 *       today?", which is the question staff actually have every morning.</li>
 *   <li><b>Waste</b> — split by reason, so staff meals and comps are separable from spoilage.</li>
 *   <li><b>Cost drift</b> — the latest delivery price against the running average. "Beans up 12%,
 *       your latte margin just moved" is a thing owners want to be told, not to go looking for.</li>
 *   <li><b>Menu engineering</b> — the classic popularity-vs-margin quadrant. Only possible once
 *       recipes exist, and the single strongest argument for entering them.</li>
 * </ul>
 */
@Service
public class StockInsightsService {

    /** Usage window for the velocity estimate. Long enough to smooth a quiet Tuesday. */
    private static final int VELOCITY_DAYS = 14;
    private static final int MONEY_SCALE = 3;

    private final StockMovementRepository movementRepository;
    private final MenuItemRepository menuItemRepository;
    private final OrderItemRepository orderItemRepository;
    private final StockService stockService;
    private final RecipeService recipeService;

    public StockInsightsService(StockMovementRepository movementRepository,
                                MenuItemRepository menuItemRepository,
                                OrderItemRepository orderItemRepository,
                                StockService stockService,
                                RecipeService recipeService) {
        this.movementRepository = movementRepository;
        this.menuItemRepository = menuItemRepository;
        this.orderItemRepository = orderItemRepository;
        this.stockService = stockService;
        this.recipeService = recipeService;
    }

    /** Projected runway for one item: how fast it goes and how long what's left will last. */
    public record Cover(StockItem item, BigDecimal onHand, BigDecimal dailyUsage, BigDecimal daysLeft) {}

    /** What was thrown away, and what it cost. */
    public record Waste(StockItem item, BigDecimal quantityBase, BigDecimal value) {}

    /** A delivery that came in meaningfully above the running average. */
    public record CostDrift(StockItem item, BigDecimal averageCost, BigDecimal latestCost,
                            BigDecimal changePercent) {}

    /** One dish on the popularity-vs-margin map. */
    public record MenuEconomics(Long menuItemId, String nameEn, String nameAr, long quantitySold,
                                BigDecimal revenue, BigDecimal unitCost, BigDecimal unitMargin,
                                BigDecimal foodCostPercent, String quadrant) {}

    // ============================================================ days of cover

    /**
     * Average daily usage over the last two weeks, projected against what is on hand.
     *
     * <p>Only SALE and PREP_CONSUME count as usage — waste and transfers are not demand, and
     * counting them would make a single spillage look like a spike in sales.
     */
    @Transactional(readOnly = true)
    public List<Cover> daysOfCover(Long branchId) {
        Instant since = Instant.now().minus(VELOCITY_DAYS, ChronoUnit.DAYS);
        Map<Long, BigDecimal> usage = new LinkedHashMap<>();
        for (Object[] row : movementRepository.usageSince(branchId, since)) {
            usage.put((Long) row[0], toDecimal(row[1]));
        }
        Map<Long, StockLevel> levels = stockService.levelsByItem(branchId);

        List<Cover> out = new ArrayList<>();
        for (StockItem item : stockService.listItems(false)) {
            StockLevel level = levels.get(item.getId());
            BigDecimal onHand = level == null ? BigDecimal.ZERO : level.getQuantityBase();
            BigDecimal used = usage.getOrDefault(item.getId(), BigDecimal.ZERO);
            if (used.signum() <= 0) {
                continue; // nothing moved — a runway estimate would be meaningless
            }
            BigDecimal perDay = used.divide(BigDecimal.valueOf(VELOCITY_DAYS), 3, RoundingMode.HALF_UP);
            BigDecimal daysLeft = perDay.signum() <= 0
                    ? null
                    : onHand.divide(perDay, 1, RoundingMode.HALF_UP);
            out.add(new Cover(item, onHand, perDay, daysLeft));
        }
        out.sort(Comparator.comparing(c -> c.daysLeft() == null ? BigDecimal.valueOf(9999) : c.daysLeft()));
        return out;
    }

    /** The subset that runs out within a day — the "order this now" shortlist. */
    @Transactional(readOnly = true)
    public List<Cover> endingSoon(Long branchId, BigDecimal withinDays) {
        return daysOfCover(branchId).stream()
                .filter(c -> c.daysLeft() != null && c.daysLeft().compareTo(withinDays) <= 0)
                .toList();
    }

    // ============================================================ waste

    @Transactional(readOnly = true)
    public List<Waste> waste(Long branchId, int days) {
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);
        Map<Long, StockItem> items = itemsById();
        List<Waste> out = new ArrayList<>();
        for (Object[] row : movementRepository.wasteSince(branchId, since)) {
            StockItem item = items.get((Long) row[0]);
            if (item != null) {
                out.add(new Waste(item, toDecimal(row[1]), toDecimal(row[2]).setScale(MONEY_SCALE, RoundingMode.HALF_UP)));
            }
        }
        out.sort(Comparator.comparing(Waste::value).reversed());
        return out;
    }

    // ============================================================ cost drift

    /**
     * Items whose most recent delivery price sits more than {@code thresholdPercent} above the
     * running average — the early warning that a margin has quietly moved.
     */
    @Transactional(readOnly = true)
    public List<CostDrift> costDrift(BigDecimal thresholdPercent) {
        List<CostDrift> out = new ArrayList<>();
        for (StockItem item : stockService.listItems(false)) {
            if (item.getCostPerBaseUnit().signum() <= 0) {
                continue;
            }
            List<StockMovement> recent = movementRepository.recentReceipts(item.getId(), PageRequest.of(0, 1));
            if (recent.isEmpty()) {
                continue;
            }
            BigDecimal latest = recent.get(0).getUnitCost();
            BigDecimal average = item.getCostPerBaseUnit();
            BigDecimal change = latest.subtract(average)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(average, 1, RoundingMode.HALF_UP);
            if (change.compareTo(thresholdPercent) >= 0) {
                out.add(new CostDrift(item, average, latest, change));
            }
        }
        out.sort(Comparator.comparing(CostDrift::changePercent).reversed());
        return out;
    }

    // ============================================================ menu engineering

    /**
     * Popularity against margin for every dish sold in the window, bucketed the way the trade
     * does it:
     *
     * <ul>
     *   <li><b>Star</b> — sells well and makes money. Protect it.</li>
     *   <li><b>Plowhorse</b> — sells well, thin margin. Re-cost it or re-price it.</li>
     *   <li><b>Puzzle</b> — good margin, few takers. Move it up the menu.</li>
     *   <li><b>Dog</b> — neither. Consider cutting it.</li>
     * </ul>
     *
     * <p>Items without a recipe are still listed (with a null cost) rather than dropped, so the
     * gaps in the data are visible instead of silently skewing the averages.
     */
    @Transactional(readOnly = true)
    public List<MenuEconomics> menuEconomics(Long restaurantId, Long branchId, int days) {
        Instant to = Instant.now();
        Instant from = to.minus(days, ChronoUnit.DAYS);
        List<Object[]> rows = orderItemRepository.bestSelling(restaurantId, branchId, from, to);
        if (rows.isEmpty()) {
            return List.of();
        }

        Map<Long, MenuItem> menuItems = new LinkedHashMap<>();
        for (MenuItem item : menuItemRepository.findByRestaurantIdOrderByDisplayOrderAscIdAsc(restaurantId)) {
            menuItems.put(item.getId(), item);
        }

        record Row(Long id, String nameEn, String nameAr, long qty, BigDecimal revenue,
                   BigDecimal cost, BigDecimal margin) {}
        List<Row> scored = new ArrayList<>();
        Instant now = Instant.now();
        for (Object[] row : rows) {
            Long menuItemId = (Long) row[0];
            if (menuItemId == null) {
                continue; // item deleted since; nothing to cost
            }
            MenuItem item = menuItems.get(menuItemId);
            long qty = ((Number) row[3]).longValue();
            BigDecimal revenue = toDecimal(row[4]);
            BigDecimal cost = null;
            BigDecimal margin = null;
            if (item != null) {
                BigDecimal plate = recipeService.plateCost(item);
                if (plate.signum() > 0) {
                    cost = plate.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
                    margin = item.effectivePrice(now).subtract(cost);
                }
            }
            scored.add(new Row(menuItemId, (String) row[1], (String) row[2], qty, revenue, cost, margin));
        }

        double avgQty = scored.stream().mapToLong(Row::qty).average().orElse(0);
        List<BigDecimal> margins = scored.stream().map(Row::margin).filter(java.util.Objects::nonNull).toList();
        BigDecimal avgMargin = margins.isEmpty()
                ? null
                : margins.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                        .divide(BigDecimal.valueOf(margins.size()), MONEY_SCALE, RoundingMode.HALF_UP);

        List<MenuEconomics> out = new ArrayList<>(scored.size());
        for (Row row : scored) {
            String quadrant = null;
            if (row.margin() != null && avgMargin != null) {
                boolean popular = row.qty() >= avgQty;
                boolean profitable = row.margin().compareTo(avgMargin) >= 0;
                quadrant = popular
                        ? (profitable ? "STAR" : "PLOWHORSE")
                        : (profitable ? "PUZZLE" : "DOG");
            }
            MenuItem item = menuItems.get(row.id());
            BigDecimal price = item == null ? null : item.effectivePrice(now);
            out.add(new MenuEconomics(row.id(), row.nameEn(), row.nameAr(), row.qty(),
                    row.revenue(), row.cost(), row.margin(),
                    recipeService.foodCostPercent(row.cost(), price), quadrant));
        }
        return out;
    }

    // ============================================================ helpers

    private Map<Long, StockItem> itemsById() {
        Map<Long, StockItem> map = new LinkedHashMap<>();
        for (StockItem item : stockService.listItems(true)) {
            map.put(item.getId(), item);
        }
        return map;
    }

    private static BigDecimal toDecimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value instanceof BigDecimal decimal ? decimal : new BigDecimal(value.toString());
    }

    /** Today in café time — shared by the daily-limit views. */
    public LocalDate today() {
        return LocalDate.now(TimeZones.CAFES);
    }
}
