package com.cafeqr.stock;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.domain.MenuItemDailyTally;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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
 * <p>Three things happen here and nowhere else. A customer order is refused when the shelf cannot
 * honour it ({@link #requireAvailable}). An accepted order takes what it needs ({@link #draw}). A
 * cancelled one puts it back ({@link #restore}). And the menu asks which items are out and how
 * many are left today ({@link #availability}).
 *
 * <p>Two promises hold throughout. <b>Nothing is hidden unless the owner said so:</b> an item with
 * no rule is never touched, a stock-backed item is only hidden when the restaurant's switch is
 * on, and a daily limit — which the owner typed on purpose — always applies. <b>Nothing moves
 * twice:</b> the order carries one mark saying a draw is outstanding, so a double accept or a
 * double cancel is a no-op, and what each line took is written on the line so a restore reverses
 * exactly that — never the current rule, which may have changed since.
 *
 * <p>The daily tally is counted for every accepted line, capped or not. A limit set at two in the
 * afternoon then honestly includes the morning, and "sold today" is the figure recipes read.
 *
 * <p>Every method joins the caller's transaction. The order service owns the transaction and the
 * order; this class only ever touches shelf rows and tallies inside it.
 */
@Service
public class StockDrawService {

    private final MenuItemStockRepository rules;
    private final StockItemRepository stockItems;
    private final MenuItemDailyTallyRepository tallies;

    public StockDrawService(MenuItemStockRepository rules,
                            StockItemRepository stockItems,
                            MenuItemDailyTallyRepository tallies) {
        this.rules = rules;
        this.stockItems = stockItems;
        this.tallies = tallies;
    }

    /** What the menu says about one item. Absent from the map means: nothing to say. */
    public record ItemAvailability(boolean soldOut, Integer remainingToday) {}

    /**
     * Which of these menu items are sold out at this branch right now, and how many are left of
     * the ones with a daily cap. Computed when asked, never stored — see V47 for why.
     */
    @Transactional(readOnly = true)
    public Map<Long, ItemAvailability> availability(Restaurant restaurant, Long branchId,
                                                    Collection<Long> menuItemIds) {
        Snapshot s = snapshot(restaurant, branchId, menuItemIds);
        Map<Long, ItemAvailability> out = new HashMap<>();
        for (MenuItemStock rule : s.rules.values()) {
            Integer remaining = s.remainingToday(rule);
            boolean out0 = (remaining != null && remaining == 0)
                    || (s.hide && s.backed(rule) && s.onShelf(rule).signum() <= 0);
            out.put(rule.getMenuItemId(), new ItemAvailability(out0, remaining));
        }
        return out;
    }

    /**
     * Refuse a customer order the shelf cannot honour.
     *
     * <p>Aggregated first, because a cart can hold the same item twice with different options, and
     * two menu items can be backed by the same tin — three of one and two of the other is five
     * croissants. The check is read-only; between it and the draw another order may slip in, and
     * the draw clamps. That window is accepted: the alternative is holding row locks across the
     * whole of order creation.
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

        Map<Long, BigDecimal> perStock = new LinkedHashMap<>();
        Map<Long, String> stockNames = new HashMap<>();
        for (Map.Entry<Long, Integer> w : wanted.entrySet()) {
            MenuItemStock rule = s.rules.get(w.getKey());
            if (rule == null) continue;
            Integer remaining = s.remainingToday(rule);
            if (remaining != null && w.getValue() > remaining) {
                throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE, remaining == 0
                        ? "\"" + names.get(w.getKey()) + "\" is sold out for today"
                        : "Only " + remaining + " of \"" + names.get(w.getKey()) + "\" left today");
            }
            if (s.hide && s.backed(rule)) {
                perStock.merge(rule.getStockItemId(), BigDecimal.valueOf(w.getValue()), BigDecimal::add);
                stockNames.putIfAbsent(rule.getStockItemId(), names.get(w.getKey()));
            }
        }
        for (Map.Entry<Long, BigDecimal> p : perStock.entrySet()) {
            BigDecimal have = s.stock.get(p.getKey());
            if (p.getValue().compareTo(have) > 0) {
                throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE, have.signum() <= 0
                        ? "\"" + stockNames.get(p.getKey()) + "\" is sold out"
                        : "Only " + have.stripTrailingZeros().toPlainString()
                        + " of \"" + stockNames.get(p.getKey()) + "\" left");
            }
        }
    }

    /**
     * Take what an accepted order needs. Idempotent: the order's mark says whether a draw is
     * already outstanding, and a second call does nothing.
     *
     * <p>Each shelf row is locked while it is decremented, because two orders for the last
     * croissant can be accepted in the same second. The count is clamped at zero and the line
     * records what it actually got, which is the figure a restore will put back. The switch is
     * not consulted: drawing is bookkeeping and runs whether or not anything is hidden.
     */
    @Transactional
    public void draw(Order order) {
        if (order.getStockDrawnAt() != null) return;
        Instant now = Instant.now();
        LocalDate day = LocalDate.ofInstant(now, TimeZones.CAFES);
        Map<Long, MenuItemStock> byItem = rulesFor(order.getBranchId(), order.getItems());

        for (OrderItem line : order.getItems()) {
            if (line.getMenuItemId() == null) continue;
            tallies.add(line.getMenuItemId(), order.getBranchId(), day, line.getQuantity());

            MenuItemStock rule = byItem.get(line.getMenuItemId());
            if (rule == null || rule.getStockItemId() == null) continue;
            StockItem stock = stockItems.findByIdForUpdate(rule.getStockItemId()).orElse(null);
            if (stock == null) continue;   // the tin was thrown away since the rule was written
            BigDecimal want = BigDecimal.valueOf(line.getQuantity());
            BigDecimal take = want.min(stock.getQuantity().max(BigDecimal.ZERO));
            stock.setQuantity(stock.getQuantity().subtract(take));
            line.setDrawnStockItemId(stock.getId());
            line.setDrawnQty(take);
        }
        order.setStockDrawnAt(now);
    }

    /**
     * Put back what a cancelled order took. Idempotent, and blind to the current rules: it reads
     * what each line recorded, so a link changed or removed since the draw cannot misdirect it,
     * and a tin thrown away since simply has nothing to receive.
     *
     * <p>The tally comes off the day the draw was made — an order accepted last night and
     * cancelled this morning was last night's sale.
     */
    @Transactional
    public void restore(Order order) {
        Instant drawnAt = order.getStockDrawnAt();
        if (drawnAt == null) return;
        LocalDate day = LocalDate.ofInstant(drawnAt, TimeZones.CAFES);

        for (OrderItem line : order.getItems()) {
            if (line.getMenuItemId() != null) {
                tallies.subtract(line.getMenuItemId(), order.getBranchId(), day, line.getQuantity());
            }
            if (line.getDrawnStockItemId() != null && line.getDrawnQty() != null
                    && line.getDrawnQty().signum() > 0) {
                stockItems.findByIdForUpdate(line.getDrawnStockItemId())
                        .ifPresent(stock -> stock.setQuantity(stock.getQuantity().add(line.getDrawnQty())));
            }
            line.setDrawnStockItemId(null);
            line.setDrawnQty(null);
        }
        order.setStockDrawnAt(null);
    }

    // ---- internals ----

    private Map<Long, MenuItemStock> rulesFor(Long branchId, List<OrderItem> lines) {
        Set<Long> ids = lines.stream().map(OrderItem::getMenuItemId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return rules.findByBranchIdAndMenuItemIdIn(branchId, ids).stream()
                .collect(Collectors.toMap(MenuItemStock::getMenuItemId, Function.identity()));
    }

    /** One read of everything a verdict needs: the rules, the tins they name, today's tallies. */
    private Snapshot snapshot(Restaurant restaurant, Long branchId, Collection<Long> menuItemIds) {
        if (menuItemIds.isEmpty()) return new Snapshot(false, Map.of(), Map.of(), Map.of());
        Map<Long, MenuItemStock> byItem = rules.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds).stream()
                .collect(Collectors.toMap(MenuItemStock::getMenuItemId, Function.identity()));

        Set<Long> stockIds = byItem.values().stream().map(MenuItemStock::getStockItemId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, BigDecimal> stock = stockIds.isEmpty() ? Map.of()
                : stockItems.findByIdIn(stockIds).stream()
                        .collect(Collectors.toMap(StockItem::getId, StockItem::getQuantity));

        Set<Long> capped = byItem.values().stream().filter(r -> r.getDailyLimit() != null)
                .map(MenuItemStock::getMenuItemId).collect(Collectors.toSet());
        Map<Long, Integer> sold = capped.isEmpty() ? Map.of()
                : tallies.findByBranchIdAndCafeDayAndMenuItemIdIn(
                        branchId, LocalDate.now(TimeZones.CAFES), capped).stream()
                        .collect(Collectors.toMap(MenuItemDailyTally::getMenuItemId, MenuItemDailyTally::getSold));

        return new Snapshot(restaurant.isHideWhenOutOfStock(), byItem, stock, sold);
    }

    private record Snapshot(boolean hide, Map<Long, MenuItemStock> rules,
                            Map<Long, BigDecimal> stock, Map<Long, Integer> soldToday) {
        Integer remainingToday(MenuItemStock rule) {
            if (rule.getDailyLimit() == null) return null;
            return Math.max(0, rule.getDailyLimit() - soldToday.getOrDefault(rule.getMenuItemId(), 0));
        }

        /**
         * Linked to a tin that is actually there. The FK nulls the link the moment a tin is
         * thrown away, so the miss can only be a race — and a race must read as "nothing to
         * say", never as "sold out". Silence is the safe default.
         */
        boolean backed(MenuItemStock rule) {
            return rule.getStockItemId() != null && stock.containsKey(rule.getStockItemId());
        }

        BigDecimal onShelf(MenuItemStock rule) {
            return stock.get(rule.getStockItemId());
        }
    }
}
