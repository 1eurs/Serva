package com.cafeqr.branches;

import com.cafeqr.analytics.Entitlements;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.branches.dto.CreateBranchRequest;
import com.cafeqr.branches.repository.BranchRepository;
import com.cafeqr.common.exception.ForbiddenException;
import com.cafeqr.common.exception.PlanRequiredException;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.restaurants.RestaurantService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * "Single branch" on Standard, "Multi-branch" on Pro — what the pricing page has said since
 * launch, and what nothing in the code enforced: a STANDARD café could open branches without
 * limit, and three of the platform's cafés had done exactly that.
 *
 * <p>The allowance is now asked as a feature — {@code MULTI_BRANCH} — so which tier covers it
 * is a tick on the Plans page rather than a comparison compiled into this service.
 */
class StandardBranchAllowanceTest {

    private static final long CAFE = 7L;

    private BranchRepository branches;
    private Entitlements entitlements;
    private AccessGuard accessGuard;
    private BranchService service;

    @BeforeEach
    void setUp() {
        branches = mock(BranchRepository.class);
        entitlements = mock(Entitlements.class);
        accessGuard = mock(AccessGuard.class);
        RestaurantService restaurantService = mock(RestaurantService.class);
        // Every case below is an owner or manager who works across the café. Said out loud
        // because a mocked Long answers 0, not null, and 0 would read as "pinned to a branch".
        when(accessGuard.scopedBranchId()).thenReturn(null);
        when(branches.save(any(Branch.class))).thenAnswer(i -> i.getArgument(0));
        service = new BranchService(branches, restaurantService, accessGuard, entitlements);
    }

    /**
     * Opening a shop is a decision about the whole café. Every other verb on a branch is already
     * confined to the caller's own, and the team editor's "Manager" preset hands out BRANCHES —
     * so without this a branch manager could add shops they then had no access to.
     */
    @Test
    void aBranchManagerCannotOpenAnother() {
        when(accessGuard.scopedBranchId()).thenReturn(3L);
        when(entitlements.has(Feature.MULTI_BRANCH)).thenReturn(true);

        assertThatThrownBy(() -> service.create(CAFE, branch("Third")))
                .isInstanceOf(ForbiddenException.class);
        verify(branches, never()).save(any());
    }

    /** The real gate refuses by throwing out of require(); a mock has to be told to. */
    private void withoutMultiBranch() {
        when(entitlements.has(Feature.MULTI_BRANCH)).thenReturn(false);
        doThrow(new PlanRequiredException("Your plan covers one branch. Upgrade to open another."))
                .when(entitlements).require(Feature.MULTI_BRANCH);
    }

    private static CreateBranchRequest branch(String name) {
        return new CreateBranchRequest(name, name, name, null, null, null);
    }

    @Test
    void aStandardCafeGetsItsFirstBranch() {
        withoutMultiBranch();
        when(branches.countByRestaurantId(CAFE)).thenReturn(0L);

        assertThat(service.create(CAFE, branch("Qurum"))).isNotNull();
    }

    @Test
    void aStandardCafeIsRefusedASecond() {
        withoutMultiBranch();
        when(branches.countByRestaurantId(CAFE)).thenReturn(1L);

        assertThatThrownBy(() -> service.create(CAFE, branch("Mutrah")))
                .isInstanceOf(PlanRequiredException.class)
                .hasMessageContaining("one branch");
        verify(branches, never()).save(any());
    }

    @Test
    void aTierThatIncludesMultiBranchKeepsOpeningThem() {
        when(entitlements.has(Feature.MULTI_BRANCH)).thenReturn(true);
        when(branches.countByRestaurantId(CAFE)).thenReturn(4L);

        assertThat(service.create(CAFE, branch("Seeb"))).isNotNull();
    }

    /**
     * A café already over the allowance — every one of them, the day this shipped — keeps the
     * shops it has. The cap is on adding, never on what already exists: a downgrade must not
     * silently switch a real counter off.
     */
    @Test
    void anExistingSecondBranchIsNeverTakenAway() {
        withoutMultiBranch();
        when(branches.countByRestaurantId(CAFE)).thenReturn(3L);

        assertThatThrownBy(() -> service.create(CAFE, branch("Fourth")))
                .isInstanceOf(PlanRequiredException.class);

        // Nothing was deleted or deactivated on the way to refusing the new one.
        verify(branches, never()).delete(any());
        verify(branches, never()).deleteById(anyLong());
    }
}
