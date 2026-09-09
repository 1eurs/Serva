package com.cafeqr.restaurants;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.common.api.PageResponse;
import com.cafeqr.restaurants.dto.CreateRestaurantRequest;
import com.cafeqr.restaurants.dto.RestaurantResponse;
import com.cafeqr.restaurants.dto.UpdateRestaurantRequest;
import com.cafeqr.common.util.Names;
import com.cafeqr.restaurants.domain.Plan;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/restaurants")
@Tag(name = "Restaurants (admin)")
@PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
public class RestaurantAdminController {

    private final RestaurantService restaurantService;
    private final RestaurantOnboardingService onboardingService;
    private final AuditService audit;

    public RestaurantAdminController(RestaurantService restaurantService,
                                    RestaurantOnboardingService onboardingService,
                                    AuditService audit) {
        this.restaurantService = restaurantService;
        this.onboardingService = onboardingService;
        this.audit = audit;
    }

    @Operation(summary = "Onboard a restaurant (restaurant + optional owner + first branch + subscription)")
    @PostMapping
    public ApiResponse<RestaurantResponse> create(@Valid @RequestBody CreateRestaurantRequest request) {
        RestaurantResponse created = onboardingService.onboard(request);
        audit.recordCafe(AuditAction.CAFE_CREATED, created.id(), label(created),
                "Tier " + created.plan() + (request.owner() != null
                        ? ", owner " + request.owner().email() : ", no owner account yet"));
        return ApiResponse.ok("Restaurant created", created);
    }

    @Operation(summary = "Renew a café's subscription for another term")
    @PostMapping("/{id}/renew")
    public ApiResponse<RestaurantResponse> renew(@PathVariable Long id) {
        RestaurantResponse renewed = onboardingService.renew(id);
        audit.recordCafe(AuditAction.CAFE_RENEWED, id, label(renewed), "Term extended");
        return ApiResponse.ok("Subscription renewed", renewed);
    }

    @Operation(summary = "List restaurants")
    @GetMapping
    public ApiResponse<PageResponse<RestaurantResponse>> list(
            @RequestParam(required = false) Boolean active,
            Pageable pageable) {
        return ApiResponse.ok(PageResponse.from(restaurantService.list(active, pageable)));
    }

    @Operation(summary = "Get a restaurant by id")
    @GetMapping("/{id}")
    public ApiResponse<RestaurantResponse> get(@PathVariable Long id) {
        return ApiResponse.ok(restaurantService.get(id));
    }

    @Operation(summary = "Update a restaurant")
    @PatchMapping("/{id}")
    public ApiResponse<RestaurantResponse> update(@PathVariable Long id,
                                                  @Valid @RequestBody UpdateRestaurantRequest request) {
        return ApiResponse.ok("Restaurant updated", restaurantService.update(id, request));
    }

    @Operation(summary = "Activate a restaurant")
    @PatchMapping("/{id}/activate")
    public ApiResponse<RestaurantResponse> activate(@PathVariable Long id) {
        RestaurantResponse updated = restaurantService.setActive(id, true);
        audit.recordCafe(AuditAction.CAFE_ACTIVATED, id, label(updated), null);
        return ApiResponse.ok("Restaurant activated", updated);
    }

    @Operation(summary = "Deactivate a restaurant")
    @PatchMapping("/{id}/deactivate")
    public ApiResponse<RestaurantResponse> deactivate(@PathVariable Long id) {
        RestaurantResponse updated = restaurantService.setActive(id, false);
        audit.recordCafe(AuditAction.CAFE_DEACTIVATED, id, label(updated),
                "Café taken offline — its QR menus stop serving");
        return ApiResponse.ok("Restaurant deactivated", updated);
    }

    // A café's tier is no longer settable here.
    //
    // This endpoint moved the gate (restaurants.plan) without moving the bill
    // (subscriptions), and nothing reconciled the two — which is how a café ended up gated
    // PRO while its subscription said "Standard" and it paid the Standard price. The tier is
    // now bought, not assigned: PATCH /api/admin/subscriptions/{id} with a tier changes what
    // the café can open and what it is charged in one transaction, and audits it there.

    /** The café's English name where it has one — the audit log is read in one language. */
    private static String label(RestaurantResponse r) {
        return Names.preferring(r.nameEn(), r.nameAr(), r.name(), false);
    }
}
