package com.cafeqr.branches;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.branches.dto.CreateBranchRequest;
import com.cafeqr.branches.dto.UpdateBranchRequest;
import com.cafeqr.branches.repository.BranchRepository;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ForbiddenException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.analytics.Entitlements;
import com.cafeqr.common.util.Names;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.till.domain.TillSession;
import com.cafeqr.till.repository.TillSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
public class BranchService {

    /** STANDARD buys one shop. Pricing has said so since launch; nothing enforced it. */
    private static final long STANDARD_BRANCH_ALLOWANCE = 1;

    /** What a café gets asked to explain, when it turns the question on without naming a figure. */
    private static final BigDecimal DEFAULT_NOTE_OVER = new BigDecimal("1.000");

    private final BranchRepository branchRepository;
    private final RestaurantService restaurantService;
    private final AccessGuard accessGuard;
    private final Entitlements entitlements;
    /**
     * The repository rather than TillService, deliberately: "can this shop sell right now" is
     * asked on the hot path of every order, needs one boolean, and routing it through the till
     * service would make the two modules depend on each other in both directions.
     */
    private final TillSessionRepository tillSessions;

    public BranchService(BranchRepository branchRepository,
                         RestaurantService restaurantService,
                         AccessGuard accessGuard,
                         Entitlements entitlements,
                         TillSessionRepository tillSessions) {
        this.branchRepository = branchRepository;
        this.restaurantService = restaurantService;
        this.accessGuard = accessGuard;
        this.entitlements = entitlements;
        this.tillSessions = tillSessions;
    }

    @Transactional
    public BranchResponse create(Long restaurantId, CreateBranchRequest request) {
        accessGuard.requireRestaurantAccess(restaurantId);
        // Opening a shop is a decision about the whole café, and every other verb here is
        // already confined to the caller's own branch. A branch manager holding BRANCHES — the
        // "Manager" preset in the team editor hands it out — could otherwise add branches they
        // then had no access to, and spend the café's plan allowance doing it.
        if (accessGuard.scopedBranchId() != null) {
            throw new ForbiddenException("Only staff who work across the whole café can open a branch");
        }
        restaurantService.getEntity(restaurantId); // ensure exists
        requireBranchAllowance(restaurantId);

        Branch branch = new Branch();
        branch.setRestaurantId(restaurantId);
        Names.applyOnCreate(branch, request.name(), request.nameEn(), request.nameAr());
        branch.setAddress(request.address());
        branch.setPhone(request.phone());
        branch.setOpeningHours(request.openingHours());
        branch.setActive(true);
        branch.setAcceptingOrders(true);
        Branch saved = branchRepository.save(branch);

        // A new shop opens selling, with an uncounted drawer — the same deal V67 gave every
        // branch that existed before the till did. Making a café count a float before its first
        // QR order would put a hidden step in the middle of onboarding, and a shop that cannot
        // sell on its opening day because nobody found a screen is worse than a session whose
        // opening figure is honestly zero. The first close is the first real count.
        TillSession firstSession = new TillSession();
        firstSession.setRestaurantId(restaurantId);
        firstSession.setBranchId(saved.getId());
        firstSession.setOpenedAt(Instant.now());
        firstSession.setOpeningFloat(BigDecimal.ZERO);
        tillSessions.save(firstSession);

        return BranchResponse.from(saved);
    }

    /**
     * A second shop is a Pro feature — the pricing page has sold "Single branch" on STANDARD
     * and "Multi-branch" on PRO since launch, and until now nothing in the code said so: a
     * STANDARD café could open branches without limit.
     *
     * <p>Only the count is capped, never an existing branch: a café that is already over the
     * allowance keeps every shop it has and simply cannot add another. Downgrading must not
     * silently switch a real counter off.
     *
     * <p>A platform admin passes, as they do on every other gate — {@code Entitlements} treats
     * an unscoped caller as Pro. Granting a café a branch it has not paid for stays possible,
     * but it becomes a deliberate act by a human rather than something the product forgot to ask.
     */
    private void requireBranchAllowance(Long restaurantId) {
        if (entitlements.has(Feature.MULTI_BRANCH)) {
            return;
        }
        if (branchRepository.countByRestaurantId(restaurantId) >= STANDARD_BRANCH_ALLOWANCE) {
            entitlements.require(Feature.MULTI_BRANCH); // throws with the right wording
        }
    }

