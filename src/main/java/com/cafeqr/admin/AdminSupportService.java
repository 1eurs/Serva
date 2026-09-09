package com.cafeqr.admin;

import com.cafeqr.admin.dto.BroadcastRequest;
import com.cafeqr.admin.dto.BroadcastResponse;
import com.cafeqr.admin.dto.ImpersonationResponse;
import com.cafeqr.admin.dto.ResetPasswordResponse;
import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.auth.dto.UserResponse;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.auth.security.JwtService;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.util.Names;
import com.cafeqr.notifications.email.EmailMessage;
import com.cafeqr.notifications.email.EmailSender;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The support powers a platform admin needs when a café is on the phone: get into their
 * dashboard, get them back into their own account, and tell every café something at once.
 *
 * <p>Every method here writes to the audit log. These are the actions most worth being able to
 * explain afterwards, and the ones easiest to abuse quietly.
 */
@Service
public class AdminSupportService {

    private static final Logger log = LoggerFactory.getLogger(AdminSupportService.class);

    /**
     * How long a support session inside a café lasts. Long enough to reproduce a complaint,
     * short enough that a forgotten tab isn't a standing key to somebody's business.
     */
    private static final long IMPERSONATION_TTL_MINUTES = 30;

    /** Unambiguous alphabet — no O/0, l/1 — because these get read out over the phone. */
    private static final String PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final int TEMP_PASSWORD_LENGTH = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RestaurantRepository restaurantRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final EmailSender email;
    private final AuditService audit;

    public AdminSupportService(UserRepository userRepository,
                               RestaurantRepository restaurantRepository,
                               JwtService jwtService,
                               PasswordEncoder passwordEncoder,
                               EmailSender email,
                               AuditService audit) {
        this.userRepository = userRepository;
        this.restaurantRepository = restaurantRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.email = email;
        this.audit = audit;
    }

    /**
     * Issues a short-lived session as a café's owner so an admin can see exactly what the café
     * sees. No refresh token is issued, so the session expires on its own.
     *
     * <p>A specific user id may be given to enter as a particular staff member — useful when the
     * complaint is about what a cashier can or cannot see, which the owner's own view won't show.
     */
    @Transactional
    public ImpersonationResponse impersonate(Long restaurantId, Long userId) {
        Restaurant restaurant = restaurantRepository.findById(restaurantId)
                .orElseThrow(() -> ResourceNotFoundException.of("Restaurant", restaurantId));

        User target = userId != null
                ? userRepository.findById(userId)
                        .orElseThrow(() -> ResourceNotFoundException.of("User", userId))
                : userRepository.findFirstByRestaurantIdAndOwnerTrueOrderByIdAsc(restaurantId)
                        .orElseThrow(() -> new BadRequestException(
                                "This café has no owner account to enter as. Create one first."));

        if (target.getRestaurantId() == null || !target.getRestaurantId().equals(restaurantId)) {
            throw new BadRequestException("That account does not belong to this café.");
        }
        // Entering as another platform admin would be a privilege sidestep, not support.
        if (target.getPermissions().contains(Permission.PLATFORM_ADMIN)) {
            throw new BadRequestException("Platform admin accounts cannot be entered.");
        }
        // A disabled or still-invited account cannot sign in, so a session as one would show
        // something the café itself can never see.
        if (!target.isActive()) {
            throw new BadRequestException(target.isPendingInvite()
                    ? "That account hasn't been claimed yet — there is nothing to enter as."
                    : "That account is deactivated. Reactivate it first, or enter as another user.");
        }

        String cafeName = Names.preferring(restaurant.getNameEn(), restaurant.getNameAr(),
                restaurant.getName(), false);
        audit.recordCafe(AuditAction.IMPERSONATED, restaurantId, cafeName,
                "Entered as " + target.getUsername() + " for " + IMPERSONATION_TTL_MINUTES + " minutes");

        String token = jwtService.generateAccessToken(
                CustomUserDetails.from(target), IMPERSONATION_TTL_MINUTES);
        return new ImpersonationResponse(token, "Bearer", IMPERSONATION_TTL_MINUTES * 60,
                UserResponse.from(target), restaurantId, cafeName);
    }

