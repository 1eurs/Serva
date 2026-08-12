package com.cafeqr.stock;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.stock.domain.Allergen;
import com.cafeqr.stock.domain.BaseUnit;
import com.cafeqr.stock.domain.OrderTypeScope;
import com.cafeqr.stock.domain.PackagingRule;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockKind;
import com.cafeqr.stock.domain.StockMode;
import com.cafeqr.stock.dto.RecipeDtos;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * A menu item's stock configuration: which rung of the ladder it is on, what it is made from,
 * and what that costs.
 *
 * <p>The whole configuration saves in one call. Half-configured items — RECIPE mode with no
 * lines, SIMPLE mode with no backing good — are the main way an inventory feature ends up
 * silently doing nothing, so the save either lands completely or not at all.
 */
@RestController
@RequestMapping("/api/dashboard/stock")
@PreAuthorize("hasAuthority('STOCK')")
@Tag(name = "Stock recipes")
public class RecipeController {

    private final RecipeService recipeService;
    private final StockService stockService;
    private final MenuItemRepository menuItemRepository;

    public RecipeController(RecipeService recipeService,
                            StockService stockService,
                            MenuItemRepository menuItemRepository) {
        this.recipeService = recipeService;
        this.stockService = stockService;
        this.menuItemRepository = menuItemRepository;
    }

    // ============================================================ menu item recipes

    @Operation(summary = "Read a menu item's stock setup, recipe and costing")
    @GetMapping("/menu-items/{menuItemId}/recipe")
    @Transactional(readOnly = true)
    public ApiResponse<RecipeDtos.Response> get(@PathVariable Long menuItemId) {
        MenuItem item = loadItem(menuItemId);
        return ApiResponse.ok(toResponse(item));
    }

