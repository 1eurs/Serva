package com.cafeqr.auth;

import com.cafeqr.auth.domain.PasswordResetToken;
import com.cafeqr.auth.domain.RefreshToken;
import com.cafeqr.auth.dto.AuthResponse;
import com.cafeqr.auth.dto.LoginRequest;
import com.cafeqr.auth.dto.RefreshRequest;
import com.cafeqr.auth.dto.RegisterPlatformAdminRequest;
import com.cafeqr.auth.dto.UserResponse;
import com.cafeqr.auth.event.PasswordResetRequestedEvent;
import com.cafeqr.auth.repository.PasswordResetTokenRepository;
import com.cafeqr.auth.repository.RefreshTokenRepository;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.auth.security.JwtService;
import com.cafeqr.common.config.AppProperties;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.exception.UnauthorizedException;
import com.cafeqr.common.util.Tokens;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
public class AuthService {

    /** How long a password-reset link stays valid. */
    private static final long RESET_TTL_MINUTES = 60;

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final ApplicationEventPublisher events;
    private final long refreshTtlDays;

    public AuthService(UserRepository userRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       PasswordResetTokenRepository passwordResetTokenRepository,
                       JwtService jwtService,
                       PasswordEncoder passwordEncoder,
                       AuthenticationManager authenticationManager,
                       ApplicationEventPublisher events,
                       AppProperties appProperties) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.events = events;
        this.refreshTtlDays = appProperties.jwt().refreshTokenTtlDays();
    }

    @Transactional
    public AuthResponse registerPlatformAdmin(RegisterPlatformAdminRequest request) {
        if (userRepository.existsByPermission(Permission.PLATFORM_ADMIN)) {
            throw new ConflictException(ErrorCode.CONFLICT,
                    "A platform admin already exists. Ask an existing admin to create more accounts.");
        }
        if (userRepository.existsByEmailIgnoreCase(request.email())) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email is already registered");
        }

        User user = new User();
        user.setFullName(request.fullName());
        user.setUsername(request.email());
        user.setEmail(request.email());
        user.setPhone(request.phone());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setOwner(false);
        user.setPermissions(Permission.platformAdminSet());
        user.setActive(true);
        userRepository.save(user);

        return issueTokens(CustomUserDetails.from(user), user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));
        } catch (org.springframework.security.authentication.DisabledException e) {
            // An invited member who hasn't opened their link is also "disabled", but the generic
            // message talks about bank transfers and would send them to the wrong place entirely.
            // No extra disclosure: Spring already rejects a disabled account before checking the
            // password, so the account's existence was visible either way.
            userRepository.findByUsernameIgnoreCase(request.username())
                    .filter(User::isPendingInvite)
                    .ifPresent(pending -> {
                        throw new BadRequestException(ErrorCode.ACCOUNT_DISABLED,
                                "Open the invite link the café sent you to finish setting up your account.");
                    });
            throw e;
        }
        CustomUserDetails principal = (CustomUserDetails) authentication.getPrincipal();
        User user = userRepository.findById(principal.getUserId())
                .orElseThrow(() -> ResourceNotFoundException.of("User", principal.getUserId()));
        return issueTokens(principal, user);
    }

    @Transactional
    public AuthResponse refresh(RefreshRequest request) {
        RefreshToken stored = refreshTokenRepository.findByToken(request.refreshToken())
                .orElseThrow(() -> new UnauthorizedException(ErrorCode.TOKEN_INVALID, "Invalid refresh token"));
        if (!stored.isActive()) {
            throw new UnauthorizedException(ErrorCode.TOKEN_EXPIRED, "Refresh token expired or revoked");
        }

        User user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> ResourceNotFoundException.of("User", stored.getUserId()));
        if (!user.isActive()) {
            throw new UnauthorizedException(ErrorCode.UNAUTHORIZED, "Account is deactivated");
        }

        // Rotate: revoke the used token, issue a fresh pair.
        stored.setRevoked(true);
        refreshTokenRepository.save(stored);
        return issueTokens(CustomUserDetails.from(user), user);
    }

    @Transactional
    public void logout(Long userId) {
        refreshTokenRepository.revokeAllForUser(userId);
    }

    /**
     * Issues a single-use reset token and emails a link. Always returns normally regardless of
     * whether the email exists, so callers can't enumerate accounts.
     */
    @Transactional
    public void forgotPassword(String email) {
        userRepository.findByEmailIgnoreCase(email).ifPresent(user -> {
            if (!user.isActive()) {
                return; // disabled accounts (e.g. awaiting onboarding payment) can't reset
            }
            passwordResetTokenRepository.invalidateAllForUser(user.getId());

            PasswordResetToken token = new PasswordResetToken();
            token.setUserId(user.getId());
            token.setToken(Tokens.random(48));
            token.setExpiresAt(Instant.now().plus(RESET_TTL_MINUTES, ChronoUnit.MINUTES));
            token.setUsed(false);
            token.setCreatedAt(Instant.now());
            passwordResetTokenRepository.save(token);

            // Emailed after commit (so a rollback never sends a live reset link).
            events.publishEvent(new PasswordResetRequestedEvent(
                    user.getEmail(), user.getFullName(), token.getToken()));
        });
    }

    /** Consumes a reset token, sets the new password, and revokes existing sessions. */
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        PasswordResetToken token = passwordResetTokenRepository.findByToken(rawToken)
                .filter(PasswordResetToken::isUsable)
                .orElseThrow(() -> new BadRequestException(
                        ErrorCode.TOKEN_INVALID, "This reset link is invalid or has expired"));

        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> ResourceNotFoundException.of("User", token.getUserId()));
        user.setPasswordHash(passwordEncoder.encode(newPassword));

        token.setUsed(true);
        refreshTokenRepository.revokeAllForUser(user.getId()); // force re-login everywhere
    }

    /**
     * Changes the signed-in user's password after verifying the current one. The active session is
     * left intact (the user stays logged in on this device); existing sessions expire naturally.
     */
    @Transactional
    public void changePassword(Long userId, String currentPassword, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException(ErrorCode.INVALID_CREDENTIALS, "Current password is incorrect");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "New password must be different");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
    }

    /**
     * Changes the signed-in user's login email after verifying their current password.
     * Returns a fresh token pair so the browser stores a JWT with the new email claim.
     */
    @Transactional
    public AuthResponse changeEmail(Long userId, String currentPassword, String newEmail) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException(ErrorCode.INVALID_CREDENTIALS, "Current password is incorrect");
        }

        String normalizedEmail = newEmail.trim();
        if (user.getEmail().equalsIgnoreCase(normalizedEmail)) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR, "New email must be different");
        }
        userRepository.findByEmailIgnoreCase(normalizedEmail)
                .filter(existing -> !existing.getId().equals(userId))
                .ifPresent(existing -> {
                    throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email is already registered");
                });

        user.setEmail(normalizedEmail);
        refreshTokenRepository.revokeAllForUser(userId);
        return issueTokens(CustomUserDetails.from(user), user);
    }

    @Transactional
    public UserResponse updateProfile(Long userId, String fullName, String phone) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
        user.setFullName(fullName.trim());
        user.setPhone(phone == null || phone.isBlank() ? null : phone.trim());
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public UserResponse currentUser(Long userId) {
        return userRepository.findById(userId)
                .map(UserResponse::from)
                .orElseThrow(() -> ResourceNotFoundException.of("User", userId));
    }

    /**
     * Issues a session for a user who has just proved themselves by some route other than typing
     * a password — currently only accepting a staff invite, where the member set the password a
     * moment ago and bouncing them to a login screen to retype it would be pointless friction.
     *
     * <p>Callers are responsible for having authenticated the user; this method does not check
     * credentials.
     */
    @Transactional
    public AuthResponse issueSessionFor(User user) {
        return issueTokens(CustomUserDetails.from(user), user);
    }

    private AuthResponse issueTokens(CustomUserDetails principal, User user) {
        String accessToken = jwtService.generateAccessToken(principal);
        String refreshToken = createRefreshToken(user.getId());
        return AuthResponse.of(accessToken, refreshToken, jwtService.getAccessTtlSeconds(),
                UserResponse.from(user));
    }

    private String createRefreshToken(Long userId) {
        RefreshToken token = new RefreshToken();
        token.setUserId(userId);
        token.setToken(Tokens.random(48));
        token.setExpiresAt(Instant.now().plus(refreshTtlDays, ChronoUnit.DAYS));
        token.setRevoked(false);
        token.setCreatedAt(Instant.now());
        refreshTokenRepository.save(token);
        return token.getToken();
    }
}
