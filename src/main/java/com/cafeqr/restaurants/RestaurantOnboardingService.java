package com.cafeqr.restaurants;

import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.branches.repository.BranchRepository;
import com.cafeqr.common.config.AppProperties;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.util.Names;
import com.cafeqr.common.util.Pasted;
import com.cafeqr.notifications.email.EmailMessage;
import com.cafeqr.notifications.email.EmailSender;
import com.cafeqr.notifications.email.EmailTemplate;
import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.dto.CreateRestaurantRequest;
import com.cafeqr.restaurants.dto.RestaurantResponse;
import com.cafeqr.subscriptions.SubscriptionService;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.PaymentMethod;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import com.cafeqr.subscriptions.repository.SubscriptionRepository;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.Optional;

/**
 * Admin-only onboarding &amp; renewal — replaces the deleted self-serve onboarding service.
 * Exposes a one-shot {@link #onboard(CreateRestaurantRequest)} that creates the restaurant,
 * a default branch, an active owner account, and a {@code TRIAL} subscription in a single
 * transaction, plus {@link #renew(Long, Long)} that extends a café's term.
 *
 * <p>No public endpoints: callers must be {@code PLATFORM_ADMIN}. All bank-transfer
 * pricing/reference comes from the shared {@link AppProperties.Billing} config (the single
 * source of truth also used by the subscription lifecycle job).
 */
@Service
public class RestaurantOnboardingService {

    private final RestaurantService restaurantService;
    private final BranchService branchService;
    private final BranchRepository branchRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionService subscriptionService;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;
    private final EmailSender email;

    public RestaurantOnboardingService(RestaurantService restaurantService,
                                      BranchService branchService,
                                      BranchRepository branchRepository,
                                      UserRepository userRepository,
                                      SubscriptionRepository subscriptionRepository,
                                      SubscriptionService subscriptionService,
                                      PasswordEncoder passwordEncoder,
                                      AppProperties props,
                                      EmailSender email) {
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.branchRepository = branchRepository;
        this.userRepository = userRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.subscriptionService = subscriptionService;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.email = email;
    }

    /**
     * Creates the restaurant (active), optionally a first branch, optionally an active owner
     * user, and a {@code TRIAL} subscription. Any of the optional pieces can be skipped —
     * the admin can complete them later from the drawer.
     */
    @Transactional
    public RestaurantResponse onboard(CreateRestaurantRequest request) {
        if (request.owner() != null
                && request.owner().email() != null
                && !request.owner().email().isBlank()
                && userRepository.existsByEmailIgnoreCase(Pasted.identifier(request.owner().email()))) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email already registered");
        }

        RestaurantResponse restaurant = restaurantService.create(request);
        Long restaurantId = restaurant.id();

        // Owner has full restaurant control (Pro-or-above features included) but not the platform-wide permission.
        if (request.owner() != null) {
            CreateRestaurantRequest.Owner o = request.owner();
            User owner = new User();
            Names.applyOnCreate(owner, o.fullName(), o.fullNameEn(), o.fullNameAr());
            owner.setEmail(o.email());
            owner.setPhone(o.phone());
            owner.setUsername(o.email());
            owner.setPasswordHash(passwordEncoder.encode(o.password()));
            owner.setOwner(true);
            owner.setPermissions(EnumSet.copyOf(Permission.ownerSet()));
            owner.setRestaurantId(restaurantId);
            owner.setActive(true);
            userRepository.save(owner);
        }

        // First branch — defaults to the café's name in both languages, so a branch nobody has
        // renamed yet reads correctly in either UI. An explicit name is filed by its own script.
        boolean namedByAdmin = request.defaultBranchName() != null && !request.defaultBranchName().isBlank();
        branchService.create(restaurantId, namedByAdmin
                ? new com.cafeqr.branches.dto.CreateBranchRequest(
                        request.defaultBranchName(), null, null, null, null, null)
                : new com.cafeqr.branches.dto.CreateBranchRequest(
                        null, restaurant.nameEn(), restaurant.nameAr(), null, null, null));

        // Create a TRIAL subscription so the drawer has something to renew/extend.
        // The admin edits the price/cycle/status in the drawer afterwards.
        Subscription subscription = new Subscription();
        subscription.setRestaurantId(restaurantId);
        // The tier the café was created on. It used to be the config's billing.planName, which
        // defaulted to "Annual" — a billing cycle written into the plan field, next to the
        // billing_cycle column set on the very next line.
        subscription.setTier(restaurant.plan() != null ? restaurant.plan() : Plan.STANDARD);
        subscription.setBillingCycle(BillingCycle.YEARLY);
        // The tier's list price for this cycle — the same rule the subscription editor applies.
        // This used to be app.billing.price (29.000), a number belonging to no tier at all.
        subscription.setPrice(subscriptionService.listPrice(subscription.getTier(), BillingCycle.YEARLY));
        subscription.setStatus(SubscriptionStatus.TRIAL);
        subscription.setStartDate(LocalDate.now());
        subscription.setEndDate(LocalDate.now(ZoneId.systemDefault()).plusMonths(termMonths()));
        subscription.setPaymentMethod(PaymentMethod.BANK_TRANSFER);
        subscriptionRepository.save(subscription);