    @Operation(summary = "Save a menu item's stock setup and recipe")
    @PutMapping("/menu-items/{menuItemId}/recipe")
    @Transactional
    public ApiResponse<RecipeDtos.Response> save(@PathVariable Long menuItemId,
                                                 @Valid @RequestBody RecipeDtos.SaveRequest request) {
        MenuItem item = loadItem(menuItemId);
        StockMode mode = StockController.parseEnum(StockMode.class, request.stockMode(), StockMode.NONE);
        item.setStockMode(mode);
        item.setPackagingRuleId(request.packagingRuleId());

        switch (mode) {
            case DAILY_LIMIT -> {
                if (request.dailyLimit() == null || request.dailyLimit() <= 0) {
                    throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                            "Set how many you can sell in a day.");
                }
                item.setDailyLimit(request.dailyLimit());
            }
            case SIMPLE -> {
                // One click should be enough: with no good chosen, create one named after the
                // item. Counting croissants must not require a trip to the ingredients screen.
                Long stockItemId = request.stockItemId() != null
                        ? request.stockItemId()
                        : findOrCreateGood(item).getId();
                item.setStockItemId(stockItemId);
                item.setDailyLimit(null);
            }
            case RECIPE -> {
                if (request.lines() == null || request.lines().isEmpty()) {
                    throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                            "Add at least one ingredient, or switch to counting instead.");
                }
                item.setDailyLimit(null);
            }
            case NONE -> {
                item.setDailyLimit(null);
                // Leave stockItemId alone: switching tracking off and back on shouldn't lose
                // the good the café already created and counted against.
            }
        }

        // Turning tracking off (or changing how it works) must clear an automatic 86 — otherwise
        // the item stays hidden with nothing left to bring it back.
        if (item.isAutoUnavailable()) {
            item.setAvailable(true);
            item.setAutoUnavailable(false);
        }
        menuItemRepository.save(item);

        recipeService.replaceMenuItemRecipe(menuItemId, toDraws(request.lines()), toScopes(request.lines()));
        if (request.optionRecipes() != null) {
            Set<Long> ownOptionIds = optionIds(item);
            for (RecipeDtos.OptionRecipe option : request.optionRecipes()) {
                if (!ownOptionIds.contains(option.optionId())) {
                    throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                            "Option " + option.optionId() + " doesn't belong to this item.");
                }
                recipeService.replaceOptionRecipe(item.getRestaurantId(), option.optionId(),
                        toDraws(option.lines()), toScopes(option.lines()));
                applyOptionPackaging(item, option);
            }
            menuItemRepository.save(item);
        }
        return ApiResponse.ok("Recipe saved", toResponse(loadItem(menuItemId)));
    }

    /**
     * A counted good named after the menu item. Reused if one already exists so toggling the
     * mode off and on doesn't leave a trail of duplicate "Croissant" items behind.
     */
    private StockItem findOrCreateGood(MenuItem item) {
        return stockService.listItems(false).stream()
                .filter(s -> s.getKind() == StockKind.GOOD && s.getNameEn().equalsIgnoreCase(item.getNameEn()))
                .findFirst()
                .orElseGet(() -> {
                    StockItem good = new StockItem();
                    good.setRestaurantId(item.getRestaurantId());
                    good.setNameEn(item.getNameEn());
                    good.setNameAr(item.getNameAr());
                    good.setKind(StockKind.GOOD);
                    good.setBaseUnit(BaseUnit.PIECE);
                    good.setPurchaseUnitSize(BigDecimal.ONE);
                    good.setPurchaseUnitLabel("piece");
                    return stockService.saveItem(good);
                });
    }

    private void applyOptionPackaging(MenuItem item, RecipeDtos.OptionRecipe request) {
        for (MenuItemOptionGroup group : item.getOptionGroups()) {
            for (MenuItemOption option : group.getOptions()) {
                if (option.getId().equals(request.optionId())) {
                    option.setPackagingRuleId(request.packagingRuleId());
                    return;
                }
            }
        }
    }

    private RecipeDtos.Response toResponse(MenuItem item) {
        List<RecipeDtos.Line> lines = recipeService.linesForMenuItem(item.getId()).stream()
                .map(RecipeController::toLine)
                .toList();

        List<Long> optionIds = new ArrayList<>(optionIds(item));
        Map<Long, List<RecipeLine>> byOption = recipeService.linesForOptions(optionIds).stream()
                .collect(Collectors.groupingBy(RecipeLine::getMenuItemOptionId));
        List<RecipeDtos.OptionRecipe> optionRecipes = new ArrayList<>();
        for (MenuItemOptionGroup group : item.getOptionGroups()) {
            for (MenuItemOption option : group.getOptions()) {
                List<RecipeLine> optionLines = byOption.getOrDefault(option.getId(), List.of());
                if (!optionLines.isEmpty() || option.getPackagingRuleId() != null) {
                    optionRecipes.add(new RecipeDtos.OptionRecipe(option.getId(),
                            optionLines.stream().map(RecipeController::toLine).toList(),
                            option.getPackagingRuleId()));
                }
            }
        }

        BigDecimal plateCost = recipeService.asMoney(recipeService.plateCost(item));
        BigDecimal packagingCost = recipeService.asMoney(recipeService.packagingCost(item));
        BigDecimal price = item.effectivePrice(Instant.now());
        BigDecimal margin = plateCost == null ? null : price.subtract(plateCost);
        List<String> allergens = recipeService.allergensFor(item).stream()
                .map(Allergen::name).sorted().toList();

        return new RecipeDtos.Response(item.getId(), item.getStockMode().name(), item.getStockItemId(),
                item.getDailyLimit(),
                item.remainingToday(java.time.LocalDate.now(com.cafeqr.common.util.TimeZones.CAFES)),
                item.getPackagingRuleId(), lines, optionRecipes,
                plateCost, packagingCost, price,
                recipeService.foodCostPercent(plateCost, price), margin, allergens);
    }

    // ============================================================ prep recipes

    @Operation(summary = "Read what one batch of an in-house prep item is made from")
    @GetMapping("/prep/{stockItemId}/recipe")
    public ApiResponse<List<RecipeDtos.Line>> prepRecipe(@PathVariable Long stockItemId) {
        stockService.getItem(stockItemId); // access check
        return ApiResponse.ok(recipeService.linesForPrep(stockItemId).stream()
                .map(RecipeController::toLine)
                .toList());
    }

    @Operation(summary = "Save what one batch of an in-house prep item is made from")
    @PutMapping("/prep/{stockItemId}/recipe")
    public ApiResponse<Void> savePrepRecipe(@PathVariable Long stockItemId,
                                            @RequestBody RecipeDtos.PrepRecipeRequest request) {
        recipeService.replacePrepRecipe(stockItemId, toDraws(request.lines()));
        return ApiResponse.message("Batch recipe saved");
    }

    // ============================================================ packaging rules

    @Operation(summary = "List the café's packaging bundles")
    @GetMapping("/packaging")
    public ApiResponse<List<RecipeDtos.PackagingRuleResponse>> packaging() {
        Long restaurantId = stockService.requireCafeScope();
        return ApiResponse.ok(recipeService.listPackagingRules(restaurantId).stream()
                .map(this::toPackagingResponse)
                .toList());
    }

    @Operation(summary = "Create a packaging bundle (cup + lid + sleeve)")
    @PostMapping("/packaging")
    public ApiResponse<RecipeDtos.PackagingRuleResponse> createPackaging(
            @Valid @RequestBody RecipeDtos.PackagingRuleRequest request) {
        Long restaurantId = stockService.requireCafeScope();
        PackagingRule rule = recipeService.savePackagingRule(restaurantId, null, request.nameEn(),
                request.nameAr(), request.displayOrder(), toDraws(request.lines()));
        return ApiResponse.ok("Packaging saved", toPackagingResponse(rule));
    }

    @Operation(summary = "Update a packaging bundle")
    @PutMapping("/packaging/{id}")
    public ApiResponse<RecipeDtos.PackagingRuleResponse> updatePackaging(
            @PathVariable Long id, @Valid @RequestBody RecipeDtos.PackagingRuleRequest request) {
        Long restaurantId = stockService.requireCafeScope();
        PackagingRule rule = recipeService.savePackagingRule(restaurantId, id, request.nameEn(),
                request.nameAr(), request.displayOrder(), toDraws(request.lines()));
        return ApiResponse.ok("Packaging saved", toPackagingResponse(rule));
    }

    @Operation(summary = "Delete a packaging bundle")
    @DeleteMapping("/packaging/{id}")
    public ApiResponse<Void> deletePackaging(@PathVariable Long id) {
        recipeService.deletePackagingRule(id);
        return ApiResponse.message("Packaging deleted");
    }

    private RecipeDtos.PackagingRuleResponse toPackagingResponse(PackagingRule rule) {
        List<RecipeDtos.Line> lines = rule.getLines().stream()
                .map(l -> new RecipeDtos.Line(l.getStockItemId(), l.getQuantityBase(), OrderTypeScope.ALL.name()))
                .toList();
        Map<Long, StockItem> items = stockService.itemsById(
                lines.stream().map(RecipeDtos.Line::stockItemId).toList());
        BigDecimal cost = BigDecimal.ZERO;
        for (RecipeDtos.Line line : lines) {
            StockItem item = items.get(line.stockItemId());
            if (item != null) {
                cost = cost.add(item.costOf(line.quantityBase()));
            }
        }
        return new RecipeDtos.PackagingRuleResponse(rule.getId(), rule.getNameEn(), rule.getNameAr(),
                rule.getDisplayOrder(), lines, recipeService.asMoney(cost));
    }

    // ============================================================ helpers

    private MenuItem loadItem(Long menuItemId) {
        MenuItem item = menuItemRepository.findById(menuItemId)
                .orElseThrow(() -> ResourceNotFoundException.of("Menu item", menuItemId));
        stockService.requireCafeScope();
        if (!item.getRestaurantId().equals(stockService.requireCafeScope())) {
            throw new BadRequestException(ErrorCode.FORBIDDEN, "That item belongs to another café.");
        }
        return item;
    }

    private static Set<Long> optionIds(MenuItem item) {
        return item.getOptionGroups().stream()
                .flatMap(g -> g.getOptions().stream())
                .map(MenuItemOption::getId)
                .collect(Collectors.toSet());
    }

    private static RecipeDtos.Line toLine(RecipeLine line) {
        return new RecipeDtos.Line(line.getStockItemId(), line.getQuantityBase(),
                line.getOrderTypeScope().name());
    }

    private static List<RecipeService.Draw> toDraws(List<RecipeDtos.Line> lines) {
        if (lines == null) {
            return List.of();
        }
        return lines.stream()
                .map(l -> new RecipeService.Draw(l.stockItemId(), l.quantityBase()))
                .toList();
    }

    private static List<OrderTypeScope> toScopes(List<RecipeDtos.Line> lines) {
        if (lines == null) {
            return List.of();
        }
        return lines.stream()
                .map(l -> StockController.parseEnum(OrderTypeScope.class, l.orderTypeScope(), OrderTypeScope.ALL))
                .toList();
    }
}
