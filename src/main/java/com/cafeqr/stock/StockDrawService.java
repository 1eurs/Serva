package com.cafeqr.stock;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.domain.MenuItemDailyTally;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.OrderItemDraw;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Where a sale meets the shelf.
 *
 * <p>A menu item's recipe says what it takes from the shelf: a croissant takes one croissant, a
 * latte takes 200 ml of milk and 18 g of beans. An accepted order draws every line of every
 * recipe ({@link #draw}); a cancelled one puts it back ({@link #restore}); a customer order the
 * shelf cannot cover is refused ({@link #requireAvailable}); and the menu asks which items are
 * out and how many are left today ({@link #availability}).
 *
 * <p>Two promises hold throughout. <b>Nothing is hidden unless the owner said so:</b> an item
 * with no recipe is never touched, a recipe only hides its item when the restaurant's switch is
 * on, and a daily cap — which the owner typed on purpose — always applies. <b>Nothing moves
 * twice:</b> the order carries one mark saying a draw is outstanding, so a double accept or a
 * double cancel is a no-op, and what each line took from each tin is written down so a restore
 * reverses exactly that — never the current recipe, which may have changed since.
 *
 * <p>The daily tally is counted for every accepted line, capped or not. A cap set at two in the
 * afternoon then honestly includes the morning, and "sold today" is what usage is read from.
 *
 * <p>Every method joins the caller's transaction. The order service owns the transaction and the
 * order; this class only ever touches shelf rows, draws and tallies inside it.
 */
@Service
public class StockDrawService {

    private final MenuItemStockRepository caps;
    private final RecipeLineRepository recipes;
    private final StockItemRepository stockItems;
    private final OrderItemDrawRepository draws;
    private final MenuItemDailyTallyRepository tallies;

    public StockDrawService(MenuItemStockRepository caps,
                            RecipeLineRepository recipes,
                            StockItemRepository stockItems,
                            OrderItemDrawRepository draws,
                            MenuItemDailyTallyRepository tallies) {
        this.caps = caps;
        this.recipes = recipes;
        this.stockItems = stockItems;
        this.draws = draws;
        this.tallies = tallies;
    }

    /** What the menu says about one item. Absent from the map means: nothing to say. */
    public record ItemAvailability(boolean soldOut, Integer remainingToday) {}

    /**
     * Which of these menu items are sold out at this branch right now, and how many are left of
     * the ones with a daily cap. Computed when asked, never stored — see V47 for why.
     *
     * <p>A recipe item is out when any one ingredient cannot cover a single sale. Not "when the
     * milk is at zero": a bottle with 100 ml left cannot make a 200 ml latte either.
     */
    @Transactional(readOnly = true)
    public Map<Long, ItemAvailability> availability(Restaurant restaurant, Long branchId,
                                                    Collection<Long> menuItemIds) {
        Snapshot s = snapshot(restaurant, branchId, menuItemIds);
        Map<Long, ItemAvailability> out = new HashMap<>();
        for (Long id : menuItemIds) {
            Integer remaining = s.remainingToday(id);
            boolean short0 = s.hide && s.cannotCover(id, 1);
            if (remaining == null && !s.recipes.containsKey(id)) continue;   // nothing to say
            out.put(id, new ItemAvailability((remaining != null && remaining == 0) || short0, remaining));
        }
        return out;
    }

    /**
     * Refuse a customer order the shelf cannot cover.
     *
     * <p>Aggregated per tin first, because a cart can hold the same item twice with different
     * options, and two drinks can pour from the same bottle — three lattes and two cappuccinos is
     * one carton being asked for 900 ml. The check is read-only; between it and the draw another
     * order may slip in, and the draw clamps. That window is accepted: the alternative is holding
     * row locks across the whole of order creation.
     *
     * <p>Staff orders never come through here. The person at the counter can see the shelf.
     */
    @Transactional(readOnly = true)
    public void requireAvailable(Restaurant restaurant, Long branchId, List<OrderItem> lines) {
        Map<Long, Integer> wanted = new LinkedHashMap<>();
        Map<Long, String> names = new HashMap<>();
        for (OrderItem line : lines) {
            if (line.getMenuItemId() == null) continue;
            wanted.merge(line.getMenuItemId(), line.getQuantity(), Integer::sum);
            names.putIfAbsent(line.getMenuItemId(), line.getNameEnSnapshot());
        }
        if (wanted.isEmpty()) return;
        Snapshot s = snapshot(restaurant, branchId, wanted.keySet());

        for (Map.Entry<Long, Integer> w : wanted.entrySet()) {
            Integer remaining = s.remainingToday(w.getKey());
            if (remaining != null && w.getValue() > remaining) {
                throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE, remaining == 0
                        ? "\"" + names.get(w.getKey()) + "\" is sold out for today"
                        : "Only " + remaining + " of \"" + names.get(w.getKey()) + "\" left today");
            }
        }
        if (!s.hide) return;

        // Everything the whole cart would pour from each tin, against what the tin holds.
        Map<Long, BigDecimal> need = new LinkedHashMap<>();
        Map<Long, String> firstAsker = new HashMap<>();
        for (Map.Entry<Long, Integer> w : wanted.entrySet()) {
            for (RecipeLine r : s.recipes.getOrDefault(w.getKey(), List.of())) {
                BigDecimal perSale = s.perSale(r);
                if (perSale == null) continue;
                need.merge(r.getStockItemId(), perSale.multiply(BigDecimal.valueOf(w.getValue())), BigDecimal::add);
                firstAsker.putIfAbsent(r.getStockItemId(), names.get(w.getKey()));
            }
        }
        for (Map.Entry<Long, BigDecimal> n : need.entrySet()) {
            StockItem tin = s.tins.get(n.getKey());
            if (tin == null) continue;   // vanished tin: nothing to say, never "sold out"
            if (n.getValue().compareTo(tin.getQuantity().max(BigDecimal.ZERO)) > 0) {
                throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE,
                        tin.getQuantity().signum() <= 0
                                ? "\"" + firstAsker.get(n.getKey()) + "\" is sold out"
                                : "Not enough " + tinName(tin) + " for \"" + firstAsker.get(n.getKey()) + "\"");
            }
        }
    }

    /**
     * Take what an accepted order needs. Idempotent: the order's mark says whether a draw is
     * already outstanding, and a second call does nothing.
     *
     * <p>Each tin is locked while it is decremented, because two orders for the last croissant
     * can be accepted in the same second. The count is clamped at zero and the draw records what
     * it actually got, which is the figure a restore will put back. The switch is not consulted:
     * drawing is bookkeeping and runs whether or not anything is hidden.
     */
    @Transactional
    public void draw(Order order) {
        if (order.getStockDrawnAt() != null) return;
        Instant now = Instant.now();
        LocalDate day = LocalDate.ofInstant(now, TimeZones.CAFES);
        Map<Long, List<RecipeLine>> byItem = recipesFor(order.getBranchId(), order.getItems());
        List<OrderItemDraw> made = new ArrayList<>();

        for (OrderItem line : order.getItems()) {
            if (line.getMenuItemId() == null) continue;
            tallies.add(line.getMenuItemId(), order.getBranchId(), day, line.getQuantity());

            for (RecipeLine r : byItem.getOrDefault(line.getMenuItemId(), List.of())) {
                StockItem tin = stockItems.findByIdForUpdate(r.getStockItemId()).orElse(null);
                if (tin == null) continue;   // the tin was thrown away since the recipe was written
                BigDecimal factor = tin.factorFrom(r.getUnit());
                if (factor == null) continue;   // refused on the way in; belt and braces
                BigDecimal want = r.getQuantity().multiply(factor).multiply(BigDecimal.valueOf(line.getQuantity()));
                BigDecimal take = want.min(tin.getQuantity().max(BigDecimal.ZERO));
                tin.setQuantity(tin.getQuantity().subtract(take));
                OrderItemDraw d = new OrderItemDraw();
                d.setOrderItemId(line.getId());
                d.setStockItemId(tin.getId());
                d.setQuantity(take);
                made.add(d);
            }
        }
        if (!made.isEmpty()) draws.saveAll(made);
        order.setStockDrawnAt(now);
    }

    /**
     * Put back what a cancelled order took. Idempotent, and blind to the current recipes: it
     * reads what each line recorded per tin, so a recipe changed since the draw cannot misdirect
     * it, and a tin thrown away since simply has nothing to receive.
     *
     * <p>The tally comes off the day the draw was made — an order accepted last night and
     * cancelled this morning was last night's sale.
     */
    @Transactional
    public void restore(Order order) {
        Instant drawnAt = order.getStockDrawnAt();
        if (drawnAt == null) return;
        LocalDate day = LocalDate.ofInstant(drawnAt, TimeZones.CAFES);

        Set<Long> lineIds = order.getItems().stream().map(OrderItem::getId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        for (OrderItem line : order.getItems()) {
            if (line.getMenuItemId() != null) {
                tallies.subtract(line.getMenuItemId(), order.getBranchId(), day, line.getQuantity());
            }
        }
        if (!lineIds.isEmpty()) {
            for (OrderItemDraw d : draws.findByOrderItemIdIn(lineIds)) {
                if (d.getStockItemId() == null || d.getQuantity().signum() <= 0) continue;
                stockItems.findByIdForUpdate(d.getStockItemId())
                        .ifPresent(tin -> tin.setQuantity(tin.getQuantity().add(d.getQuantity())));
            }
            draws.deleteByOrderItemIdIn(lineIds);
        }
        order.setStockDrawnAt(null);
    }

    // ---- internals ----

    private Map<Long, List<RecipeLine>> recipesFor(Long branchId, List<OrderItem> lines) {
        Set<Long> ids = lines.stream().map(OrderItem::getMenuItemId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return recipes.findByBranchIdAndMenuItemIdIn(branchId, ids).stream()
                .collect(Collectors.groupingBy(RecipeLine::getMenuItemId));
    }

    /** One read of everything a verdict needs: the caps, the recipes, the tins, today's tallies. */
    private Snapshot snapshot(Restaurant restaurant, Long branchId, Collection<Long> menuItemIds) {
        if (menuItemIds.isEmpty()) return new Snapshot(false, Map.of(), Map.of(), Map.of(), Map.of());
        Map<Long, MenuItemStock> capByItem = caps.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds).stream()
                .filter(c -> c.getDailyLimit() != null)
                .collect(Collectors.toMap(MenuItemStock::getMenuItemId, Function.identity()));
        Map<Long, List<RecipeLine>> recipeByItem = recipes.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds).stream()
                .collect(Collectors.groupingBy(RecipeLine::getMenuItemId));

        Set<Long> tinIds = recipeByItem.values().stream().flatMap(List::stream)
                .map(RecipeLine::getStockItemId).collect(Collectors.toSet());
        Map<Long, StockItem> tins = tinIds.isEmpty() ? Map.of()
                : stockItems.findByIdIn(tinIds).stream()
                        .collect(Collectors.toMap(StockItem::getId, Function.identity()));

        Map<Long, Integer> sold = capByItem.isEmpty() ? Map.of()
                : tallies.findByBranchIdAndCafeDayAndMenuItemIdIn(
                        branchId, LocalDate.now(TimeZones.CAFES), capByItem.keySet()).stream()
                        .collect(Collectors.toMap(MenuItemDailyTally::getMenuItemId, MenuItemDailyTally::getSold));

        return new Snapshot(restaurant.isHideWhenOutOfStock(), capByItem, recipeByItem, tins, sold);
    }

    private static String tinName(StockItem tin) {
        return tin.getNameEn() != null ? tin.getNameEn() : tin.getNameAr();
    }

    private record Snapshot(boolean hide, Map<Long, MenuItemStock> caps,
                            Map<Long, List<RecipeLine>> recipes,
                            Map<Long, StockItem> tins, Map<Long, Integer> soldToday) {
        Integer remainingToday(Long menuItemId) {
            MenuItemStock cap = caps.get(menuItemId);
            if (cap == null) return null;
            return Math.max(0, cap.getDailyLimit() - soldToday.getOrDefault(menuItemId, 0));
        }

        /** One sale's worth of a recipe line, in the tin's own unit; null when the tin is gone. */
        BigDecimal perSale(RecipeLine r) {
            StockItem tin = tins.get(r.getStockItemId());
            if (tin == null) return null;
            BigDecimal f = tin.factorFrom(r.getUnit());
            return f == null ? null : r.getQuantity().multiply(f);
        }

        /**
         * Would {@code n} sales of this item run some ingredient dry? A tin that has vanished is
         * left out — the FK nulls nothing here, it deletes the line, so a miss can only be a
         * race, and a race must read as "nothing to say", never as "sold out".
         */
        boolean cannotCover(Long menuItemId, int n) {
            for (RecipeLine r : recipes.getOrDefault(menuItemId, List.of())) {
                BigDecimal per = perSale(r);
                if (per == null) continue;
                BigDecimal have = tins.get(r.getStockItemId()).getQuantity().max(BigDecimal.ZERO);
                if (per.multiply(BigDecimal.valueOf(n)).compareTo(have) > 0) return true;
            }
            return false;
        }
    }
}
