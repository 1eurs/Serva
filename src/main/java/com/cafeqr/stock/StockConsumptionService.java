package com.cafeqr.stock;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.stock.domain.MovementReason;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMode;
import com.cafeqr.stock.domain.StockMovement;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockLevelRepository;
import com.cafeqr.stock.repository.StockMovementRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Where selling something moves the ledger.
 *
 * <p><b>When we deduct.</b> On ACCEPT, not on placement and not on completion. Placement would
 * drain stock for orders that end up declined; completion is too late to stop the next customer
 * ordering the last croissant. Accept is the moment the kitchen commits to making it — the
 * equivalent of a POS "finalize sale".
 *
 * <p><b>Known limitation.</b> Ten simultaneous PENDING orders for the last croissant can all be
 * accepted, because nothing is reserved before accept. For a café doing a few orders a minute
 * that is a fair trade against the complexity of a reservation ledger; the balance simply goes
 * negative and shows up as an obvious "fix me" on the stock page.
 *
 * <p>Idempotency is structural: SALE movements are unique per (order, stock item) in the
 * database, so a double-accept cannot deduct twice and the restore path has exactly one row per
 * item to give back.
 */
@Service
public class StockConsumptionService {

    private static final Logger log = LoggerFactory.getLogger(StockConsumptionService.class);

    private final StockService stockService;
    private final RecipeService recipeService;
    private final StockLevelRepository levelRepository;
    private final StockMovementRepository movementRepository;
    private final RecipeLineRepository recipeLineRepository;
    private final MenuItemRepository menuItemRepository;
    private final RestaurantRepository restaurantRepository;
    private final ObjectMapper objectMapper;

