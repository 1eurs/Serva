package com.cafeqr.users;

import com.cafeqr.auth.AuthService;
import com.cafeqr.auth.dto.AuthResponse;
import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.dto.AcceptInviteRequest;
import com.cafeqr.users.dto.InvitePreviewResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The invitee's side of the flow — unauthenticated, because the whole point is that the person
 * has no account yet. The token in the URL is the credential, so it is single-use, expiring, and
 * the preview it unlocks deliberately exposes nothing beyond this one invitation.
 */
@RestController
@RequestMapping("/api/public/invites")
@Tag(name = "Staff invites (public)")
public class PublicInviteController {

    private final StaffInviteService inviteService;
    private final AuthService authService;

    public PublicInviteController(StaffInviteService inviteService, AuthService authService) {
        this.inviteService = inviteService;
        this.authService = authService;
    }

    @Operation(summary = "What this invite is for: café, login name and access")
    @GetMapping("/{token}")
    public ApiResponse<InvitePreviewResponse> preview(@PathVariable String token) {
        return ApiResponse.ok(inviteService.preview(token));
    }

    @Operation(summary = "Set a password, activate the account, and sign in")
    @PostMapping("/{token}/accept")
    public ApiResponse<AuthResponse> accept(@PathVariable String token,
                                            @Valid @RequestBody AcceptInviteRequest request) {
        User user = inviteService.accept(token, request.password());
        return ApiResponse.ok("Welcome aboard", authService.issueSessionFor(user));
    }
}
