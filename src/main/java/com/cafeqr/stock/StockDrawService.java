package com.cafeqr.stock;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.domain.MenuItemDailyTally;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.OptionRecipeLine;
import com.cafeqr.stock.domain.OrderItemDraw;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.OptionRecipeLineRepository;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
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
 * latte takes 200 ml of milk and 18 g of beans. A customer's choice can change that — "Almond
 * Milk" sends the 200 ml to the almond carton instead; "Extra shot" adds 18 g of beans — and
 * every draw is worked out for the line as it was actually ordered. An accepted order draws
 * every line ({@link #draw}); a cancelled one puts it back ({@link #restore}); a customer order
 * the shelf cannot cover is refused ({@link #requireAvailable}); and the menu asks which items
 * are out and how many are left today ({@link #availability}).
 *
 * <p>Two promises hold throughout. <b>Nothing is hidden unless the owner said so:</b> an item
 * with no recipe is never touched, a recipe only hides its item when the restaurant's switch is
 * on, and a daily cap — which the owner typed on purpose — always applies. <b>Nothing moves
 * twice:</b> the order carries one mark saying a draw is outstanding, so a double accept or a
 * double cancel is a no-op, and what each line took from each tin is written down so a restore
 * reverses exactly that — never the current recipe, which may have changed since.
 *
 * <p>The daily tally is counted for every accepted line, capped or not. A cap set at two in the
 * afternoon then honestly includes the morning.
 *
 * <p>Every method joins the caller's transaction. The order service owns the transaction and the
 * order; this class only ever touches shelf rows, draws and tallies inside it.
 */
@Service
public class StockDrawService {

    private final MenuItemStockRepository caps;
    private final RecipeLineRepository recipes;
    private final OptionRecipeLineRepository optionRecipes;
    private final StockItemRepository stockItems;
    private final OrderItemDrawRepository draws;
    private final MenuItemDailyTallyRepository tallies;
    private final ObjectMapper objectMapper;

    public StockDrawService(MenuItemStockRepository caps,
                            RecipeLineRepository recipes,
                            OptionRecipeLineRepository optionRecipes,
                            StockItemRepository stockItems,
                            OrderItemDrawRepository draws,
                            MenuItemDailyTallyRepository tallies,
                            ObjectMapper objectMapper) {
        this.caps = caps;
        this.recipes = recipes;
        this.optionRecipes = optionRecipes;
        this.stockItems = stockItems;
        this.draws = draws;
        this.tallies = tallies;
        this.objectMapper = objectMapper;
    }

    /** What the menu says about one item. Absent from the map means: nothing to say. */
    public record ItemAvailability(boolean soldOut, Integer remainingToday) {}

    /** One thing a line takes from one tin, after the customer's choices have been applied. */
    public record Need(Long stockItemId, BigDecimal quantity, StockUnit unit) {}

    /**
     * Which of these menu items are sold out at this branch right now, and how many are left of
     * the ones with a daily cap. Computed when asked, never stored — see V47 for why.
     *
     * <p>Judged on the base recipe: the menu does not yet know what the customer will choose. An
     * item is out when any one ingredient cannot cover a single sale — a bottle with 100 ml left
     * cannot make a 200 ml latte either.
     */
    @Transactional(readOnly = true)
    public Map<Long, ItemAvailability> availability(Restaurant restaurant, Long branchId,
                                                    Collection<Long> menuItemIds) {
        Snapshot s = snapshot(restaurant, branchId, menuItemIds);
        Map<Long, ItemAvailability> out = new HashMap<>();
        for (Long id : menuItemIds) {
            Integer remaining = s.remainingToday(id);
            boolean short0 = s.hide && s.cannotCover(needs(s, id, List.of()), 1);
            if (remaining == null && !s.recipes.containsKey(id)) continue;   // nothing to say
            out.put(id, new ItemAvailability((remaining != null && remaining == 0) || short0, remaining));
        }
        return out;
    }

    /**
     * Refuse a customer order the shelf cannot cover, judged on each line as it was actually
     * ordered — an almond latte is checked against the almond carton.
     *
     * <p>Aggregated per tin across the cart, because two drinks can pour from the same bottle.
     * The check is read-only; between it and the draw another order may slip in, and the draw
     * clamps. That window is accepted: the alternative is holding row locks across the whole of
     * order creation. Staff orders never come through here — the person at the counter can see
     * the shelf.
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

        Map<Long, BigDecimal> need = new LinkedHashMap<>();
        Map<Long, String> firstAsker = new HashMap<>();
        for (OrderItem line : lines) {
            if (line.getMenuItemId() == null) continue;
            for (Need n : needs(s, line.getMenuItemId(), chosen(line))) {
                BigDecimal per = s.inTinUnits(n);
                if (per == null) continue;
                need.merge(n.stockItemId(), per.multiply(BigDecimal.valueOf(line.getQuantity())), BigDecimal::add);
                firstAsker.putIfAbsent(n.stockItemId(), line.getNameEnSnapshot());
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
     * can be accepted in the same second. The count is clamped at zero; the draw records both
     * what was asked and what was got, and the second is what a restore puts back. The switch is
     * not consulted: drawing is bookkeeping and runs whether or not anything is hidden.
     */
    @Transactional
    public void draw(Order order) {
        if (order.getStockDrawnAt() != null) return;
        Instant now = Instant.now();
        LocalDate day = LocalDate.ofInstant(now, TimeZones.CAFES);
        Set<Long> ids = order.getItems().stream().map(OrderItem::getMenuItemId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, List<RecipeLine>> base = ids.isEmpty() ? Map.of()
                : recipes.findByBranchIdAndMenuItemIdIn(order.getBranchId(), ids).stream()
                        .collect(Collectors.groupingBy(RecipeLine::getMenuItemId));
        Map<Long, List<OptionRecipeLine>> options = ids.isEmpty() ? Map.of()
                : optionRecipes.findByBranchIdAndMenuItemIdIn(order.getBranchId(), ids).stream()
                        .collect(Collectors.groupingBy(OptionRecipeLine::getMenuItemId));
        List<OrderItemDraw> made = new ArrayList<>();

        for (OrderItem line : order.getItems()) {
            if (line.getMenuItemId() == null) continue;
            tallies.add(line.getMenuItemId(), order.getBranchId(), day, line.getQuantity());

            List<Need> needs = apply(base.getOrDefault(line.getMenuItemId(), List.of()),
                    options.getOrDefault(line.getMenuItemId(), List.of()), chosen(line));
            for (Need n : needs) {
                StockItem tin = stockItems.findByIdForUpdate(n.stockItemId()).orElse(null);
                if (tin == null) continue;   // the tin was thrown away since the recipe was written
                BigDecimal factor = tin.factorFrom(n.unit());
                if (factor == null) continue;   // refused on the way in; belt and braces
                BigDecimal want = n.quantity().multiply(factor).multiply(BigDecimal.valueOf(line.getQuantity()));
                BigDecimal take = want.min(tin.getQuantity().max(BigDecimal.ZERO));
                tin.setQuantity(tin.getQuantity().subtract(take));
                OrderItemDraw d = new OrderItemDraw();
                d.setOrderItemId(line.getId());
                d.setStockItemId(tin.getId());
                d.setWanted(want);
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

    // ---- the recipe as ordered ----

    /**
     * What a line takes once the customer's choices are applied. A substitution redirects a base
     * line to another tin at the same quantity; an addition is a line of its own. A choice with
     * no rule written for it changes nothing, which is what "regular milk" means.
     */
    static List<Need> apply(List<RecipeLine> base, List<OptionRecipeLine> optionRows, List<Chosen> chosen) {
        Map<Long, Long> swap = new HashMap<>();
        List<Need> extra = new ArrayList<>();
        for (Chosen c : chosen) {
            for (OptionRecipeLine o : optionRows) {
                if (!o.getGroupName().equals(c.groupNameEn()) || !o.getOptionName().equals(c.optionNameEn())) continue;
                if (o.isSubstitution()) swap.put(o.getReplacesStockItemId(), o.getStockItemId());
                else extra.add(new Need(o.getStockItemId(), o.getQuantity(), o.getUnit()));
            }
        }
        List<Need> out = new ArrayList<>();
        for (RecipeLine r : base) {
            out.add(new Need(swap.getOrDefault(r.getStockItemId(), r.getStockItemId()), r.getQuantity(), r.getUnit()));
        }
        out.addAll(extra);
        return out;
    }

    private List<Need> needs(Snapshot s, Long menuItemId, List<Chosen> chosen) {
        return apply(s.recipes.getOrDefault(menuItemId, List.of()),
                s.options.getOrDefault(menuItemId, List.of()), chosen);
    }

    /** A choice as the order line snapshotted it. Only the two names matter here. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Chosen(String groupNameEn, String optionNameEn) {}

    private List<Chosen> chosen(OrderItem line) {
        String json = line.getSelectedOptionsJson();
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<Chosen>>() {});
        } catch (Exception e) {
            // A snapshot this class cannot read is a line whose choices changed nothing.
            return List.of();
        }
    }

    // ---- internals ----

    /** One read of everything a verdict needs: caps, recipes, option rules, tins, today's tallies. */
    private Snapshot snapshot(Restaurant restaurant, Long branchId, Collection<Long> menuItemIds) {
        if (menuItemIds.isEmpty()) return new Snapshot(false, Map.of(), Map.of(), Map.of(), Map.of(), Map.of());
        Map<Long, MenuItemStock> capByItem = caps.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds).stream()
                .filter(c -> c.getDailyLimit() != null)
                .collect(Collectors.toMap(MenuItemStock::getMenuItemId, Function.identity()));
        Map<Long, List<RecipeLine>> recipeByItem = recipes.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds).stream()
                .collect(Collectors.groupingBy(RecipeLine::getMenuItemId));
        Map<Long, List<OptionRecipeLine>> optionByItem = optionRecipes.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds).stream()
                .collect(Collectors.groupingBy(OptionRecipeLine::getMenuItemId));

        Set<Long> tinIds = new HashSet<>();
        recipeByItem.values().forEach(l -> l.forEach(r -> tinIds.add(r.getStockItemId())));
        optionByItem.values().forEach(l -> l.forEach(o -> tinIds.add(o.getStockItemId())));
        Map<Long, StockItem> tins = tinIds.isEmpty() ? Map.of()
                : stockItems.findByIdIn(tinIds).stream()
                        .collect(Collectors.toMap(StockItem::getId, Function.identity()));

        Map<Long, Integer> sold = capByItem.isEmpty() ? Map.of()
                : tallies.findByBranchIdAndCafeDayAndMenuItemIdIn(
                        branchId, LocalDate.now(TimeZones.CAFES), capByItem.keySet()).stream()
                        .collect(Collectors.toMap(MenuItemDailyTally::getMenuItemId, MenuItemDailyTally::getSold));

        return new Snapshot(restaurant.isHideWhenOutOfStock(), capByItem, recipeByItem, optionByItem, tins, sold);
    }

    private static String tinName(StockItem tin) {
        return tin.getNameEn() != null ? tin.getNameEn() : tin.getNameAr();
    }

    private record Snapshot(boolean hide, Map<Long, MenuItemStock> caps,
                            Map<Long, List<RecipeLine>> recipes,
                            Map<Long, List<OptionRecipeLine>> options,
                            Map<Long, StockItem> tins, Map<Long, Integer> soldToday) {
        Integer remainingToday(Long menuItemId) {
            MenuItemStock cap = caps.get(menuItemId);
            if (cap == null) return null;
            return Math.max(0, cap.getDailyLimit() - soldToday.getOrDefault(menuItemId, 0));
        }

        /** One sale's worth of a need, in the tin's own unit; null when the tin is gone. */
        BigDecimal inTinUnits(Need n) {
            StockItem tin = tins.get(n.stockItemId());
            if (tin == null) return null;
            BigDecimal f = tin.factorFrom(n.unit());
            return f == null ? null : n.quantity().multiply(f);
        }

        /**
         * Would {@code count} sales run some ingredient dry? A tin that has vanished is left out —
         * a miss can only be a race, and a race must read as "nothing to say", never "sold out".
         */
        boolean cannotCover(List<Need> needs, int count) {
            Map<Long, BigDecimal> perTin = new HashMap<>();
            for (Need n : needs) {
                BigDecimal per = inTinUnits(n);
                if (per != null) perTin.merge(n.stockItemId(), per, BigDecimal::add);
            }
            for (Map.Entry<Long, BigDecimal> e : perTin.entrySet()) {
                BigDecimal have = tins.get(e.getKey()).getQuantity().max(BigDecimal.ZERO);
                if (e.getValue().multiply(BigDecimal.valueOf(count)).compareTo(have) > 0) return true;
            }
            return false;
        }
    }
}
