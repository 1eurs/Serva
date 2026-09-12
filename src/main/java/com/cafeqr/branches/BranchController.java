package com.cafeqr.branches;

import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.branches.dto.CreateBranchRequest;
import com.cafeqr.branches.dto.UpdateBranchRequest;
import com.cafeqr.branches.dto.UpdateOrderingStatusRequest;
import com.cafeqr.common.api.ApiResponse;
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
@Tag(name = "Branches")
public class BranchController {

    private final BranchService branchService;

    public BranchController(BranchService branchService) {
        this.branchService = branchService;
    }

    @Operation(summary = "Create a branch under a restaurant")
    @PreAuthorize("hasAuthority('BRANCHES')")
    @PostMapping("/api/restaurants/{restaurantId}/branches")
    public ApiResponse<BranchResponse> create(@PathVariable Long restaurantId,
                                              @Valid @RequestBody CreateBranchRequest request) {
        return ApiResponse.ok("Branch created", branchService.create(restaurantId, request));
    }

    @Operation(summary = "List branches of a restaurant")
    @GetMapping("/api/restaurants/{restaurantId}/branches")
    public ApiResponse<List<BranchResponse>> list(@PathVariable Long restaurantId) {
        return ApiResponse.ok(branchService.listByRestaurant(restaurantId));
    }

    @Operation(summary = "Get a branch by id")
    @GetMapping("/api/branches/{branchId}")
    public ApiResponse<BranchResponse> get(@PathVariable Long branchId) {
        return ApiResponse.ok(branchService.get(branchId));
    }

    @Operation(summary = "Update a branch")
    @PreAuthorize("hasAuthority('BRANCHES')")
    @PatchMapping("/api/branches/{branchId}")
    public ApiResponse<BranchResponse> update(@PathVariable Long branchId,
                                              @Valid @RequestBody UpdateBranchRequest request) {
        return ApiResponse.ok("Branch updated", branchService.update(branchId, request));
    }

    @Operation(summary = "Activate a branch")
    @PreAuthorize("hasAuthority('BRANCHES')")
    @PatchMapping("/api/branches/{branchId}/activate")
    public ApiResponse<BranchResponse> activate(@PathVariable Long branchId) {
        return ApiResponse.ok("Branch activated", branchService.setActive(branchId, true));
    }

    @Operation(summary = "Deactivate a branch")
    @PreAuthorize("hasAuthority('BRANCHES')")
    @PatchMapping("/api/branches/{branchId}/deactivate")
    public ApiResponse<BranchResponse> deactivate(@PathVariable Long branchId) {
        return ApiResponse.ok("Branch deactivated", branchService.setActive(branchId, false));
    }

    @Operation(summary = "Pause or resume customer ordering for a branch")
    @PreAuthorize("hasAuthority('ORDERS')")
    @PatchMapping("/api/branches/{branchId}/ordering-status")
    public ApiResponse<BranchResponse> setOrderingStatus(
            @PathVariable Long branchId,
            @Valid @RequestBody UpdateOrderingStatusRequest request) {
        String message = request.acceptingOrders() ? "Orders resumed" : "Orders paused";
        return ApiResponse.ok(message,
                branchService.setAcceptingOrders(branchId, request.acceptingOrders()));
    }
}