    /**
     * Sets a new password on an account and hands it back once, for an owner who is locked out
     * and cannot receive the emailed reset link.
     *
     * <p>Another platform admin's password is off limits — an admin who loses their password
     * uses the normal reset flow like everyone else, so no single account can quietly take over
     * the others.
     */
    @Transactional
    public ResetPasswordResponse resetPassword(Long userId, String chosenPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
        if (user.getPermissions().contains(Permission.PLATFORM_ADMIN)) {
            throw new BadRequestException("Platform admin passwords can only be reset by their owner.");
        }
        // Blank means "pick one for me"; only a password somebody actually typed is measured.
        boolean chosen = chosenPassword != null && !chosenPassword.isBlank();
        if (chosen && chosenPassword.length() < 8) {
            throw new BadRequestException("Use at least 8 characters.");
        }
        String password = chosen ? chosenPassword : randomPassword();
        user.setPasswordHash(passwordEncoder.encode(password));
        // A locked-out account is usually also a disabled one; resetting is meaningless if they
        // still can't sign in. Pending invites are left alone — that flow sets its own password.
        if (!user.isActive() && !user.isPendingInvite()) {
            user.setActive(true);
        }

        boolean emailed = false;
        if (user.getEmail() != null && !user.getEmail().isBlank()) {
            emailed = trySend(new EmailMessage(user.getEmail(),
                    "Your Serva password was reset / تم تغيير كلمة المرور",
                    null,
                    "A platform administrator set a new password on your Serva account.\n\n"
                            + "Username: " + user.getUsername() + "\n"
                            + "Temporary password: " + password + "\n\n"
                            + "Please sign in and change it straight away.\n\n"
                            + "قام مشرف المنصة بتعيين كلمة مرور جديدة لحسابك.\n"
                            + "اسم المستخدم: " + user.getUsername() + "\n"
                            + "كلمة المرور المؤقتة: " + password + "\n"
                            + "يرجى تسجيل الدخول وتغييرها فوراً."));
        }

        audit.record(AuditAction.PASSWORD_RESET, "USER", user.getId(), user.getUsername(),
                emailed ? "Temporary password set and emailed" : "Temporary password set (read out manually)");
        return new ResetPasswordResponse(user.getId(), user.getUsername(), password, emailed);
    }

    /**
     * Emails every active café owner. Best-effort per recipient: one bad address must not stop
     * the rest of the platform from being told about a maintenance window.
     */
    /**
     * Deliberately not {@code @Transactional}: this makes one SMTP round trip per owner, and
     * holding a database connection open across all of them would tie up the pool for as long
     * as the mail server feels like taking. Nothing here needs to roll back together — the
     * audit entry writes in its own transaction once the sending is done.
     */
    public BroadcastResponse broadcast(BroadcastRequest request) {
        boolean dryRun = Boolean.TRUE.equals(request.dryRun());
        List<User> owners = userRepository.findByOwnerTrueAndActiveTrue();

        Set<Long> allowedRestaurants = request.tier() == null ? null
                : restaurantRepository.findByPlanAndActiveTrue(request.tier())
                        .stream().map(Restaurant::getId).collect(Collectors.toSet());

        List<User> audience = owners.stream()
                .filter(u -> u.getRestaurantId() != null)
                .filter(u -> allowedRestaurants == null || allowedRestaurants.contains(u.getRestaurantId()))
                .toList();

        List<String> unreachable = new ArrayList<>();
        int sent = 0;
        int failed = 0;
        for (User owner : audience) {
            if (owner.getEmail() == null || owner.getEmail().isBlank()) {
                unreachable.add(owner.getUsername());
                continue;
            }
            if (dryRun) {
                continue;
            }
            boolean ok = trySend(new EmailMessage(owner.getEmail(),
                    request.subjectEn() + " / " + request.subjectAr(),
                    null,
                    request.bodyEn() + "\n\n———\n\n" + request.bodyAr()));
            if (ok) {
                sent++;
            } else {
                failed++;
            }
        }

        if (!dryRun) {
            audit.record(AuditAction.BROADCAST_SENT, "PLATFORM", null, request.subjectEn(),
                    "Sent to " + sent + " owner(s)"
                            + (request.tier() != null ? " on " + request.tier() : "")
                            + (failed > 0 ? ", " + failed + " failed" : ""));
        }
        // "Reaches N" has to mean owners we can actually email; the rest need a phone call,
        // and they are listed separately so somebody can make it.
        return new BroadcastResponse(audience.size() - unreachable.size(), sent, failed, dryRun, unreachable);
    }

    /** Email delivery must never fail the action that triggered it. */
    private boolean trySend(EmailMessage message) {
        try {
            email.send(message);
            return true;
        } catch (RuntimeException e) {
            log.warn("Admin email to {} failed: {}", message.to(), e.toString());
            return false;
        }
    }

    private static String randomPassword() {
        StringBuilder sb = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            sb.append(PASSWORD_ALPHABET.charAt(RANDOM.nextInt(PASSWORD_ALPHABET.length())));
        }
        return sb.toString();
    }
}
