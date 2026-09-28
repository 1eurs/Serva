package com.cafeqr.menus;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.menus.dto.MenuSuggestionRequest;
import com.cafeqr.menus.dto.PublicMenuResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/public")
@Tag(name = "Public menu")
public class PublicMenuController {

    /**
     * Keep the edge cache brief so a branch's pause/resume status reaches customers quickly.
     * The order endpoint remains the authoritative enforcement point during that short window.
     */
    private static final String MENU_CACHE_CONTROL = "public, max-age=10, must-revalidate";

    private final PublicMenuService publicMenuService;

    public PublicMenuController(PublicMenuService publicMenuService) {
        this.publicMenuService = publicMenuService;
    }

    @Operation(summary = "Get the restaurant-wide public menu", security = {})
    @GetMapping("/restaurants/{slug}/menu")
    public ApiResponse<PublicMenuResponse> restaurantMenu(@PathVariable String slug, HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, MENU_CACHE_CONTROL);
        return ApiResponse.ok(publicMenuService.byRestaurantSlug(slug));
    }

    @Operation(summary = "Get a branch's public menu", security = {})
    @GetMapping("/restaurants/{slug}/branches/{branchId}/menu")
    public ApiResponse<PublicMenuResponse> branchMenu(@PathVariable String slug, @PathVariable Long branchId,
                                                      HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, MENU_CACHE_CONTROL);
        return ApiResponse.ok(publicMenuService.byBranch(slug, branchId));
    }

    @Operation(summary = "Get a menu by scanning a table QR token", security = {})
    @GetMapping("/qr/{tableToken}/menu")
    public ApiResponse<PublicMenuResponse> qrMenu(@PathVariable String tableToken, HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, MENU_CACHE_CONTROL);
        return ApiResponse.ok(publicMenuService.byTableToken(tableToken));
    }

    @Operation(summary = "Items commonly ordered with what's in the cart", security = {})
    @PostMapping("/restaurants/{slug}/menu/suggestions")
    public ApiResponse<List<Long>> suggestions(@PathVariable String slug,
                                               @Valid @RequestBody MenuSuggestionRequest request) {
        return ApiResponse.ok(publicMenuService.suggestionsForCart(slug, request.itemIds()));
    }
}
