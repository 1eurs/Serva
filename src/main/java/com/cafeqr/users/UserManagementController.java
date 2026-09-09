package com.cafeqr.users;

import com.cafeqr.auth.dto.UserResponse;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.users.dto.CreateUserRequest;
import com.cafeqr.users.dto.SetBranchRequest;
import com.cafeqr.users.dto.UpdateUserRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/api/users")
@Tag(name = "User management")
@PreAuthorize("hasAuthority('TEAM')")
public class UserManagementController {

    private final UserManagementService userManagementService;

    public UserManagementController(UserManagementService userManagementService) {
        this.userManagementService = userManagementService;
    }

    @Operation(summary = "Create a staff/owner account (subject to role hierarchy)")
    @PostMapping
    public ApiResponse<UserResponse> create(@Valid @RequestBody CreateUserRequest request) {
        return ApiResponse.ok("User created", userManagementService.create(request));
    }

    @Operation(summary = "List users within your scope")
    @GetMapping
    public ApiResponse<List<UserResponse>> list(
            @RequestParam(required = false) Long restaurantId,
            @RequestParam(required = false) Long branchId) {
        return ApiResponse.ok(userManagementService.list(restaurantId, branchId));
    }

    @Operation(summary = "Update a user's profile or password")
    @PatchMapping("/{userId}")
    public ApiResponse<UserResponse> update(@PathVariable Long userId,
                                            @Valid @RequestBody UpdateUserRequest request) {
        return ApiResponse.ok("User updated", userManagementService.update(userId, request));
    }

    @Operation(summary = "Move a member to a branch, or to all branches (omit branchId)")
    @PatchMapping("/{userId}/branch")
    public ApiResponse<UserResponse> setBranch(@PathVariable Long userId,
                                               @RequestBody(required = false) SetBranchRequest request) {
        return ApiResponse.ok("Branch updated",
                userManagementService.setBranch(userId, request == null ? null : request.branchId()));
    }

    @Operation(summary = "Activate a user")
    @PatchMapping("/{userId}/activate")
    public ApiResponse<UserResponse> activate(@PathVariable Long userId) {
        return ApiResponse.ok("User activated", userManagementService.setActive(userId, true));
    }

    @Operation(summary = "Deactivate a user")
    @PatchMapping("/{userId}/deactivate")
    public ApiResponse<UserResponse> deactivate(@PathVariable Long userId) {
        return ApiResponse.ok("User deactivated", userManagementService.setActive(userId, false));
    }
}
