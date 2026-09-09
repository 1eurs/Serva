package com.cafeqr.admin;

import com.cafeqr.admin.dto.BroadcastRequest;
import com.cafeqr.admin.dto.BroadcastResponse;
import com.cafeqr.admin.dto.ImpersonationResponse;
import com.cafeqr.admin.dto.ResetPasswordResponse;
import com.cafeqr.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "Support (admin)")
@PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
public class AdminSupportController {

    private final AdminSupportService supportService;

    public AdminSupportController(AdminSupportService supportService) {
        this.supportService = supportService;
    }

    @Operation(summary = "Open a short-lived support session inside a café (no refresh token)")
    @PostMapping("/restaurants/{restaurantId}/impersonate")
    public ApiResponse<ImpersonationResponse> impersonate(@PathVariable Long restaurantId,
                                                          @RequestParam(required = false) Long userId) {
        return ApiResponse.ok("Support session opened", supportService.impersonate(restaurantId, userId));
    }

    @Operation(summary = "Set a new password on an account and return it once")
    @PostMapping("/users/{userId}/reset-password")
    public ApiResponse<ResetPasswordResponse> resetPassword(@PathVariable Long userId,
                                                            @RequestParam(required = false) String password) {
        return ApiResponse.ok("Password reset", supportService.resetPassword(userId, password));
    }

    @Operation(summary = "Email every active café owner (optionally one tier only)")
    @PostMapping("/broadcast")
    public ApiResponse<BroadcastResponse> broadcast(@Valid @RequestBody BroadcastRequest request) {
        BroadcastResponse result = supportService.broadcast(request);
        return ApiResponse.ok(result.dryRun()
                ? "Preview only — nothing was sent"
                : "Sent to " + result.sent() + " owner(s)", result);
    }
}
