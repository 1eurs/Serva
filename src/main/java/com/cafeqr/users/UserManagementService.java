package com.cafeqr.users;

import com.cafeqr.auth.dto.UserResponse;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.util.Names;
import com.cafeqr.common.util.Pasted;
import com.cafeqr.common.exception.ForbiddenException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.dto.CreateUserRequest;
import com.cafeqr.users.dto.UpdateUserRequest;
import com.cafeqr.users.event.StaffAccessChangedEvent;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Creation and management of staff accounts. There are no roles: a creator grants a subset of the
 * {@link Permission permissions} they themselves hold, scoped to their own restaurant/branch.
 */
@Service
public class UserManagementService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RestaurantService restaurantService;
    private final BranchService branchService;
    private final AccessGuard accessGuard;
    private final ApplicationEventPublisher events;

    public UserManagementService(UserRepository userRepository,
                                 PasswordEncoder passwordEncoder,
                                 RestaurantService restaurantService,
                                 BranchService branchService,
                                 AccessGuard accessGuard,
                                 ApplicationEventPublisher events) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
        this.events = events;
    }

    @Transactional
    public UserResponse create(CreateUserRequest request) {
        User user = buildMember(request.username(), request.fullName(), request.fullNameEn(), request.fullNameAr(), request.email(),
                request.phone(), request.permissions(), request.restaurantId(), request.branchId());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setActive(true);
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Creates the account shell an invitation will later activate: same validation and the same
     * permission scoping as {@link #create}, but with no password and inactive until claimed.
     *
     * <p>The password hash is a random value nobody holds. It exists only because the column is
     * NOT NULL — it must never be guessable, and the inactive flag means it can't be used anyway.
     */
    @Transactional
    public User createPendingMember(com.cafeqr.users.dto.InviteRequest request) {
        User user = buildMember(request.username(), request.fullName(), request.fullNameEn(), request.fullNameAr(), request.email(),
                request.phone(), request.permissions(), request.restaurantId(), request.branchId());
        user.setPasswordHash(passwordEncoder.encode(com.cafeqr.common.util.Tokens.random(48)));
        user.setActive(false);
        user.setInvitedAt(java.time.Instant.now());
        return userRepository.save(user);
    }

    /** Shared validation + scoping for both the direct-create and invite paths. */
    private User buildMember(String username, String fullName, String fullNameEn, String fullNameAr,
                             String email, String phone,
                             Set<Permission> requestedPermissions, Long restaurantId, Long branchId) {
        CustomUserDetails creator = SecurityUtils.currentUser();
        // The taken-check and the row it guards have to compare the same string. A username
        // pasted with an invisible mark in it passes a check made against the raw value and
        // then collides on the unique index, as a 500 rather than "that one is taken".
        String login = Pasted.identifier(username);
        String mailbox = Pasted.identifier(email);
        if (userRepository.existsByUsernameIgnoreCase(login)) {
            throw new ConflictException(ErrorCode.CONFLICT, "Username is already taken");
        }
        if (mailbox != null && !mailbox.isBlank() && userRepository.existsByEmailIgnoreCase(mailbox)) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email is already registered");
        }

        Set<Permission> permissions = grantable(creator, requestedPermissions);
        Target target = resolveTarget(creator, permissions, restaurantId, branchId);

        User user = new User();
        user.setUsername(login);
        // A member created with no name at all is identified by their username, same as before —
        // it is filed by script so "barista1" lands in English and "باريستا" in Arabic.
        boolean anyName = blankToNull(fullName) != null || blankToNull(fullNameEn) != null || blankToNull(fullNameAr) != null;
        Names.applyOnCreate(user, anyName ? fullName : login, fullNameEn, fullNameAr);
        user.setEmail(blankToNull(mailbox));
        user.setPhone(blankToNull(phone));
        user.setOwner(false);
        user.setPermissions(permissions);
        user.setRestaurantId(target.restaurantId());
        user.setBranchId(target.branchId());
        return user;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> list(Long restaurantId, Long branchId) {
        CustomUserDetails creator = SecurityUtils.currentUser();
        if (creator.isPlatformAdmin()) {
            List<User> users = (restaurantId != null)
                    ? userRepository.findByRestaurantIdOrderByIdAsc(restaurantId)
                    : userRepository.findAll();
            return users.stream().map(UserResponse::from).toList();
        }
        Long branchScope = accessGuard.scopedBranchId();
        if (branchScope != null) {
            return userRepository.findByBranchIdOrderByIdAsc(branchScope)
                    .stream().map(UserResponse::from).toList();
        }
        return userRepository.findByRestaurantIdOrderByIdAsc(creator.getRestaurantId())
                .stream().map(UserResponse::from).toList();
    }

    @Transactional
    public UserResponse update(Long userId, UpdateUserRequest request) {
        User user = guardedTarget(userId);
        CustomUserDetails editor = SecurityUtils.currentUser();
        Names.applyOnUpdate(user, request.fullName(), request.fullNameEn(), request.fullNameAr());
        if (request.phone() != null) {
            user.setPhone(blankToNull(request.phone()));
        }
        if (request.password() != null) {
            requireTakeoverAllowed(user);
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        String email = blankToNull(Pasted.identifier(request.email()));
        // Only a real change is guarded. The team editor sends every field it shows on every
        // save, so gating on "the key was present" would refuse a manager who touched nothing
        // but a phone number.
        if (request.email() != null && !Objects.equals(email, user.getEmail())) {
            // An account's email is where its password resets are delivered, so moving it is the
            // same power as setting the password and answers to the same rule. Your own is the
            // exception: that goes through /api/auth/change-email, which asks for your password
            // first — otherwise anyone who walked past an unlocked dashboard could redirect it.
            requireTakeoverAllowed(user);
            if (editor.getUserId().equals(user.getId())) {
                throw new BadRequestException(
                        "Change your own sign-in email in Settings — it asks for your password first.");
            }
            if (email != null) {
                userRepository.findByEmailIgnoreCase(email)
                        .filter(other -> !other.getId().equals(user.getId()))
                        .ifPresent(other -> {
                            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS,
                                    "Email is already registered");
                        });
            }
            user.setEmail(email);
        }
        if (request.permissions() != null && !user.isOwner()) {
            // Owners keep their full permission set; only their profile/password can be edited here.
            user.setPermissions(grantable(editor, request.permissions()));
            accessChanged(user);
        }
        return UserResponse.from(user);
    }

    /**
     * Moves a member to one branch, or to all of them.
     *
     * <p>Its own action because {@code null} has to mean "every branch" here, and in a PATCH body
     * a null field already means "leave unchanged". Folded into {@link #update} the two readings
     * collided and the second won: an owner picking "All branches" in the team editor was told the
     * account had been saved while the member stayed pinned to their shop.
     */
    @Transactional
    public UserResponse setBranch(Long userId, Long branchId) {
        User user = guardedTarget(userId);
        if (user.isOwner()) {
            throw new BadRequestException("The owner account is not tied to a branch.");
        }
        Long target = (branchId == null) ? null
                : requireBranchInRestaurant(user.getRestaurantId(), branchId).getId();
        requireBranchAssignable(user.getRestaurantId(), target);
        user.setBranchId(target);
        accessChanged(user);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse setActive(Long userId, boolean active) {
        User user = guardedTarget(userId);
        // Nobody switches themselves off. For staff it is a self-inflicted lockout the owner has
        // to undo; for an owner there is nobody left inside the café who can, and restoring it
        // becomes a support call. The team page never offers it — this is for everything else.
        if (SecurityUtils.currentUser().getUserId().equals(user.getId())) {
            throw new BadRequestException("You cannot deactivate your own account.");
        }
        user.setActive(active);
        accessChanged(user);
        return UserResponse.from(user);
    }

    /**
     * Says out loud that this account's access is not what it was.
     *
     * <p>Ordinary requests need no telling — they read the row every time. This is for the one
     * thing that authenticates once and then keeps talking: an open order stream, which without
     * it would go on feeding live orders to a tablet held by someone who was switched off hours
     * ago.
     */
    private void accessChanged(User user) {
        events.publishEvent(new StaffAccessChangedEvent(user.getId()));
    }

    // ----------------------------------------------------------------- internals

    /**
     * Restricts a requested permission set to what the creator may actually grant: only permissions
     * the creator holds, and never {@code PLATFORM_ADMIN} unless the creator is one.
     */
    private Set<Permission> grantable(CustomUserDetails creator, Set<Permission> requested) {
        Set<Permission> result = EnumSet.noneOf(Permission.class);
        if (requested == null) {
            return result;
        }
        for (Permission p : requested) {
            if (p == Permission.PLATFORM_ADMIN && !creator.isPlatformAdmin()) {
                throw new ForbiddenException("You cannot grant platform-admin access");
            }
            if (!creator.isPlatformAdmin() && !creator.hasPermission(p)) {
                // Named in the words the team editor uses, not the enum's: the person reading
                // this is a café owner looking at a screen that says "Stock", not "STOCK".
                throw new ForbiddenException(
                        "You can only give access you have yourself, and " + label(p) + " is not yours to give.");
            }
            result.add(p);
        }
        return result;
    }

    /** The name this permission goes by on the team page, so an error reads like the screen. */
    private static String label(Permission permission) {
        return switch (permission) {
            case ORDERS -> "Orders";
            case PAYMENTS -> "Payments";
            case MENU -> "Menu";
            case QR_TABLES -> "Tables / QR";
            case TEAM -> "Team";
            case ANALYTICS -> "Analytics";
            case PROFILE -> "Restaurant settings";
            case BRANCHES -> "Branches";
            case STOCK -> "Stock";
            case PLATFORM_ADMIN -> "platform admin";
            case BILLING -> "Billing";
        };
    }

    private User guardedTarget(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
        requireManageable(user);
        return user;
    }

    /**
     * Whether the signed-in user administers this account at all.
     *
     * <p>The whole scope rule, in two lines: your own café, and — if you are pinned to a branch —
     * only that branch. A restaurant-wide account is deliberately <em>not</em> reachable from a
     * branch. {@link AccessGuard} treats a resource with no branch as shared with every shop,
     * which is right for a menu item and wrong for a person: someone with no branch sits above
     * the branches and answers to the owner, not to whoever runs one of them.
     *
     * <p>Owners and platform admins are off limits to everyone but a platform admin, or the
     * account itself.
     */
    public boolean canManage(User user) {
        CustomUserDetails editor = SecurityUtils.currentUser();
        if (editor.isPlatformAdmin()) {
            return true;
        }
        if (user.hasPermission(Permission.PLATFORM_ADMIN) || user.isOwner()) {
            return editor.getUserId().equals(user.getId());
        }
        if (user.getRestaurantId() == null || !user.getRestaurantId().equals(editor.getRestaurantId())) {
            return false;
        }
        return editor.getBranchId() == null || editor.getBranchId().equals(user.getBranchId());
    }

    public void requireManageable(User user) {
        if (!canManage(user)) {
            throw new ForbiddenException("You cannot manage this user");
        }
    }

    /**
     * Whether the signed-in user may end up <em>signed in as</em> this account — which is what
     * setting its password does, and what holding its unopened join link amounts to.
     *
     * <p>Administering an account and becoming one are different powers, and only the second can
     * be used to climb. {@link #grantable} already refuses to hand out access the creator lacks;
     * without this, a manager with TEAM but no STOCK would simply reset the storekeeper's
     * password and sign in as them, arriving at the same place by another door. So a takeover
     * additionally requires that the account holds nothing the actor could not have granted it.
     */
    public boolean canTakeOver(User user) {
        if (!canManage(user)) {
            return false;
        }
        CustomUserDetails editor = SecurityUtils.currentUser();
        // A platform admin's password is theirs alone. AdminSupportService already says so on the
        // support endpoint — "no single account can quietly take over the others" — and this is
        // the other door into the same room.
        if (user.hasPermission(Permission.PLATFORM_ADMIN)) {
            return editor.getUserId().equals(user.getId());
        }
        return editor.isPlatformAdmin() || editor.getPermissions().containsAll(user.getPermissions());
    }

    public void requireTakeoverAllowed(User user) {
        if (!canTakeOver(user)) {
            throw new ForbiddenException(
                    "This account has access you do not have, so you cannot sign in as it.");
        }
    }

    /** Resolves the tenant/branch a new account belongs to, from the creator's own scope. */
    private Target resolveTarget(CustomUserDetails creator, Set<Permission> permissions,
                                 Long requestedRestaurantId, Long requestedBranchId) {
        if (creator.isPlatformAdmin()) {
            if (permissions.contains(Permission.PLATFORM_ADMIN)) {
                return new Target(null, null); // another platform admin
            }
            if (requestedRestaurantId == null) {
                throw new BadRequestException("restaurantId is required to create this user");
            }
            restaurantService.getEntity(requestedRestaurantId);
            Long branchId = (requestedBranchId != null)
                    ? requireBranchInRestaurant(requestedRestaurantId, requestedBranchId).getId() : null;
            return new Target(requestedRestaurantId, branchId);
        }
        if (creator.getRestaurantId() == null) {
            throw new ForbiddenException("You are not allowed to create users");
        }
        // A branch-scoped creator can only create within their own branch.
        if (creator.getBranchId() != null) {
            return new Target(creator.getRestaurantId(), creator.getBranchId());
        }
        // Restaurant-wide creator: branch is optional (null = restaurant-wide).
        Long branchId = (requestedBranchId != null)
                ? requireBranchInRestaurant(creator.getRestaurantId(), requestedBranchId).getId() : null;
        return new Target(creator.getRestaurantId(), branchId);
    }

    /**
     * Where the editor is allowed to place someone. A branch-scoped editor has exactly one answer,
     * their own branch — and in particular cannot lift an account out to "all branches", which
     * would both widen its reach and carry it beyond their own.
     */
    private void requireBranchAssignable(Long restaurantId, Long branchId) {
        accessGuard.requireRestaurantAccess(restaurantId);
        Long editorBranch = accessGuard.scopedBranchId();
        if (editorBranch != null && !editorBranch.equals(branchId)) {
            throw new ForbiddenException("You can only place staff in your own branch");
        }
    }

    private Branch requireBranchInRestaurant(Long restaurantId, Long branchId) {
        if (branchId == null) {
            throw new BadRequestException("branchId is required");
        }
        return branchService.getEntityInRestaurant(restaurantId, branchId);
    }

    private static String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }

    private record Target(Long restaurantId, Long branchId) {}
}
