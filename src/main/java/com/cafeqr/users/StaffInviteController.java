package com.cafeqr.users;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.users.dto.InviteRequest;
import com.cafeqr.users.dto.InviteResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Owner-side invitation management. Gated on TEAM like the rest of staff administration — the
 * responses carry live join links, so this must never be readable by someone who couldn't
 * create the account themselves.
 */
@RestController
@RequestMapping("/api/users/invites")
@PreAuthorize("hasAuthority('TEAM')")
@Tag(name = "Staff invites")
public class StaffInviteController {

    private final StaffInviteService inviteService;

    public StaffInviteController(StaffInviteService inviteService) {
        this.inviteService = inviteService;
    }

    @Operation(summary = "Invite a staff member and get their single-use join link")
    @PostMapping
    public ApiResponse<InviteResponse> invite(@Valid @RequestBody InviteRequest request) {
        return ApiResponse.ok("Invite created", inviteService.invite(request));
    }

    @Operation(summary = "List invites that haven't been accepted yet")
    @GetMapping
    public ApiResponse<List<InviteResponse>> pending() {
        return ApiResponse.ok(inviteService.listPending());
    }

    @Operation(summary = "Issue a fresh link, invalidating the previous one")
    @PostMapping("/{inviteId}/resend")
    public ApiResponse<InviteResponse> resend(@PathVariable Long inviteId) {
        return ApiResponse.ok("New link ready", inviteService.resend(inviteId));
    }

    @Operation(summary = "Cancel an invite and remove the pending account")
    @DeleteMapping("/{inviteId}")
    public ApiResponse<Void> revoke(@PathVariable Long inviteId) {
        inviteService.revoke(inviteId);
        return ApiResponse.message("Invite cancelled");
    }
}