    public StockConsumptionService(StockService stockService,
                                   RecipeService recipeService,
                                   StockLevelRepository levelRepository,
                                   StockMovementRepository movementRepository,
                                   RecipeLineRepository recipeLineRepository,
                                   MenuItemRepository menuItemRepository,
                                   RestaurantRepository restaurantRepository,
                                   ObjectMapper objectMapper) {
        this.stockService = stockService;
        this.recipeService = recipeService;
        this.levelRepository = levelRepository;
        this.movementRepository = movementRepository;
        this.recipeLineRepository = recipeLineRepository;
        this.menuItemRepository = menuItemRepository;
        this.restaurantRepository = restaurantRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Whether this café lets stock take an item off sale by itself. Missing restaurant means
     * yes, matching the column default — a lookup failure must not quietly disable a safeguard.
     */
    private boolean autoHides(Long restaurantId) {
        return restaurantRepository.findById(restaurantId).map(Restaurant::isAutoHideOutOfStock).orElse(true);
    }

    /** Only the option id is needed from the order line's snapshot; the rest is display data. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record OptionRef(Long optionId) {}

    // ============================================================ order hooks

    /**
     * Draws everything an accepted order consumes and books its daily-limit tallies.
     *
     * <p>Deliberately never throws: an order the café has already accepted must not be rolled
     * back because inventory data is incomplete. A missing recipe simply draws nothing, and a
     * short balance goes negative rather than failing the ticket.
     */
    @Transactional
    public void onOrderAccepted(Order order, Restaurant restaurant) {
        if (movementRepository.existsByOrderIdAndReason(order.getId(), MovementReason.SALE)) {
            return; // already deducted — a re-accept must not double-draw
        }
        try {
            LocalDate today = LocalDate.now(com.cafeqr.common.util.TimeZones.CAFES);
            Map<Long, BigDecimal> draws = new LinkedHashMap<>();

            for (OrderItem line : order.getItems()) {
                MenuItem menuItem = loadMenuItem(line.getMenuItemId());
                if (menuItem == null) {
                    continue; // item deleted since the order was placed
                }
                if (menuItem.getStockMode() == StockMode.DAILY_LIMIT) {
                    menuItem.consumeDailyLimit(today, line.getQuantity());
                    menuItemRepository.save(menuItem);
                    continue;
                }
                accumulate(draws, menuItem, line, order.getOrderType(), restaurant.isDisposablesForDineIn());
            }

            for (var entry : draws.entrySet()) {
                stockService.post(entry.getKey(), order.getBranchId(), entry.getValue().negate(),
                        MovementReason.SALE, order.getId(), null,
                        unitCostOf(entry.getKey()), null, true);
            }
            refreshAvailability(order.getRestaurantId(), order.getBranchId(), draws.keySet());
        } catch (RuntimeException e) {
            // Inventory must never cost a café an order it has already taken.
            log.error("Stock consumption failed for order {} — the order stands, stock is unchanged",
                    order.getId(), e);
        }
    }

    /**
     * Gives back everything a cancelled order drew. Only meaningful once the order had been
     * accepted; a decline straight out of PENDING never deducted anything, so there is nothing
     * to return and the SALE lookup finds nothing.
     */
    @Transactional
    public void onOrderCancelled(Order order) {
        if (movementRepository.existsByOrderIdAndReason(order.getId(), MovementReason.ORDER_RESTORE)) {
            return; // already given back
        }
        try {
            LocalDate today = LocalDate.now(com.cafeqr.common.util.TimeZones.CAFES);
            for (OrderItem line : order.getItems()) {
                MenuItem menuItem = loadMenuItem(line.getMenuItemId());
                if (menuItem != null && menuItem.getStockMode() == StockMode.DAILY_LIMIT) {
                    menuItem.releaseDailyLimit(today, line.getQuantity());
                    menuItemRepository.save(menuItem);
                }
            }

            List<StockMovement> sales = movementRepository.findByOrderIdAndReason(
                    order.getId(), MovementReason.SALE);
            Set<Long> touched = new LinkedHashSet<>();
            for (StockMovement sale : sales) {
                stockService.post(sale.getStockItemId(), sale.getBranchId(), sale.getDeltaBase().negate(),
                        MovementReason.ORDER_RESTORE, order.getId(), null, sale.getUnitCost(),
                        "Order cancelled", true);
                touched.add(sale.getStockItemId());
            }
            refreshAvailability(order.getRestaurantId(), order.getBranchId(), touched);
        } catch (RuntimeException e) {
            log.error("Stock restore failed for cancelled order {}", order.getId(), e);
        }
    }

    private void accumulate(Map<Long, BigDecimal> into, MenuItem menuItem, OrderItem line,
                            OrderType orderType, boolean disposablesForDineIn) {
        if (!menuItem.getStockMode().consumesStock()) {
            return;
        }
        List<Long> optionIds = selectedOptionIds(line);
        BigDecimal quantity = BigDecimal.valueOf(line.getQuantity());
        for (RecipeService.Draw draw : recipeService.explode(
                menuItem, optionIds, orderType, disposablesForDineIn)) {
            StockItem stockItem = stockService.getItem(draw.stockItemId());
            BigDecimal amount = stockItem.withWaste(draw.quantityBase()).multiply(quantity);
            into.merge(draw.stockItemId(), amount, BigDecimal::add);
        }
    }

    private List<Long> selectedOptionIds(OrderItem line) {
        String json = line.getSelectedOptionsJson();
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            OptionRef[] refs = objectMapper.readValue(json, OptionRef[].class);
            List<Long> ids = new ArrayList<>(refs.length);
            for (OptionRef ref : refs) {
                if (ref.optionId() != null) {
                    ids.add(ref.optionId());
                }
            }
            return ids;
        } catch (Exception e) {
            log.warn("Could not read selected options on order item {}", line.getId(), e);
            return List.of();
        }
    }

