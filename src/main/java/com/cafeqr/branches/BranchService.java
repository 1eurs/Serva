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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class BranchService {

    /** STANDARD buys one shop. Pricing has said so since launch; nothing enforced it. */
    private static final long STANDARD_BRANCH_ALLOWANCE = 1;

    private final BranchRepository branchRepository;
    private final RestaurantService restaurantService;
    private final AccessGuard accessGuard;
    private final Entitlements entitlements;

    public BranchService(BranchRepository branchRepository,
                         RestaurantService restaurantService,
                         AccessGuard accessGuard,
                         Entitlements entitlements) {
        this.branchRepository = branchRepository;
        this.restaurantService = restaurantService;
        this.accessGuard = accessGuard;
        this.entitlements = entitlements;
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
        return BranchResponse.from(branchRepository.save(branch));
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
        return BranchResponse.from(branch);
    }

    @Transactional
    public BranchResponse setActive(Long branchId, boolean active) {
        Branch branch = getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        branch.setActive(active);
        return BranchResponse.from(branch);
    }

    @Transactional
    public BranchResponse setAcceptingOrders(Long branchId, boolean acceptingOrders) {
        Branch branch = getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        branch.setAcceptingOrders(acceptingOrders);
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

    public void requireAcceptingOrders(Branch branch) {
        if (!branch.isAcceptingOrders()) {
            throw new BadRequestException(ErrorCode.BRANCH_NOT_ACCEPTING_ORDERS,
                    "This branch is not accepting orders right now");
        }
    }
}
