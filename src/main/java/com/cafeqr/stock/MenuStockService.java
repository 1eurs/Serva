package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.OptionRecipeLine;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.dto.MenuStockDtos.OptionLineInput;
import com.cafeqr.stock.dto.MenuStockDtos.OptionLineResponse;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeLineInput;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeLineResponse;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeRequest;
import com.cafeqr.stock.dto.MenuStockDtos.RuleRequest;
import com.cafeqr.stock.dto.MenuStockDtos.RuleResponse;
import com.cafeqr.stock.repository.MenuItemStockRepository;
import com.cafeqr.stock.repository.OptionRecipeLineRepository;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.RoundingMode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What an owner says about how a menu item meets the shelf: the recipe (what it takes) and the
 * cap (how many a day). Both are per branch, because the tins a recipe names are.
 *
 * <p>Nothing here moves stock. Both are read by {@link StockDrawService} when an order is
 * accepted, and recipes again by {@link StockUsageService} when someone asks how long the milk
 * will last. This class only keeps the owner's answers consistent — a tin from another branch, a
 * recipe in litres against a shelf in grams, the same ingredient twice — and refuses the rest.
 */
@Service
public class MenuStockService {

    private final MenuItemStockRepository rules;
    private final RecipeLineRepository recipes;
    private final OptionRecipeLineRepository optionRecipes;
    private final StockItemRepository stockItems;
    private final MenuItemRepository menuItems;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public MenuStockService(MenuItemStockRepository rules,
                            RecipeLineRepository recipes,
                            OptionRecipeLineRepository optionRecipes,
                            StockItemRepository stockItems,
                            MenuItemRepository menuItems,
                            BranchService branchService,
                            AccessGuard accessGuard) {
        this.rules = rules;
        this.recipes = recipes;
        this.optionRecipes = optionRecipes;
        this.stockItems = stockItems;
        this.menuItems = menuItems;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    // ---- rules ----

    @Transactional(readOnly = true)
    public List<RuleResponse> rules(Long branchId) {
        requireBranch(branchId);
        return rules.findByBranchId(branchId).stream().map(RuleResponse::from).toList();
    }

    /**
     * Replace the cap outright. No cap deletes the rule rather than keeping an empty one: an item
     * with no rule and an item with an empty rule must be indistinguishable.
     */
    @Transactional
    public RuleResponse setRule(Long branchId, Long menuItemId, RuleRequest request) {
        Branch branch = requireBranch(branchId);
        requireMenuItemAt(branch, menuItemId);

        MenuItemStock rule = rules.findByMenuItemIdAndBranchId(menuItemId, branchId).orElse(null);
        if (request.dailyLimit() == null) {
            if (rule != null) rules.delete(rule);
            return RuleResponse.none(menuItemId, branchId);
        }
        if (rule == null) {
            rule = new MenuItemStock();
            rule.setMenuItemId(menuItemId);
            rule.setBranchId(branchId);
        }
        rule.setDailyLimit(request.dailyLimit());
        return RuleResponse.from(rules.save(rule));
    }

    // ---- recipes ----

    @Transactional(readOnly = true)
    public List<RecipeLineResponse> recipes(Long branchId) {
        requireBranch(branchId);
        return recipes.findByBranchId(branchId).stream().map(RecipeLineResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<OptionLineResponse> optionRecipes(Long branchId) {
        requireBranch(branchId);
        return optionRecipes.findByBranchId(branchId).stream().map(OptionLineResponse::from).toList();
    }

    /**
     * Replace the recipe outright. Each line names a tin at this branch, in a unit that tin can
     * read — its own, its ×1000 sibling, or the unit of what one piece holds: "18 g" against a
     * shelf in kilos, "200 ml" against bottles that say they are 1 L. "18 g" against a shelf in
     * litres is a mistake and is refused before it can produce a usage figure that means nothing.
     */
    @Transactional
    public List<RecipeLineResponse> setRecipe(Long branchId, Long menuItemId, RecipeRequest request) {
        Branch branch = requireBranch(branchId);
        MenuItem item = requireMenuItemAt(branch, menuItemId);

        Set<Long> seen = new HashSet<>();
        Map<Long, StockUnit> baseUnitByTin = new HashMap<>();
        List<RecipeLine> lines = request.lines().stream().map(in -> {
            if (!seen.add(in.stockItemId())) {
                throw new BadRequestException("The same ingredient is listed twice");
            }
            StockItem stock = requireStockItemAt(branch, in.stockItemId());
            if (stock.factorFrom(in.unit()) == null) {
                throw new BadRequestException("\"" + displayName(stock) + "\" is counted in "
                        + stock.getUnit() + (stock.getPackUnit() != null
                                ? " of " + stock.getPackSize().stripTrailingZeros().toPlainString() + " " + stock.getPackUnit()
                                : "")
                        + ", so a recipe cannot ask for it in " + in.unit());
            }
            RecipeLine line = new RecipeLine();
            line.setMenuItemId(menuItemId);
            line.setBranchId(branchId);
            line.setStockItemId(stock.getId());
            line.setQuantity(in.quantity().setScale(3, RoundingMode.HALF_UP));
            line.setUnit(in.unit());
            baseUnitByTin.put(stock.getId(), in.unit());
            return line;
        }).toList();

        List<OptionRecipeLine> optionLines = request.optionsOrEmpty().stream().map(in -> {
            requireChoiceExists(item, in.groupName(), in.optionName());
            StockItem stock = requireStockItemAt(branch, in.stockItemId());
            OptionRecipeLine o = new OptionRecipeLine();
            o.setMenuItemId(menuItemId);
            o.setBranchId(branchId);
            o.setGroupName(in.groupName().trim());
            o.setOptionName(in.optionName().trim());
            o.setStockItemId(stock.getId());
            if (in.replacesStockItemId() != null) {
                // Standing in for a base ingredient: it must be one, and the new tin must read the
                // base line's unit — almond milk in cartons can take 200 ml; almond flour cannot.
                StockUnit baseUnit = baseUnitByTin.get(in.replacesStockItemId());
                if (baseUnit == null) {
                    throw new BadRequestException("\"" + in.optionName() + "\" replaces something the recipe does not use");
                }
                if (stock.factorFrom(baseUnit) == null) {
                    throw new BadRequestException("\"" + displayName(stock) + "\" is counted in " + stock.getUnit()
                            + ", so it cannot stand in for something measured in " + baseUnit);
                }
                o.setReplacesStockItemId(in.replacesStockItemId());
            } else {
                if (in.quantity() == null || in.unit() == null) {
                    throw new BadRequestException("\"" + in.optionName() + "\" adds something, so say how much");
                }
                if (stock.factorFrom(in.unit()) == null) {
                    throw new BadRequestException("\"" + displayName(stock) + "\" is counted in "
                            + stock.getUnit() + ", so a recipe cannot ask for it in " + in.unit());
                }
                o.setQuantity(in.quantity().setScale(3, RoundingMode.HALF_UP));
                o.setUnit(in.unit());
            }
            return o;
        }).toList();

        recipes.deleteByMenuItemIdAndBranchId(menuItemId, branchId);
        optionRecipes.deleteByMenuItemIdAndBranchId(menuItemId, branchId);
        recipes.flush();
        optionRecipes.flush();
        optionRecipes.saveAll(optionLines);
        return recipes.saveAll(lines).stream().map(RecipeLineResponse::from).toList();
    }

    /** A rule for a choice the item does not offer is a typo, and would silently do nothing. */
    private static void requireChoiceExists(MenuItem item, String groupName, String optionName) {
        for (MenuItemOptionGroup g : item.getOptionGroups()) {
            if (!g.getNameEn().equals(groupName.trim())) continue;
            for (MenuItemOption o : g.getOptions()) {
                if (o.getNameEn().equals(optionName.trim())) return;
            }
        }
        throw new BadRequestException("This item has no option \"" + optionName + "\" in \"" + groupName + "\"");
    }

    // ---- helpers ----

    private Branch requireBranch(Long branchId) {
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        return branch;
    }

    /** The menu item exists, belongs to this café, and is sold at this branch. */
    private MenuItem requireMenuItemAt(Branch branch, Long menuItemId) {
        MenuItem item = menuItems.findById(menuItemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Menu item", menuItemId));
        if (!item.getRestaurantId().equals(branch.getRestaurantId())
                || (item.getBranchId() != null && !item.getBranchId().equals(branch.getId()))) {
            throw new BadRequestException("That menu item is not sold at this branch");
        }
        return item;
    }

    /** The tin exists and is on this branch's shelf — a rule must never point across the road. */
    private StockItem requireStockItemAt(Branch branch, Long stockItemId) {
        StockItem stock = stockItems.findById(stockItemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Stock item", stockItemId));
        if (!stock.getBranchId().equals(branch.getId())) {
            throw new BadRequestException("That shelf item belongs to another branch");
        }
        return stock;
    }

    private static String displayName(StockItem s) {
        return s.getNameEn() != null ? s.getNameEn() : s.getNameAr();
    }
}
