package com.cafeqr.plans;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.plans.dto.PlanFeatureMatrix;
import com.cafeqr.plans.dto.PricingPlanResponse;
import com.cafeqr.plans.dto.SetPlanFeatureRequest;
import com.cafeqr.plans.dto.UpdatePlanRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/plans")
@Tag(name = "Pricing plans (admin)")
@PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
public class PricingPlanController {

    private final PricingPlanService planService;
    private final PlanFeatureService featureService;

    public PricingPlanController(PricingPlanService planService, PlanFeatureService featureService) {
        this.planService = planService;
        this.featureService = featureService;
    }

    @Operation(summary = "List the tier pricing plans")
    @GetMapping
    public ApiResponse<List<PricingPlanResponse>> list() {
        return ApiResponse.ok(planService.list());
    }

    @Operation(summary = "The tier/feature grid — what each tier includes")
    @GetMapping("/features")
    public ApiResponse<PlanFeatureMatrix> features() {
        return ApiResponse.ok(featureService.matrix());
    }

    @Operation(summary = "Include or exclude one feature for one tier")
    @PatchMapping("/features")
    public ApiResponse<PlanFeatureMatrix> setFeature(@Valid @RequestBody SetPlanFeatureRequest request) {
        return ApiResponse.ok("Plan features updated",
                featureService.set(request.tier(), request.feature(), request.enabled()));
    }

    @Operation(summary = "Edit a tier's pricing")
    @PatchMapping("/{id}")
    public ApiResponse<PricingPlanResponse> update(@PathVariable Long id,
                                                   @Valid @RequestBody UpdatePlanRequest request) {
        return ApiResponse.ok("Plan updated", planService.update(id, request));
    }
}