    private BigDecimal unitCostOf(Long stockItemId) {
        try {
            return stockService.getItem(stockItemId).getCostPerBaseUnit();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private MenuItem loadMenuItem(Long menuItemId) {
        return menuItemId == null ? null : menuItemRepository.findById(menuItemId).orElse(null);
    }

    // ============================================================ availability (86ing)

    /**
     * Turns menu items off when their ingredients run out, and back on when they return.
     *
     * <p>Only the item's <em>own</em> recipe (or its counted good) can 86 it. Running out of oat
     * milk hides nothing — you can still make the latte with dairy — and running out of lids
     * must not wipe the drinks menu. Modifiers and packaging are checked at order time instead,
     * where the customer's actual choice is known.
     *
     * <p>Re-enabling is guarded by {@code autoUnavailable}, so restocking never resurrects an
     * item the owner deliberately switched off.
     */
    @Transactional
    public void refreshAvailability(Long restaurantId, Long branchId, Set<Long> stockItemIds) {
        if (stockItemIds == null || stockItemIds.isEmpty()) {
            return;
        }
        List<Long> ids = new ArrayList<>(stockItemIds);
        Set<Long> candidates = new LinkedHashSet<>(recipeLineRepository.menuItemIdsUsing(ids));
        for (MenuItem simple : menuItemRepository.findByRestaurantIdAndStockItemIdIn(restaurantId, ids)) {
            candidates.add(simple.getId());
        }
        if (candidates.isEmpty()) {
            return;
        }

        Map<Long, BigDecimal> onHand = onHandFor(branchId, ids);
        Map<Long, List<RecipeLine>> recipes = recipesFor(new ArrayList<>(candidates));
        /* When the café has switched automatic hiding off, this pass still runs — because it
           is also what puts back anything stock hid earlier. Restoring is guarded by
           autoUnavailable, so an item the owner switched off by hand stays off. */
        boolean autoHide = autoHides(restaurantId);
        for (MenuItem item : menuItemRepository.findAllById(candidates)) {
            if (!item.getRestaurantId().equals(restaurantId) || !item.getStockMode().consumesStock()) {
                continue;
            }
            if (!autoHide) {
                if (!item.isAvailable() && item.isAutoUnavailable()) {
                    item.setAvailable(true);
                    item.setAutoUnavailable(false);
                    menuItemRepository.save(item);
                }
                continue;
            }
            boolean canMake = canMake(item, branchId, onHand, recipes);
            if (!canMake && item.isAvailable()) {
                item.setAvailable(false);
                item.setAutoUnavailable(true);
                menuItemRepository.save(item);
            } else if (canMake && !item.isAvailable() && item.isAutoUnavailable()) {
                item.setAvailable(true);
                item.setAutoUnavailable(false);
                menuItemRepository.save(item);
            }
        }
    }

    /**
     * @param recipesByItem every candidate's recipe lines, pre-loaded in one query. This runs on
     *                      the public menu — the busiest endpoint in the product — so it must not
     *                      issue a query per item.
     */
    private boolean canMake(MenuItem item, Long branchId, Map<Long, BigDecimal> cachedOnHand,
                            Map<Long, List<RecipeLine>> recipesByItem) {
        List<RecipeService.Draw> required = new ArrayList<>();
        if (item.getStockMode() == StockMode.SIMPLE && item.getStockItemId() != null) {
            if (neverCounted(item.getStockItemId(), branchId, cachedOnHand)) {
                return true; // counting is on but nobody has said how many — don't 86 it
            }
            required.add(new RecipeService.Draw(item.getStockItemId(), BigDecimal.ONE));
        } else {
            recipesByItem.getOrDefault(item.getId(), List.of()).forEach(line ->
                    required.add(new RecipeService.Draw(line.getStockItemId(), line.getQuantityBase())));
        }
        if (required.isEmpty()) {
            return true; // RECIPE mode with no recipe yet — don't hide the item over missing data
        }
        for (RecipeService.Draw draw : required) {
            if (draw.quantityBase().signum() <= 0) {
                continue;
            }
            /* Never counted here is not "none here". The SIMPLE branch above has always
               known that; the recipe branch did not, and it is the common one — so an
               owner who added beans to stock and put them in the latte recipe had every
               drink using beans leave the customer menu the moment they saved it, before
               anyone had a chance to count a single gram. An ingredient with no figure on
               record cannot be short of anything. */
            if (neverCounted(draw.stockItemId(), branchId, cachedOnHand)) {
                continue;
            }
            BigDecimal have = cachedOnHand.containsKey(draw.stockItemId())
                    ? cachedOnHand.get(draw.stockItemId())
                    : onHandOf(draw.stockItemId(), branchId);
            if (have.compareTo(draw.quantityBase()) < 0) {
                return false;
            }
        }
        return true;
    }

    /** Recipe lines for many menu items in one query, grouped by item. */
    private Map<Long, List<RecipeLine>> recipesFor(List<Long> menuItemIds) {
        if (menuItemIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<RecipeLine>> byItem = new LinkedHashMap<>();
        for (RecipeLine line : recipeLineRepository.findByMenuItemIdIn(menuItemIds)) {
            byItem.computeIfAbsent(line.getMenuItemId(), id -> new ArrayList<>()).add(line);
        }
        return byItem;
    }

    private Map<Long, BigDecimal> onHandFor(Long branchId, List<Long> stockItemIds) {
        Map<Long, BigDecimal> map = new LinkedHashMap<>();
        for (StockLevel level : levelRepository.findByBranchIdAndStockItemIdIn(branchId, stockItemIds)) {
            map.put(level.getStockItemId(), level.getQuantityBase());
        }
        for (Long id : stockItemIds) {
            map.putIfAbsent(id, BigDecimal.ZERO);
        }
        return map;
    }

    private BigDecimal onHandOf(Long stockItemId, Long branchId) {
        return levelRepository.findByStockItemIdAndBranchId(stockItemId, branchId)
                .map(StockLevel::getQuantityBase)
                .orElse(BigDecimal.ZERO);
    }

    /**
     * True when this branch has never recorded a figure for the good — no level row at all.
     *
     * <p>Never counted and counted-to-zero are not the same fact, and {@link #onHandOf}
     * flattens them by answering ZERO for both. That is harmless for an ingredient, which
     * only exists because someone added it deliberately. It is not harmless for the good a
     * SIMPLE menu item is backed by: that good is created automatically the moment the mode
     * is chosen, so a café that ticked "bought ready-made" on its croissant immediately owned
     * a croissant count of zero it had never been asked for — and the next order was refused
     * for a pastry sitting in the display case.
     *
     * <p>The same instinct is already written down twice: {@code canMake} refuses to 86 a
     * RECIPE item that has no recipe yet, and the stock page insists that "never stocked and
     * ran out are not the same news". This is that rule for the one path that slipped past
     * both, because SIMPLE always produces exactly one required draw.
     *
     * <p>Cheap on the public menu: callers pass a map already loaded with every level row for
     * the branch, so a hit costs nothing and only a genuinely absent row reaches the query.
     */
    private boolean neverCounted(Long stockItemId, Long branchId, Map<Long, BigDecimal> cachedOnHand) {
        if (cachedOnHand.containsKey(stockItemId)) {
            return false;
        }
        return levelRepository.findByStockItemIdAndBranchId(stockItemId, branchId).isEmpty();
    }

    // ============================================================ pre-order checks

    /**
     * Rejects a line the café cannot actually make, before it reaches a ticket.
     *
     * <p>Runs at order placement (see {@code MenuService.getOrderableItem}) where the customer's
     * chosen options are known — so this is the check that catches "no oat milk left", which
     * {@link #refreshAvailability} deliberately does not 86 the whole item for.
     */
    @Transactional(readOnly = true)
    public void requireSellable(MenuItem menuItem, Long branchId, int quantity,
                                List<Long> selectedOptionIds, OrderType orderType,
                                boolean disposablesForDineIn) {
        LocalDate today = LocalDate.now(com.cafeqr.common.util.TimeZones.CAFES);
        Integer remaining = menuItem.remainingToday(today);
        if (remaining != null && remaining < quantity) {
            throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE, remaining == 0
                    ? "\"" + menuItem.getNameEn() + "\" is sold out for today."
                    : "Only " + remaining + " of \"" + menuItem.getNameEn() + "\" left today.");
        }
        /* The daily limit above is an explicit number the owner typed, so it is always
           enforced. Ingredient shortfalls are a measurement, and a café that has switched
           automatic hiding off has said it does not want a measurement refusing sales. */
        if (!menuItem.getStockMode().consumesStock() || !autoHides(menuItem.getRestaurantId())) {
            return;
        }
        /* Counting switched on, nobody counted yet — see neverCounted. Refusing the sale here
           was the sharpest edge of that bug: the item stayed on the menu (choosing the mode
           does not itself refresh availability), so a customer could see the croissant, tap
           it, and be told it was sold out. */
        if (menuItem.getStockMode() == StockMode.SIMPLE && menuItem.getStockItemId() != null
                && neverCounted(menuItem.getStockItemId(), branchId, Map.of())) {
            return;
        }
        BigDecimal wanted = BigDecimal.valueOf(quantity);
        for (RecipeService.Draw draw : recipeService.explode(
                menuItem, selectedOptionIds, orderType, disposablesForDineIn)) {
            BigDecimal need = draw.quantityBase().multiply(wanted);
            if (need.signum() <= 0) {
                continue;
            }
            if (onHandOf(draw.stockItemId(), branchId).compareTo(need) < 0) {
                StockItem shortItem = stockService.getItem(draw.stockItemId());
                throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE,
                        "Out of " + shortItem.getNameEn() + " — \"" + menuItem.getNameEn()
                                + "\" can't be made right now.");
            }
        }
    }

    /**
     * Menu item ids that cannot currently be made at this branch, so the customer menu can grey
     * them out. Covers both stock-backed items and today's daily limits in one pass.
     */
    @Transactional(readOnly = true)
    public Set<Long> soldOutItemIds(Long restaurantId, Long branchId) {
        Set<Long> soldOut = new HashSet<>();
        LocalDate today = LocalDate.now(com.cafeqr.common.util.TimeZones.CAFES);
        List<MenuItem> tracked = menuItemRepository.findByRestaurantIdAndStockModeNot(
                restaurantId, StockMode.NONE);
        if (tracked.isEmpty()) {
            return soldOut;
        }
        /* Daily limits still grey out — the owner set that number deliberately. Ingredient
           shortfalls do not, when the café has turned automatic hiding off. */
        boolean autoHide = autoHides(restaurantId);
        Map<Long, BigDecimal> onHand = new LinkedHashMap<>();
        for (StockLevel level : levelRepository.findByBranchId(branchId)) {
            onHand.put(level.getStockItemId(), level.getQuantityBase());
        }
        Map<Long, List<RecipeLine>> recipes = recipesFor(
                tracked.stream().map(MenuItem::getId).toList());
        for (MenuItem item : tracked) {
            if (item.getStockMode() == StockMode.DAILY_LIMIT) {
                Integer remaining = item.remainingToday(today);
                if (remaining != null && remaining <= 0) {
                    soldOut.add(item.getId());
                }
            } else if (autoHide && item.getStockMode().consumesStock()
                    && !canMake(item, branchId, onHand, recipes)) {
                soldOut.add(item.getId());
            }
        }
        return soldOut;
    }

    /**
     * What the customer cannot order right now, and what to do about it.
     *
     * <p>{@link #soldOutItemIds} answers the menu's question — grey this out — but it is the
     * wrong answer for the owner, who needs to know that a drink vanished and which single
     * ingredient did it. Without that, an item added to a recipe by accident silently takes
     * a drink off sale and the first anyone hears of it is a customer asking.
     *
     * @param blockerName the ingredient that ran out, or null when a daily limit is the cause
     */
    public record SoldOut(Long menuItemId, String nameEn, String nameAr,
                          String reason, Long blockerId, String blockerName) {}

    @Transactional(readOnly = true)
    public List<SoldOut> soldOutDetail(Long restaurantId, Long branchId) {
        List<SoldOut> out = new ArrayList<>();
        LocalDate today = LocalDate.now(com.cafeqr.common.util.TimeZones.CAFES);
        List<MenuItem> tracked = menuItemRepository.findByRestaurantIdAndStockModeNot(
                restaurantId, StockMode.NONE);
        if (tracked.isEmpty()) {
            return out;
        }
        Map<Long, BigDecimal> onHand = new LinkedHashMap<>();
        for (StockLevel level : levelRepository.findByBranchId(branchId)) {
            onHand.put(level.getStockItemId(), level.getQuantityBase());
        }
        Map<Long, List<RecipeLine>> recipes = recipesFor(
                tracked.stream().map(MenuItem::getId).toList());
        /* Two passes so the blocking ingredients are named in one query rather than one each —
           this hangs off the stock overview, which the dashboard polls. */
        Map<Long, Long> blockers = new LinkedHashMap<>();
        for (MenuItem item : tracked) {
            if (item.getStockMode() == StockMode.DAILY_LIMIT) {
                Integer remaining = item.remainingToday(today);
                if (remaining != null && remaining <= 0) {
                    out.add(new SoldOut(item.getId(), item.getNameEn(), item.getNameAr(),
                            "DAILY_LIMIT_REACHED", null, null));
                }
            } else if (item.getStockMode().consumesStock()) {
                Long blocker = firstMissing(item, branchId, onHand, recipes);
                if (blocker != null) {
                    blockers.put(item.getId(), blocker);
                }
            }
        }
        Map<Long, StockItem> named = stockService.itemsById(List.copyOf(new HashSet<>(blockers.values())));
        for (MenuItem item : tracked) {
            Long blocker = blockers.get(item.getId());
            if (blocker == null) {
                continue;
            }
            StockItem s = named.get(blocker);
            out.add(new SoldOut(item.getId(), item.getNameEn(), item.getNameAr(),
                    "OUT_OF_STOCK", blocker, s == null ? null : s.getNameEn()));
        }
        return out;
    }

    /** The first ingredient this item hasn't got enough of, or null when it can be made. */
    private Long firstMissing(MenuItem item, Long branchId, Map<Long, BigDecimal> cachedOnHand,
                              Map<Long, List<RecipeLine>> recipesByItem) {
        List<RecipeService.Draw> required = new ArrayList<>();
        if (item.getStockMode() == StockMode.SIMPLE && item.getStockItemId() != null) {
            if (neverCounted(item.getStockItemId(), branchId, cachedOnHand)) {
                return null; // uncounted, so nothing is missing — see neverCounted
            }
            required.add(new RecipeService.Draw(item.getStockItemId(), BigDecimal.ONE));
        } else {
            recipesByItem.getOrDefault(item.getId(), List.of()).forEach(line ->
                    required.add(new RecipeService.Draw(line.getStockItemId(), line.getQuantityBase())));
        }
        for (RecipeService.Draw draw : required) {
            if (draw.quantityBase().signum() <= 0) {
                continue;
            }
            // Same rule as canMake: no figure on record is not a shortfall.
            if (neverCounted(draw.stockItemId(), branchId, cachedOnHand)) {
                continue;
            }
            BigDecimal have = cachedOnHand.containsKey(draw.stockItemId())
                    ? cachedOnHand.get(draw.stockItemId())
                    : onHandOf(draw.stockItemId(), branchId);
            if (have.compareTo(draw.quantityBase()) < 0) {
                return draw.stockItemId();
            }
        }
        return null;
    }

    /** True when this order is in a state whose stock draw should be given back on cancel. */
    public static boolean hadBeenAccepted(OrderStatus previous) {
        return previous == OrderStatus.ACCEPTED
                || previous == OrderStatus.PREPARING
                || previous == OrderStatus.READY;
    }
}
