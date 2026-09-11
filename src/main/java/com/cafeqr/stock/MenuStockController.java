package com.cafeqr.stock;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.stock.dto.MenuStockDtos.OptionLineResponse;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeLineResponse;
import com.cafeqr.stock.dto.MenuStockDtos.RecipeRequest;
import com.cafeqr.stock.dto.MenuStockDtos.RuleRequest;
import com.cafeqr.stock.dto.MenuStockDtos.RuleResponse;
import com.cafeqr.stock.dto.MenuStockDtos.UsageRow;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * How the menu meets the shelf. Rules and recipes are menu editing and need MENU; the usage
 * figures are read on the stock page and need STOCK. An owner holds both.
 */
@RestController
@Tag(name = "Stock")
public class MenuStockController {

    private final MenuStockService menuStockService;
    private final StockUsageService stockUsageService;

    public MenuStockController(MenuStockService menuStockService, StockUsageService stockUsageService) {
        this.menuStockService = menuStockService;
        this.stockUsageService = stockUsageService;
    }

    @Operation(summary = "Every menu item's rule at a branch: what backs it, how many a day")
    @PreAuthorize("hasAuthority('MENU')")
    @GetMapping("/api/branches/{branchId}/menu-stock")
    public ApiResponse<List<RuleResponse>> rules(@PathVariable Long branchId) {
        return ApiResponse.ok(menuStockService.rules(branchId));
    }

    @Operation(summary = "Set a menu item's rule at a branch — both fields empty removes it")
    @PreAuthorize("hasAuthority('MENU')")
    @PutMapping("/api/branches/{branchId}/menu-stock/{menuItemId}")
    public ApiResponse<RuleResponse> setRule(@PathVariable Long branchId, @PathVariable Long menuItemId,
                                             @Valid @RequestBody RuleRequest request) {
        return ApiResponse.ok("Saved", menuStockService.setRule(branchId, menuItemId, request));
    }

    @Operation(summary = "Every recipe line at a branch")
    @PreAuthorize("hasAuthority('MENU')")
    @GetMapping("/api/branches/{branchId}/recipes")
    public ApiResponse<List<RecipeLineResponse>> recipes(@PathVariable Long branchId) {
        return ApiResponse.ok(menuStockService.recipes(branchId));
    }

    @Operation(summary = "Every option rule at a branch — what a customer's choice changes")
    @PreAuthorize("hasAuthority('MENU')")
    @GetMapping("/api/branches/{branchId}/recipes/options")
    public ApiResponse<List<OptionLineResponse>> optionRecipes(@PathVariable Long branchId) {
        return ApiResponse.ok(menuStockService.optionRecipes(branchId));
    }

    @Operation(summary = "Replace a menu item's recipe at a branch, options included — an empty list clears it")
    @PreAuthorize("hasAuthority('MENU')")
    @PutMapping("/api/branches/{branchId}/recipes/{menuItemId}")
    public ApiResponse<List<RecipeLineResponse>> setRecipe(@PathVariable Long branchId, @PathVariable Long menuItemId,
                                                           @Valid @RequestBody RecipeRequest request) {
        return ApiResponse.ok("Recipe saved", menuStockService.setRecipe(branchId, menuItemId, request));
    }

    @Operation(summary = "What each shelf item is being used at, and how many days that leaves")
    @PreAuthorize("hasAuthority('STOCK')")
    @GetMapping("/api/branches/{branchId}/stock/usage")
    public ApiResponse<List<UsageRow>> usage(@PathVariable Long branchId,
                                             @RequestParam(defaultValue = "7") int days) {
        return ApiResponse.ok(stockUsageService.usage(branchId, days));
    }
}
