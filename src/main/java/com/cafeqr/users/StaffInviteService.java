package com.cafeqr.users;

import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.common.config.AppProperties;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.util.Tokens;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.StaffInvite;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.dto.InviteRequest;
import com.cafeqr.users.dto.InviteResponse;
import com.cafeqr.users.dto.InvitePreviewResponse;
import com.cafeqr.users.repository.StaffInviteRepository;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Inviting staff instead of handing them a password.
 *
 * <p>The old flow had the owner generate a temporary password, copy it, and pass it on. That
 * leaves the owner knowing a credential that is never rotated. Here the owner only creates the
 * shell — username, permissions, branch — and shares a single-use link; the member sets a
 * password nobody else ever sees.
 *
 * <p>The pending account is created immediately but {@code active = false}, so the ordinary login
 * path already refuses it and nothing downstream needs a special case for "not yet joined".
 */
@Service
public class StaffInviteService {

    /** Invites sit in a WhatsApp thread until the member's next shift, so days rather than minutes. */
    private static final int INVITE_TTL_DAYS = 7;

    private final UserRepository userRepository;
    private final StaffInviteRepository inviteRepository;
    private final UserManagementService userManagementService;
    private final RestaurantService restaurantService;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties appProperties;

    public StaffInviteService(UserRepository userRepository,
                              StaffInviteRepository inviteRepository,
                              UserManagementService userManagementService,
                              RestaurantService restaurantService,
                              PasswordEncoder passwordEncoder,
                              AppProperties appProperties) {
        this.userRepository = userRepository;
        this.inviteRepository = inviteRepository;
        this.userManagementService = userManagementService;
        this.restaurantService = restaurantService;
        this.passwordEncoder = passwordEncoder;
        this.appProperties = appProperties;
    }

    // ============================================================ owner side

    /**
     * Creates the pending account and its first link.
     *
     * <p>Permission and branch scoping is delegated to {@link UserManagementService} so an invite
     * can never grant more than the inviter holds — the rule lives in one place rather than being
     * re-implemented (and eventually diverging) here.
     */
    @Transactional
    public InviteResponse invite(InviteRequest request) {
        CustomUserDetails inviter = SecurityUtils.currentUser();
        User user = userManagementService.createPendingMember(request);

        StaffInvite invite = issue(user.getId(), inviter.getUserId());
        return toResponse(invite, user);
    }