    @Transactional(readOnly = true)
    public List<BranchResponse> listByRestaurant(Long restaurantId) {
        accessGuard.requireRestaurantAccess(restaurantId);
        return branchRepository.findByRestaurantIdOrderByNameAsc(restaurantId)
                .stream().map(BranchResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public BranchResponse get(Long branchId) {
        Branch branch = getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        return BranchResponse.from(branch);
    }

    @Transactional
    public BranchResponse update(Long branchId, UpdateBranchRequest request) {
        Branch branch = getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        Names.applyOnUpdate(branch, request.name(), request.nameEn(), request.nameAr());
        if (request.address() != null) {
            branch.setAddress(request.address());
        }
        if (request.phone() != null) {
            branch.setPhone(request.phone());
        }
        if (request.openingHours() != null) {
            branch.setOpeningHours(request.openingHours());
        }
        if (request.printerEnabled() != null) {
            branch.setPrinterEnabled(request.printerEnabled());
        }
        if (request.counterMode() != null) {
            branch.setCounterMode(request.counterMode());
        }
        applyTillSettings(branch, request);
        return BranchResponse.from(branch);
    }

    /**
     * How this shop runs its drawer.
     *
     * <p>Turning the till off does not close the open session — it stops the till being asked
     * about, and leaves the session sitting there to be closed properly (or found again when
     * the café changes its mind). Deleting a count because somebody flipped a settings switch
     * is how a day's cash quietly stops existing.
     */
    private void applyTillSettings(Branch branch, UpdateBranchRequest request) {
        if (request.tillEnabled() != null) {
            branch.setTillEnabled(request.tillEnabled());
        }
        if (request.tillBlindCount() != null) {
            branch.setTillBlindCount(request.tillBlindCount());
        }
        if (request.tillCarryFloat() != null) {
            branch.setTillCarryFloat(request.tillCarryFloat());
        }
        // The threshold and the switch that turns it off are two fields for one setting, because
        // a PATCH cannot tell "leave it alone" from "clear it" with a null.
        if (Boolean.FALSE.equals(request.tillNoteRequired())) {
            branch.setTillNoteOver(null);
        } else if (request.tillNoteOver() != null) {
            branch.setTillNoteOver(request.tillNoteOver());
        } else if (Boolean.TRUE.equals(request.tillNoteRequired()) && branch.getTillNoteOver() == null) {
            branch.setTillNoteOver(DEFAULT_NOTE_OVER);
        }
    }

    @Transactional
    public BranchResponse setActive(Long branchId, boolean active) {
        Branch branch = getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        branch.setActive(active);
        return BranchResponse.from(branch);
    }

    /**
     * Pause or resume customer ordering — the break in the middle of a shift.
     *
     * <p>Resuming into a closed till is refused rather than quietly granted: the switch would
     * say "accepting orders" over a shop that cannot take one, which is exactly the gap between
     * the button and reality this whole thing exists to close.
     *
     * @param pauseMinutes how long the pause lasts before lifting itself; null means until
     *                     somebody resumes.
     */
    @Transactional
    public BranchResponse setAcceptingOrders(Long branchId, boolean acceptingOrders, Integer pauseMinutes) {
        Branch branch = getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        if (acceptingOrders) {
            requireTillOpen(branch);
        }
        // Order matters: the setter ends whatever pause was running, so the new expiry is set
        // after it rather than being wiped by it.
        branch.setAcceptingOrders(acceptingOrders);
        if (!acceptingOrders && pauseMinutes != null) {
            branch.setPauseUntil(Instant.now().plus(Duration.ofMinutes(pauseMinutes)));
        }
        return BranchResponse.from(branch);
    }

    // ---- helpers shared with other modules ----

    @Transactional(readOnly = true)
    public Branch getEntity(Long branchId) {
        return branchRepository.findById(branchId)
                .orElseThrow(() -> ResourceNotFoundException.of("Branch", branchId));
    }

    /** Loads a branch and validates it belongs to the given restaurant. */
    @Transactional(readOnly = true)
    public Branch getEntityInRestaurant(Long restaurantId, Long branchId) {
        Branch branch = getEntity(branchId);
        if (!branch.getRestaurantId().equals(restaurantId)) {
            throw new ResourceNotFoundException("Branch " + branchId + " not found in restaurant " + restaurantId);
        }
        return branch;
    }

    public void requireActive(Branch branch) {
        if (!branch.isActive()) {
            throw new BadRequestException(ErrorCode.BRANCH_INACTIVE, "Branch is not active");
        }
    }

    /**
     * The customer's question: can I order from this shop, right now.
     *
     * <p>Two things can say no — the drawer is not open, or the counter is paused — and the
     * customer is told the same thing either way. Why the café is not selling is the café's
     * business, and a phone at a table can do nothing with the difference.
     */
    public void requireAcceptingOrders(Branch branch) {
        if (!isTillOpen(branch) || !branch.isAcceptingOrdersNow()) {
            throw new BadRequestException(ErrorCode.BRANCH_NOT_ACCEPTING_ORDERS,
                    "This branch is not accepting orders right now");
        }
    }

    /**
     * The counter's question, which is only the drawer: staff keep serving through a pause —
     * that is what a pause is for — but not through a closed till, because there is nowhere for
     * the money to go and nothing that would ever be counted against it.
     *
     * <p>Its own error code, unlike the customer's: the person reading this one is standing at
     * the till and can open it.
     */
    public void requireTillOpen(Branch branch) {
        if (!isTillOpen(branch)) {
            throw new BadRequestException(ErrorCode.TILL_CLOSED,
                    "The till is closed. Open it to start taking orders.");
        }
    }

    /**
     * The same answer {@link #requireAcceptingOrders} gives, as a boolean rather than a throw —
     * for the customer's menu, which has to know before it draws an Add button rather than
     * after the basket is full.
     */
    @Transactional(readOnly = true)
    public boolean canOrderNow(Branch branch) {
        return branch.isActive() && isTillOpen(branch) && branch.isAcceptingOrdersNow();
    }

    /** A café that runs no drawer is always open in the till's eyes; it opted out of the question. */
    private boolean isTillOpen(Branch branch) {
        return !branch.isTillEnabled() || tillSessions.existsByBranchIdAndClosedAtIsNull(branch.getId());
    }
}
