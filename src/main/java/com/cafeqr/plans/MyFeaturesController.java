package com.cafeqr.plans;

import com.cafeqr.analytics.Entitlements;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.plans.domain.Feature;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * What the signed-in café's plan includes.
 *
 * <p>The dashboard has to know this to stop offering what it will only be refused — it used to
 * work it out itself with {@code isProPlan(restaurant.plan)}, a copy of the server's rule living
 * in the browser. With the tiers now editable, that copy would be wrong the moment the grid
 * changed, so the server answers instead and there is one rule again.
 */
@RestController
@Tag(name = "Plan features")
public class MyFeaturesController {

    private final Entitlements entitlements;

    public MyFeaturesController(Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    @Operation(summary = "The features the caller's plan includes")
    @GetMapping("/api/dashboard/features")
    public ApiResponse<List<Feature>> mine() {
        // included() rather than filtering has() — the same café row six times for one answer.
        return ApiResponse.ok(List.copyOf(entitlements.included()));
    }
}