    @Transactional(readOnly = true)
    public List<InviteResponse> listPending() {
        CustomUserDetails viewer = SecurityUtils.currentUser();
        Long restaurantId = viewer.getRestaurantId();
        if (restaurantId == null) {
            return List.of();
        }
        return inviteRepository.pendingForRestaurant(restaurantId).stream()
                .map(invite -> userRepository.findById(invite.getUserId())
                        .map(user -> toResponse(invite, user))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    /** Burns the old link and mints a new one — for when the first was lost or has expired. */
    @Transactional
    public InviteResponse resend(Long inviteId) {
        StaffInvite existing = guarded(inviteId);
        if (existing.getAcceptedAt() != null) {
            throw new BadRequestException(ErrorCode.CONFLICT, "That member has already joined.");
        }
        User user = requireUser(existing.getUserId());
        inviteRepository.revokeAllForUser(user.getId());
        return toResponse(issue(user.getId(), SecurityUtils.currentUser().getUserId()), user);
    }

    /**
     * Cancels an invite and removes the shell account.
     *
     * <p>Deleting is safe precisely because the account was never usable: it has no sessions, no
     * orders and no event history to orphan. Leaving a permanent inactive row behind for every
     * mistyped username would just clutter the team list.
     */
    @Transactional
    public void revoke(Long inviteId) {
        StaffInvite invite = guarded(inviteId);
        if (invite.getAcceptedAt() != null) {
            throw new BadRequestException(ErrorCode.CONFLICT,
                    "That member has already joined — deactivate the account instead.");
        }
        User user = requireUser(invite.getUserId());
        if (!user.isPendingInvite()) {
            throw new BadRequestException(ErrorCode.CONFLICT,
                    "That account is already in use — deactivate it instead.");
        }
        inviteRepository.deleteById(invite.getId());
        userRepository.delete(user);
    }

    // ============================================================ invitee side (public)

    /**
     * What the invitee sees before committing to anything: which café, which login name, and what
     * they will be able to do. Never reveals contact details or anything about other staff.
     */
    @Transactional(readOnly = true)
    public InvitePreviewResponse preview(String token) {
        StaffInvite invite = openable(token);
        User user = requireUser(invite.getUserId());
        String cafe = user.getRestaurantId() == null ? null
                : restaurantService.getEntity(user.getRestaurantId()).getName();
        return new InvitePreviewResponse(
                user.getUsername(),
                user.getFullName(),
                cafe,
                user.getPermissions().stream().map(Permission::name).sorted().toList(),
                invite.getExpiresAt());
    }

    /**
     * Sets the member's password, activates the account and spends the token.
     *
     * <p>Returns a full session so the member lands in the dashboard rather than being bounced to
     * a login screen to retype the password they just chose.
     */
    @Transactional
    public User accept(String token, String password) {
        StaffInvite invite = openable(token);
        User user = requireUser(invite.getUserId());

        user.setPasswordHash(passwordEncoder.encode(password));
        user.setActive(true);
        user.setInvitedAt(null); // no longer pending — this is a real member now
        userRepository.save(user);

        invite.setAcceptedAt(Instant.now());
        inviteRepository.save(invite);
        return user;
    }

    // ============================================================ internals

    private StaffInvite issue(Long userId, Long invitedBy) {
        StaffInvite invite = new StaffInvite();
        invite.setUserId(userId);
        invite.setToken(Tokens.random(48));
        invite.setExpiresAt(Instant.now().plus(INVITE_TTL_DAYS, ChronoUnit.DAYS));
        invite.setInvitedBy(invitedBy);
        return inviteRepository.save(invite);
    }

    /**
     * Resolves a token, distinguishing the three failure modes so the join page can say something
     * useful — "ask for a new link" reads very differently from "you've already joined".
     */
    private StaffInvite openable(String token) {
        StaffInvite invite = inviteRepository.findByToken(token)
                .orElseThrow(() -> new BadRequestException(ErrorCode.TOKEN_INVALID,
                        "This invite link isn't valid. Ask the café to send a new one."));
        if (invite.getAcceptedAt() != null) {
            throw new BadRequestException(ErrorCode.CONFLICT,
                    "This invite has already been used — just sign in.");
        }
        if (invite.isRevoked()) {
            throw new BadRequestException(ErrorCode.TOKEN_INVALID,
                    "This invite was cancelled. Ask the café to send a new one.");
        }
        if (invite.isExpired()) {
            throw new BadRequestException(ErrorCode.TOKEN_EXPIRED,
                    "This invite has expired. Ask the café to send a new one.");
        }
        return invite;
    }

    /** Only staff of the same café may touch an invite. */
    private StaffInvite guarded(Long inviteId) {
        StaffInvite invite = inviteRepository.findById(inviteId)
                .orElseThrow(() -> ResourceNotFoundException.of("Invite", inviteId));
        User user = requireUser(invite.getUserId());
        CustomUserDetails viewer = SecurityUtils.currentUser();
        if (!viewer.isPlatformAdmin()
                && (user.getRestaurantId() == null
                    || !user.getRestaurantId().equals(viewer.getRestaurantId()))) {
            throw new BadRequestException(ErrorCode.FORBIDDEN, "That invite belongs to another café.");
        }
        return invite;
    }

    private User requireUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
    }

    private InviteResponse toResponse(StaffInvite invite, User user) {
        return new InviteResponse(
                invite.getId(),
                user.getId(),
                user.getUsername(),
                user.getFullName(),
                user.getPermissions().stream().map(Permission::name).sorted().toList(),
                user.getBranchId(),
                joinUrl(invite.getToken()),
                invite.getExpiresAt(),
                invite.getCreatedAt());
    }

    /** The link the owner actually shares. */
    private String joinUrl(String token) {
        String base = appProperties.publicBaseUrl();
        String trimmed = base == null ? "" : base.replaceAll("/+$", "");
        return trimmed + "/join/" + token;
    }
}
