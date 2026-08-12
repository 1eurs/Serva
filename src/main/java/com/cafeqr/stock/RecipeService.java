package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.stock.domain.Allergen;
import com.cafeqr.stock.domain.OrderTypeScope;
import com.cafeqr.stock.domain.PackagingRule;
import com.cafeqr.stock.domain.PackagingRuleLine;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockKind;
import com.cafeqr.stock.domain.StockMode;
import com.cafeqr.stock.repository.PackagingRuleRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The bill of materials: what a menu item is made of, what that costs, and what it contains.
 *
 * <p>The central operation is {@link #explode} — given an item, the options the customer chose
 * and the service style, produce the list of stock draws. Options contribute <em>deltas</em>
 * exactly the way they already contribute price deltas in {@code OrderService.addItems}, so a
 * line is {@code base + SUM(chosen option deltas)} and a quantity may legitimately be negative
 * (a Large swaps out the small cup as −1 and swaps in the large one as +1).
 *
 * <p>Packaging is resolved rather than stored per drink: a size option carries a
 * {@link PackagingRule} and the rule expands to cup + lid + sleeve here. Nobody is going to
 * hand-add three disposables to forty drinks, and re-mapping a rule must not rewrite the menu.
 */
@Service
public class RecipeService {

    private static final int COST_SCALE = 6;
    private static final int MONEY_SCALE = 3;
    /** Depth guard for allergen rollup: prep items can reference prep items. */
    private static final int MAX_PREP_DEPTH = 5;

    private final RecipeLineRepository recipeLineRepository;
    private final PackagingRuleRepository packagingRuleRepository;
    private final StockItemRepository stockItemRepository;
    private final MenuItemRepository menuItemRepository;
    private final AccessGuard accessGuard;

    public RecipeService(RecipeLineRepository recipeLineRepository,
                         PackagingRuleRepository packagingRuleRepository,
                         StockItemRepository stockItemRepository,
                         MenuItemRepository menuItemRepository,
                         AccessGuard accessGuard) {
        this.recipeLineRepository = recipeLineRepository;
        this.packagingRuleRepository = packagingRuleRepository;
        this.stockItemRepository = stockItemRepository;
        this.menuItemRepository = menuItemRepository;
        this.accessGuard = accessGuard;
    }

    /** One resolved stock draw: how much of an item a sale takes. */
    public record Draw(Long stockItemId, BigDecimal quantityBase) {}

    // ============================================================ explosion

    /**
     * What one unit of {@code menuItem} consumes, given the chosen options and service style.
     *
     * <p>Returns aggregated positive draws only. A negative net (an option that swaps something
     * out without swapping anything in) is dropped rather than credited back to stock — giving
     * inventory back for a drink you just made would be wrong.
     *
     * @param selectedOptionIds ids from the order line's option snapshot; empty for costing
     * @param orderType         null means "ignore service-style scoping" (costing a menu item
     *                          in the abstract, where dine-in vs car is not yet known)
     * @param disposablesForDineIn the café's own answer to "do dine-in orders burn a cup?"
     */
    @Transactional(readOnly = true)
    public List<Draw> explode(MenuItem menuItem,
                              Collection<Long> selectedOptionIds,
                              OrderType orderType,
                              boolean disposablesForDineIn) {
        Map<Long, BigDecimal> totals = new LinkedHashMap<>();

        if (menuItem.getStockMode() == StockMode.SIMPLE) {
            // A counted good is a one-line recipe. Same engine, friendlier face.
            if (menuItem.getStockItemId() != null) {
                totals.merge(menuItem.getStockItemId(), BigDecimal.ONE, BigDecimal::add);
            }
        } else if (menuItem.getStockMode() == StockMode.RECIPE) {
            for (RecipeLine line : recipeLineRepository.findByMenuItemId(menuItem.getId())) {
                if (scopeApplies(line.getOrderTypeScope(), orderType)) {
                    totals.merge(line.getStockItemId(), line.getQuantityBase(), BigDecimal::add);
                }
            }
        }

        // Modifier deltas apply in SIMPLE mode too: an "extra shot" on a counted item still
        // draws beans even though the item itself is counted rather than built from a recipe.
        List<Long> optionIds = selectedOptionIds == null ? List.of() : new ArrayList<>(selectedOptionIds);
        if (!optionIds.isEmpty()) {
            for (RecipeLine line : recipeLineRepository.findByMenuItemOptionIdIn(optionIds)) {
                if (scopeApplies(line.getOrderTypeScope(), orderType)) {
                    totals.merge(line.getStockItemId(), line.getQuantityBase(), BigDecimal::add);
                }
            }
        }

        if (packagingApplies(orderType, disposablesForDineIn)) {
            PackagingRule rule = resolvePackagingRule(menuItem, optionIds);
            if (rule != null) {
                for (PackagingRuleLine line : rule.getLines()) {
                    totals.merge(line.getStockItemId(), line.getQuantityBase(), BigDecimal::add);
                }
            }
        }

        List<Draw> draws = new ArrayList<>(totals.size());
        totals.forEach((stockItemId, qty) -> {
            if (qty.signum() > 0) {
                draws.add(new Draw(stockItemId, qty));
            }
        });
        return draws;
    }

    private static boolean scopeApplies(OrderTypeScope scope, OrderType orderType) {
        return orderType == null || scope.matches(orderType);
    }

    /**
     * Whether this service style burns disposables at all. Car orders always do; dine-in only
     * where the café says so — some serve dine-in in ceramic, some use paper for everything.
     */
    private static boolean packagingApplies(OrderType orderType, boolean disposablesForDineIn) {
        if (orderType == null) {
            return false; // abstract costing: packaging depends on how it is served
        }
        return orderType == OrderType.CAR || disposablesForDineIn;
    }

    /**
     * The size the customer picked decides the cup, so an option's rule beats the item's
     * default. With no size choice the item's own rule stands in; with neither, no packaging.
     */
    private PackagingRule resolvePackagingRule(MenuItem menuItem, List<Long> selectedOptionIds) {
        if (!selectedOptionIds.isEmpty()) {
            Set<Long> chosen = new HashSet<>(selectedOptionIds);
            for (MenuItemOptionGroup group : menuItem.getOptionGroups()) {
                for (MenuItemOption option : group.getOptions()) {
                    if (chosen.contains(option.getId()) && option.getPackagingRuleId() != null) {
                        return packagingRuleRepository.findById(option.getPackagingRuleId()).orElse(null);
                    }
                }
            }
        }
        return menuItem.getPackagingRuleId() == null
                ? null
                : packagingRuleRepository.findById(menuItem.getPackagingRuleId()).orElse(null);
    }

    // ============================================================ costing

    /**
     * Plate cost of one unit at current average ingredient costs, excluding packaging (which
     * depends on how it is served — {@link #packagingCost} prices that separately).
     *
     * <p>This number is the whole reason a café will ever finish entering recipes: it turns
     * "18 g of beans" into "this latte costs you 0.185 and sells for 1.500".
     */
    @Transactional(readOnly = true)
    public BigDecimal plateCost(MenuItem menuItem) {
        List<Draw> draws = explode(menuItem, List.of(), null, false);
        return costOf(draws);
    }

    /** Cost of the disposables one serving of this item burns under the given rule mapping. */
    @Transactional(readOnly = true)
    public BigDecimal packagingCost(MenuItem menuItem) {
        PackagingRule rule = resolvePackagingRule(menuItem, List.of());
        if (rule == null) {
            return BigDecimal.ZERO;
        }
        List<Draw> draws = rule.getLines().stream()
                .map(l -> new Draw(l.getStockItemId(), l.getQuantityBase()))
                .toList();
        return costOf(draws);
    }

    private BigDecimal costOf(List<Draw> draws) {
        if (draws.isEmpty()) {
            return BigDecimal.ZERO.setScale(COST_SCALE, RoundingMode.HALF_UP);
        }
        Map<Long, StockItem> items = byId(draws.stream().map(Draw::stockItemId).toList());
        BigDecimal total = BigDecimal.ZERO;
        for (Draw draw : draws) {
            StockItem item = items.get(draw.stockItemId());
            if (item != null) {
                total = total.add(item.costOf(item.withWaste(draw.quantityBase())));
            }
        }
        return total.setScale(COST_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Cost as a percentage of the selling price — the number the trade actually manages by.
     * Roughly 25–35% is healthy for food and 12–20% for espresso drinks. Null when the item
     * has no cost data yet or is free.
     */
    public BigDecimal foodCostPercent(BigDecimal cost, BigDecimal price) {
        if (cost == null || price == null || price.signum() <= 0 || cost.signum() <= 0) {
            return null;
        }
        return cost.multiply(BigDecimal.valueOf(100))
                .divide(price, 1, RoundingMode.HALF_UP);
    }

    // ============================================================ allergens

    /**
     * Every allergen reachable from this item's recipe, walking into prep items so a cookie
     * inherits the gluten in its flour.
     *
     * <p>Serva already <em>is</em> the menu, so once ingredients exist this labelling is nearly
     * free — and it is the strongest reason a café will bother finishing their recipes.
     */
    @Transactional(readOnly = true)
    public Set<Allergen> allergensFor(MenuItem menuItem) {
        Set<Allergen> found = EnumSet.noneOf(Allergen.class);
        List<Long> rootIds = new ArrayList<>();
        if (menuItem.getStockMode() == StockMode.SIMPLE && menuItem.getStockItemId() != null) {
            rootIds.add(menuItem.getStockItemId());
        }
        for (RecipeLine line : recipeLineRepository.findByMenuItemId(menuItem.getId())) {
            rootIds.add(line.getStockItemId());
        }
        // Modifiers count too — an oat-milk swap is exactly the case a nut-allergic customer
        // is filtering for, so an item's badge set is the union across every possible choice.
        for (MenuItemOptionGroup group : menuItem.getOptionGroups()) {
            List<Long> optionIds = group.getOptions().stream().map(MenuItemOption::getId).toList();
            if (!optionIds.isEmpty()) {
                for (RecipeLine line : recipeLineRepository.findByMenuItemOptionIdIn(optionIds)) {
                    rootIds.add(line.getStockItemId());
                }
            }
        }
        collectAllergens(rootIds, found, new HashSet<>(), 0);
        return found;
    }

    /**
     * Allergen sets for a whole menu in a handful of queries rather than one per item.
     *
     * <p>The public menu renders every item on every load, so the per-item {@link #allergensFor}
     * would be dozens of round trips. This walks the restaurant's recipe lines once and folds
     * option lines back onto their parent item.
     */
    @Transactional(readOnly = true)
    public Map<Long, Set<Allergen>> allergensByMenuItem(Long restaurantId, List<MenuItem> items) {
        Map<Long, Set<Allergen>> result = new LinkedHashMap<>();
        if (items.isEmpty()) {
            return result;
        }
        // option id -> owning menu item, so a modifier's ingredients land on the right dish
        Map<Long, Long> itemByOption = new LinkedHashMap<>();
        Map<Long, List<Long>> stockIdsByItem = new LinkedHashMap<>();
        for (MenuItem item : items) {
            List<Long> ids = new ArrayList<>();
            if (item.getStockMode() == StockMode.SIMPLE && item.getStockItemId() != null) {
                ids.add(item.getStockItemId());
            }
            stockIdsByItem.put(item.getId(), ids);
            for (MenuItemOptionGroup group : item.getOptionGroups()) {
                for (MenuItemOption option : group.getOptions()) {
                    itemByOption.put(option.getId(), item.getId());
                }
            }
        }
        for (RecipeLine line : recipeLineRepository.findByRestaurantId(restaurantId)) {
            Long ownerItemId = line.getMenuItemId() != null
                    ? line.getMenuItemId()
                    : itemByOption.get(line.getMenuItemOptionId());
            if (ownerItemId != null && stockIdsByItem.containsKey(ownerItemId)) {
                stockIdsByItem.get(ownerItemId).add(line.getStockItemId());
            }
        }

        // Cache prep expansions across items — a shared syrup is resolved once, not per dish.
        Map<Long, Set<Allergen>> perStockItem = new LinkedHashMap<>();
        stockIdsByItem.forEach((menuItemId, stockIds) -> {
            Set<Allergen> found = EnumSet.noneOf(Allergen.class);
            for (Long stockId : stockIds) {
                found.addAll(perStockItem.computeIfAbsent(stockId, id -> {
                    Set<Allergen> single = EnumSet.noneOf(Allergen.class);
                    collectAllergens(List.of(id), single, new HashSet<>(), 0);
                    return single;
                }));
            }
            if (!found.isEmpty()) {
                result.put(menuItemId, found);
            }
        });
        return result;
    }

    private void collectAllergens(List<Long> stockItemIds, Set<Allergen> into,
                                  Set<Long> visited, int depth) {
        if (stockItemIds.isEmpty() || depth > MAX_PREP_DEPTH) {
            return;
        }
        for (StockItem item : stockItemRepository.findAllById(stockItemIds)) {
            if (!visited.add(item.getId())) {
                continue;
            }
            into.addAll(item.allergenSet());
            if (item.getKind() == StockKind.PREP) {
                List<Long> inputs = recipeLineRepository.findByPrepItemId(item.getId()).stream()
                        .map(RecipeLine::getStockItemId)
                        .toList();
                collectAllergens(inputs, into, visited, depth + 1);
            }
        }
    }

    // ============================================================ recipe editing

    @Transactional(readOnly = true)
    public List<RecipeLine> linesForMenuItem(Long menuItemId) {
        return recipeLineRepository.findByMenuItemId(menuItemId);
    }

    @Transactional(readOnly = true)
    public List<RecipeLine> linesForOptions(List<Long> optionIds) {
        return optionIds.isEmpty() ? List.of() : recipeLineRepository.findByMenuItemOptionIdIn(optionIds);
    }

    @Transactional(readOnly = true)
    public List<RecipeLine> linesForPrep(Long prepItemId) {
        return recipeLineRepository.findByPrepItemId(prepItemId);
    }

    /** Replaces an item's whole recipe. Whole-list replacement keeps the editor UI trivial. */
    @Transactional
    public void replaceMenuItemRecipe(Long menuItemId, List<Draw> lines, List<OrderTypeScope> scopes) {
        MenuItem item = menuItemRepository.findById(menuItemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Menu item", menuItemId));
        accessGuard.requireRestaurantAccess(item.getRestaurantId());
        recipeLineRepository.deleteByMenuItemId(menuItemId);
        writeLines(item.getRestaurantId(), lines, scopes, line -> line.setMenuItemId(menuItemId));
    }

    /** Replaces one modifier's stock deltas. */
    @Transactional
    public void replaceOptionRecipe(Long restaurantId, Long optionId, List<Draw> lines,
                                    List<OrderTypeScope> scopes) {
        accessGuard.requireRestaurantAccess(restaurantId);
        recipeLineRepository.deleteByMenuItemOptionId(optionId);
        writeLines(restaurantId, lines, scopes, line -> line.setMenuItemOptionId(optionId));
    }

    /** Replaces a prep item's own recipe — what one batch is made from. */
    @Transactional
    public void replacePrepRecipe(Long prepItemId, List<Draw> lines) {
        StockItem prep = stockItemRepository.findById(prepItemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Stock item", prepItemId));
        accessGuard.requireRestaurantAccess(prep.getRestaurantId());
        if (prep.getKind() != StockKind.PREP) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Only in-house prep items have their own recipe.");
        }
        recipeLineRepository.deleteByPrepItemId(prepItemId);
        writeLines(prep.getRestaurantId(), lines, null, line -> line.setPrepItemId(prepItemId));
    }

    private void writeLines(Long restaurantId, List<Draw> lines, List<OrderTypeScope> scopes,
                            java.util.function.Consumer<RecipeLine> assignOwner) {
        if (lines == null || lines.isEmpty()) {
            return;
        }
        Map<Long, StockItem> items = byId(lines.stream().map(Draw::stockItemId).toList());
        List<RecipeLine> saved = new ArrayList<>(lines.size());
        for (int i = 0; i < lines.size(); i++) {
            Draw draw = lines.get(i);
            StockItem stockItem = items.get(draw.stockItemId());
            if (stockItem == null || !stockItem.getRestaurantId().equals(restaurantId)) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Unknown stock item: " + draw.stockItemId());
            }
            if (draw.quantityBase() == null || draw.quantityBase().signum() == 0) {
                continue; // a zero line is a deletion, not an error
            }
            RecipeLine line = new RecipeLine();
            line.setRestaurantId(restaurantId);
            line.setStockItemId(draw.stockItemId());
            line.setQuantityBase(draw.quantityBase());
            if (scopes != null && i < scopes.size() && scopes.get(i) != null) {
                line.setOrderTypeScope(scopes.get(i));
            }
            assignOwner.accept(line);
            saved.add(line);
        }
        recipeLineRepository.saveAll(saved);
    }

    // ============================================================ packaging rules

    @Transactional(readOnly = true)
    public List<PackagingRule> listPackagingRules(Long restaurantId) {
        return packagingRuleRepository.findByRestaurantIdOrderByDisplayOrderAscIdAsc(restaurantId);
    }

    @Transactional
    public PackagingRule savePackagingRule(Long restaurantId, Long ruleId, String nameEn, String nameAr,
                                           int displayOrder, List<Draw> lines) {
        accessGuard.requireRestaurantAccess(restaurantId);
        PackagingRule rule;
        if (ruleId == null) {
            rule = new PackagingRule();
            rule.setRestaurantId(restaurantId);
        } else {
            rule = packagingRuleRepository.findById(ruleId)
                    .orElseThrow(() -> ResourceNotFoundException.of("Packaging rule", ruleId));
            accessGuard.requireRestaurantAccess(rule.getRestaurantId());
            rule.getLines().clear();
        }
        rule.setNameEn(nameEn);
        rule.setNameAr(nameAr);
        rule.setDisplayOrder(displayOrder);
        Map<Long, StockItem> items = byId(lines.stream().map(Draw::stockItemId).toList());
        for (Draw draw : lines) {
            StockItem stockItem = items.get(draw.stockItemId());
            if (stockItem == null || !stockItem.getRestaurantId().equals(restaurantId)) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Unknown packaging item: " + draw.stockItemId());
            }
            PackagingRuleLine line = new PackagingRuleLine();
            line.setStockItemId(draw.stockItemId());
            line.setQuantityBase(draw.quantityBase());
            rule.addLine(line);
        }
        return packagingRuleRepository.save(rule);
    }

    @Transactional
    public void deletePackagingRule(Long ruleId) {
        PackagingRule rule = packagingRuleRepository.findById(ruleId)
                .orElseThrow(() -> ResourceNotFoundException.of("Packaging rule", ruleId));
        accessGuard.requireRestaurantAccess(rule.getRestaurantId());
        packagingRuleRepository.delete(rule);
    }

    // ============================================================ helpers

    private Map<Long, StockItem> byId(List<Long> ids) {
        Map<Long, StockItem> map = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return map;
        }
        for (StockItem item : stockItemRepository.findAllById(ids)) {
            map.put(item.getId(), item);
        }
        return map;
    }

    /** Money-scaled view of a cost figure, for display next to a price. */
    public BigDecimal asMoney(BigDecimal cost) {
        return cost == null ? null : cost.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }
}
