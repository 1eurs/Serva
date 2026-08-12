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
import com.cafeqr.common.exception.ForbiddenException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.dto.CreateUserRequest;
import com.cafeqr.users.dto.UpdateUserRequest;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
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

    public UserManagementService(UserRepository userRepository,
                                 PasswordEncoder passwordEncoder,
                                 RestaurantService restaurantService,
                                 BranchService branchService,
                                 AccessGuard accessGuard) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    @Transactional
    public UserResponse create(CreateUserRequest request) {
        User user = buildMember(request.username(), request.fullName(), request.email(),
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
        User user = buildMember(request.username(), request.fullName(), request.email(),
                request.phone(), request.permissions(), request.restaurantId(), request.branchId());
        user.setPasswordHash(passwordEncoder.encode(com.cafeqr.common.util.Tokens.random(48)));
        user.setActive(false);
        user.setInvitedAt(java.time.Instant.now());
        return userRepository.save(user);
    }

    /** Shared validation + scoping for both the direct-create and invite paths. */
    private User buildMember(String username, String fullName, String email, String phone,
                             Set<Permission> requestedPermissions, Long restaurantId, Long branchId) {
        CustomUserDetails creator = SecurityUtils.currentUser();
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException(ErrorCode.CONFLICT, "Username is already taken");
        }
        if (email != null && !email.isBlank() && userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email is already registered");
        }

        Set<Permission> permissions = grantable(creator, requestedPermissions);
        Target target = resolveTarget(creator, permissions, restaurantId, branchId);

        User user = new User();
        user.setUsername(username.trim());
        user.setFullName(blankToNull(fullName) != null ? fullName.trim() : username.trim());
        user.setEmail(blankToNull(email));
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
        if (request.fullName() != null) {
            user.setFullName(request.fullName());
        }
        if (request.phone() != null) {
            user.setPhone(blankToNull(request.phone()));
        }
        if (request.password() != null) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        if (request.permissions() != null && !user.isOwner()) {
            // Owners keep their full permission set; only their profile/password can be edited here.
            user.setPermissions(grantable(editor, request.permissions()));
        }
        if (request.branchId() != null && !user.isOwner()) {
            Branch branch = requireBranchInRestaurant(user.getRestaurantId(), request.branchId());
            user.setBranchId(branch.getId());
        }
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse setActive(Long userId, boolean active) {
        User user = guardedTarget(userId);
        user.setActive(active);
        return UserResponse.from(user);
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
                throw new ForbiddenException("You cannot grant access you do not have: " + p);
            }
            result.add(p);
        }
        return result;
    }

    private User guardedTarget(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
        CustomUserDetails editor = SecurityUtils.currentUser();
        // Platform admins and the restaurant owner are protected: only a platform admin (or the
        // account itself) may manage them.
        boolean protectedAccount = user.hasPermission(Permission.PLATFORM_ADMIN) || user.isOwner();
        if (protectedAccount && !editor.isPlatformAdmin() && !editor.getUserId().equals(user.getId())) {
            throw new ForbiddenException("You cannot manage this user");
        }
        if (user.getBranchId() != null) {
            accessGuard.requireBranchAccess(user.getRestaurantId(), user.getBranchId());
        } else if (user.getRestaurantId() != null) {
            accessGuard.requireRestaurantAccess(user.getRestaurantId());
        } else if (!editor.isPlatformAdmin()) {
            throw new ForbiddenException("You cannot manage this user");
        }
        return user;
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
