package com.cafeqr.subscriptions;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.subscriptions.dto.BillingOverviewResponse;
import com.cafeqr.subscriptions.dto.CreateSubscriptionRequest;
import com.cafeqr.subscriptions.dto.RecordPaymentRequest;
import com.cafeqr.subscriptions.dto.SubscriptionPaymentResponse;
import com.cafeqr.subscriptions.dto.SubscriptionResponse;
import com.cafeqr.subscriptions.dto.UpdateSubscriptionRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Subscriptions (admin)")
@PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    public SubscriptionController(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @Operation(summary = "Create a subscription for a restaurant")
    @PostMapping("/api/admin/restaurants/{restaurantId}/subscription")
    public ApiResponse<SubscriptionResponse> create(@PathVariable Long restaurantId,
                                                    @Valid @RequestBody CreateSubscriptionRequest request) {
        return ApiResponse.ok("Subscription created", subscriptionService.create(restaurantId, request));
    }

    @Operation(summary = "Get a restaurant's current subscription")
    @GetMapping("/api/admin/restaurants/{restaurantId}/subscription")
    public ApiResponse<SubscriptionResponse> get(@PathVariable Long restaurantId) {
        return ApiResponse.ok(subscriptionService.getForRestaurant(restaurantId));
    }

    @Operation(summary = "The platform billing board — totals, queue counts and every café's line")
    @GetMapping("/api/admin/billing")
    public ApiResponse<BillingOverviewResponse> billing() {
        return ApiResponse.ok(subscriptionService.billingOverview());
    }

    @Operation(summary = "Record money received against a subscription (and roll the term forward)")
    @PostMapping("/api/admin/subscriptions/{id}/payments")
    public ApiResponse<SubscriptionPaymentResponse> recordPayment(@PathVariable Long id,
                                                                  @Valid @RequestBody RecordPaymentRequest request) {
        return ApiResponse.ok("Payment recorded", subscriptionService.recordPayment(id, request));
    }

    @Operation(summary = "A café's payment history")
    @GetMapping("/api/admin/restaurants/{restaurantId}/payments")
    public ApiResponse<List<SubscriptionPaymentResponse>> payments(@PathVariable Long restaurantId) {
        return ApiResponse.ok(subscriptionService.paymentsForRestaurant(restaurantId));
    }

    @Operation(summary = "Update a subscription")
    @PatchMapping("/api/admin/subscriptions/{id}")
    public ApiResponse<SubscriptionResponse> update(@PathVariable Long id,
                                                    @Valid @RequestBody UpdateSubscriptionRequest request) {
        return ApiResponse.ok("Subscription updated", subscriptionService.update(id, request));
    }
}
