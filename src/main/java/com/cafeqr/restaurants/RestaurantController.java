package com.cafeqr.restaurants;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.restaurants.dto.RestaurantResponse;
import com.cafeqr.restaurants.dto.UpdateRestaurantRequest;
import com.cafeqr.restaurants.dto.UpdateRestaurantMenuInfoRequest;
import com.cafeqr.restaurants.dto.UpdateRestaurantReceiptRequest;
import com.cafeqr.restaurants.dto.UpdateRestaurantThemeRequest;
import com.cafeqr.subscriptions.SubscriptionService;
import com.cafeqr.subscriptions.dto.SubscriptionResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Restaurants")
public class RestaurantController {

    private final RestaurantService restaurantService;
    private final SubscriptionService subscriptionService;
    private final AccessGuard accessGuard;

    public RestaurantController(RestaurantService restaurantService,
                                SubscriptionService subscriptionService,
                                AccessGuard accessGuard) {
        this.restaurantService = restaurantService;
        this.subscriptionService = subscriptionService;
        this.accessGuard = accessGuard;
    }

    @Operation(summary = "Get a restaurant visible to the current user")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/api/restaurants/{restaurantId}")
    public ApiResponse<RestaurantResponse> get(@PathVariable Long restaurantId) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return ApiResponse.ok(restaurantService.get(restaurantId));
    }

    @Operation(summary = "Get the current restaurant's subscription (owner-visible)")
    @PreAuthorize("hasAuthority('PROFILE')")
    @GetMapping("/api/restaurants/{restaurantId}/subscription")
    public ApiResponse<SubscriptionResponse> subscription(@PathVariable Long restaurantId) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return ApiResponse.ok(subscriptionService.getForRestaurant(restaurantId));
    }

    @Operation(summary = "Update a restaurant visible to the current user")
    @PreAuthorize("hasAuthority('PROFILE')")
    @PatchMapping("/api/restaurants/{restaurantId}")
    public ApiResponse<RestaurantResponse> update(@PathVariable Long restaurantId,
                                                  @Valid @RequestBody UpdateRestaurantRequest request) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return ApiResponse.ok("Restaurant updated", restaurantService.update(restaurantId, request));
    }

    @Operation(summary = "Update the public menu theme")
    // MENU owns "menu items + look / theme" — the Look editor is a MENU screen; PROFILE
    // (restaurant settings) keeps it too so neither gets locked out of branding.
    @PreAuthorize("hasAnyAuthority('MENU','PROFILE')")
    @PatchMapping("/api/restaurants/{restaurantId}/theme")
    public ApiResponse<RestaurantResponse> updateTheme(@PathVariable Long restaurantId,
                                                       @Valid @RequestBody UpdateRestaurantThemeRequest request) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return ApiResponse.ok("Menu theme updated", restaurantService.updateTheme(restaurantId, request.theme(), request.themeCustomJson()));
    }

    @Operation(summary = "Update the menu's house card (info shown above the categories)")
    // Same owners as the theme: the card is edited from the menu/profile screens, and it is
    // the café's own words about itself, so PROFILE must not be locked out of it either.
    @PreAuthorize("hasAnyAuthority('MENU','PROFILE')")
    @PatchMapping("/api/restaurants/{restaurantId}/menu-info")
    public ApiResponse<RestaurantResponse> updateMenuInfo(@PathVariable Long restaurantId,
                                                          @Valid @RequestBody UpdateRestaurantMenuInfoRequest request) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return ApiResponse.ok("Menu info updated",
                restaurantService.updateMenuInfo(restaurantId, request.menuInfoJson()));
    }

    @Operation(summary = "Update the printed receipt customization")
    @PreAuthorize("hasAuthority('PROFILE')")
    @PatchMapping("/api/restaurants/{restaurantId}/receipt")
    public ApiResponse<RestaurantResponse> updateReceipt(@PathVariable Long restaurantId,
                                                         @Valid @RequestBody UpdateRestaurantReceiptRequest request) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return ApiResponse.ok("Receipt settings updated",
                restaurantService.updateReceiptSettings(restaurantId, request.receiptSettingsJson()));
    }
}