        // Best-effort "you're live" email — failures skip silently (the café is still provisioned).
        if (request.owner() != null && request.owner().email() != null) {
            String enName = Names.preferring(restaurant.nameEn(), restaurant.nameAr(), restaurant.name(), false);
            String arName = Names.preferring(restaurant.nameEn(), restaurant.nameAr(), restaurant.name(), true);
            String ownerEn = Names.preferring(request.owner().fullNameEn(), request.owner().fullNameAr(), request.owner().fullName(), false);
            String ownerAr = Names.preferring(request.owner().fullNameEn(), request.owner().fullNameAr(), request.owner().fullName(), true);
            try {
                email.send(new EmailMessage(request.owner().email(),
                        "Welcome to Serva. — " + enName + " is live",
                        EmailTemplate.build()
                                .line("Hi <strong>" + ownerEn + "</strong>,")
                                .line("Your café <strong>" + enName + "</strong> is set up on Serva.")
                                .line("Sign in with the email you gave the Serva team to start taking orders.")
                                .button((props.publicBaseUrl() != null ? props.publicBaseUrl() : "") + "/login",
                                        "Sign in")
                                .divider().rtl()
                                .line("مرحباً <strong>" + ownerAr + "</strong>،")
                                .line("مقهاك <strong>" + arName + "</strong> أصبح جاهزاً على Serva.")
                                .line("سجّل الدخول بالبريد الذي أعطيته لفريق Serva لبدء استقبال الطلبات.")
                                .html(),
                        "Welcome to Serva — " + enName + " is live.\n— Serva"));
            } catch (Exception ignored) { /* send is best-effort */ }
        }

        return restaurant;
    }

    /**
     * Extends the café's current term by another period (default 12 months) and re-activates
     * it if it had lapsed. Renewing early stacks onto remaining time (no lost days).
     */
    @Transactional
    public RestaurantResponse renew(Long restaurantId) {
        Subscription subscription = subscriptionRepository.findFirstByRestaurantIdOrderByIdDesc(restaurantId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No subscription found for restaurant " + restaurantId));
        if (subscription.getBillingCycle() == BillingCycle.ONE_TIME) {
            throw new BadRequestException("One-time subscriptions do not renew");
        }
        LocalDate today = LocalDate.now();
        LocalDate base = (subscription.getEndDate() != null && subscription.getEndDate().isAfter(today))
                ? subscription.getEndDate() : today;
        LocalDate newEnd = base.plusMonths(termMonths());
        subscription.setEndDate(newEnd);
        subscription.setStatus(SubscriptionStatus.ACTIVE);

        RestaurantResponse restaurant = restaurantService.setActive(restaurantId, true);
        activateOwners(restaurantId);

        // Best-effort "renewed" email to the owner.
        String enName = Names.preferring(restaurant.nameEn(), restaurant.nameAr(), restaurant.name(), false);
        String arName = Names.preferring(restaurant.nameEn(), restaurant.nameAr(), restaurant.name(), true);
        ownerOf(restaurantId).ifPresent(owner -> {
            if (owner.getEmail() == null || owner.getEmail().isBlank()) return;
            try {
                email.send(new EmailMessage(owner.getEmail(),
                        "Your Serva subscription is renewed — " + enName,
                        EmailTemplate.build()
                                .line("Hi <strong>" + Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), false) + "</strong>,")
                                .line("Your subscription for <strong>" + enName + "</strong> is renewed.")
                                .line("You're live until <strong>" + newEnd + "</strong>.")
                                .divider().rtl()
                                .line("مرحباً <strong>" + Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), true) + "</strong>،")
                                .line("تم تجديد اشتراكك لمقهى <strong>" + arName + "</strong>.")
                                .line("أنت نشط حتى <strong>" + newEnd + "</strong>.")
                                .html(),
                        "Your Serva subscription is renewed — live until " + newEnd + ".\n— Serva"));
            } catch (Exception ignored) { /* best-effort */ }
        });

        return restaurant;
    }

    // ---- helpers ----

    private void activateOwners(Long restaurantId) {
        userRepository.findByRestaurantIdOrderByIdAsc(restaurantId).stream()
                .filter(User::isOwner)
                .forEach(u -> u.setActive(true));
    }

    private Optional<User> ownerOf(Long restaurantId) {
        return userRepository.findFirstByRestaurantIdAndOwnerTrueOrderByIdAsc(restaurantId);
    }

    private int termMonths() {
        AppProperties.Subscription cfg = props.subscription();
        return cfg != null ? cfg.termMonthsOrDefault() : 12;
    }
}