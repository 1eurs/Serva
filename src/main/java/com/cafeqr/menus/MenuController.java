package com.cafeqr.menus;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.menus.dto.CategoryResponse;
import com.cafeqr.menus.dto.CreateCategoryRequest;
import com.cafeqr.menus.dto.CreateMenuItemRequest;
import com.cafeqr.menus.dto.MenuItemResponse;
import com.cafeqr.menus.dto.UpdateAvailabilityRequest;
import com.cafeqr.menus.dto.UpdateCategoryRequest;
import com.cafeqr.menus.dto.UpdateMenuItemRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/menu")
@Tag(name = "Menu management")
@PreAuthorize("hasAuthority('MENU')")
public class MenuController {

    private final MenuService menuService;

    public MenuController(MenuService menuService) {
        this.menuService = menuService;
    }

    // categories

    @Operation(summary = "Create a menu category")
    @PostMapping("/categories")
    public ApiResponse<CategoryResponse> createCategory(@Valid @RequestBody CreateCategoryRequest request) {
        return ApiResponse.ok("Category created", menuService.createCategory(request));
    }

    @Operation(summary = "List menu categories")
    @GetMapping("/categories")
    public ApiResponse<List<CategoryResponse>> listCategories(
            @RequestParam(required = false) Long restaurantId,
            @RequestParam(required = false) Long branchId) {
        return ApiResponse.ok(menuService.listCategories(restaurantId, branchId));
    }

    @Operation(summary = "Update a menu category")
    @PatchMapping("/categories/{id}")
    public ApiResponse<CategoryResponse> updateCategory(@PathVariable Long id,
                                                        @Valid @RequestBody UpdateCategoryRequest request) {
        return ApiResponse.ok("Category updated", menuService.updateCategory(id, request));
    }

    @Operation(summary = "Delete a menu category")
    @DeleteMapping("/categories/{id}")
    public ApiResponse<Void> deleteCategory(@PathVariable Long id) {
        menuService.deleteCategory(id);
        return ApiResponse.message("Category deleted");
    }

    // items

    @Operation(summary = "Create a menu item")
    @PostMapping("/items")
    public ApiResponse<MenuItemResponse> createItem(@Valid @RequestBody CreateMenuItemRequest request) {
        return ApiResponse.ok("Menu item created", menuService.createItem(request));
    }

    @Operation(summary = "List menu items")
    // PROFILE too: the loyalty setup screen (a PROFILE page) lists items to pick the reward.
    @PreAuthorize("hasAnyAuthority('MENU','PROFILE')")
    @GetMapping("/items")
    public ApiResponse<List<MenuItemResponse>> listItems(
            @RequestParam(required = false) Long restaurantId,
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) Long categoryId) {
        return ApiResponse.ok(menuService.listItems(restaurantId, branchId, categoryId));
    }

    @Operation(summary = "Get a menu item")
    @GetMapping("/items/{id}")
    public ApiResponse<MenuItemResponse> getItem(@PathVariable Long id) {
        return ApiResponse.ok(menuService.getItem(id));
    }

    @Operation(summary = "Update a menu item")
    @PatchMapping("/items/{id}")
    public ApiResponse<MenuItemResponse> updateItem(@PathVariable Long id,
                                                    @Valid @RequestBody UpdateMenuItemRequest request) {
        return ApiResponse.ok("Menu item updated", menuService.updateItem(id, request));
    }

    @Operation(summary = "Toggle a menu item's availability")
    @PatchMapping("/items/{id}/availability")
    public ApiResponse<MenuItemResponse> updateAvailability(@PathVariable Long id,
                                                            @Valid @RequestBody UpdateAvailabilityRequest request) {
        return ApiResponse.ok("Availability updated", menuService.updateAvailability(id, request.available()));
    }

    @Operation(summary = "Delete a menu item")
    @DeleteMapping("/items/{id}")
    public ApiResponse<Void> deleteItem(@PathVariable Long id) {
        menuService.deleteItem(id);
        return ApiResponse.message("Menu item deleted");
    }
}
