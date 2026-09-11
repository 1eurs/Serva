package com.cafeqr.analytics;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.PlanRequiredException;
import com.cafeqr.plans.PlanFeatureService;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Plan;
import org.springframework.stereotype.Component;

import java.util.EnumSet;

/**
 * Does the caller's café include this feature?
 *
 * <p>The answer used to be a comparison written here — {@code plan == PRO || plan == ENTERPRISE}
 * — which meant every gated endpoint asked the same question and a tier could not include
 * loyalty without also including every Pro analytic. It is now a lookup in the tier/feature grid
 * a platform admin edits on the Plans page, so what a tier covers is a pricing decision rather
 * than a deploy.
 *
 * <p>A platform admin has no café of their own and is granted everything, so they can see what
 * they are selling. That is the only case that opens the gate without consulting the grid, and
 * it is decided by "there is no café here" — never by a café whose tier failed to load.
 */
@Component
public class Entitlements {

    private final AccessGuard accessGuard;
    private final RestaurantService restaurantService;
    private final PlanFeatureService planFeatures;

    public Entitlements(AccessGuard accessGuard,
                        RestaurantService restaurantService,
                        PlanFeatureService planFeatures) {
        this.accessGuard = accessGuard;
        this.restaurantService = restaurantService;
        this.planFeatures = planFeatures;
    }

    /**
     * Everything the caller can reach, resolved in one pass.
     *
     * <p>Asked directly by the endpoint that hands the dashboard its feature list — six calls to
     * {@link #has} would be six reads of the same café row for one answer.
     *
     * <p>A café whose tier is somehow absent gets nothing rather than everything. The column is
     * {@code NOT NULL} so this should be unreachable, which is exactly why it is worth being
     * explicit about: the fallback for "we could not tell" must not be the same as the fallback
     * for "this is a platform admin", or a broken read becomes a free upgrade.
     */
    public EnumSet<Feature> included() {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) {
            return EnumSet.allOf(Feature.class); // platform admin — no café, sees the lot
        }
        Plan tier = restaurantService.getEntity(restaurantId).getPlan();
        return tier == null ? EnumSet.noneOf(Feature.class) : planFeatures.includedFor(tier);
    }

    /** True if the caller's café includes this feature (or the caller is a platform admin). */
    public boolean has(Feature feature) {
        return included().contains(feature);
    }

    /** Throws 402 PLAN_REQUIRED unless the caller's café includes this feature. */
    public void require(Feature feature) {
        if (!has(feature)) {
            throw new PlanRequiredException(upgradeMessage(feature));
        }
    }

    /**
     * What to tell a café that has just been refused.
     *
     * <p>Names the thing they were reaching for rather than the tier they are on, because the
     * grid means the tier that unlocks it is no longer fixed — telling somebody to "upgrade to
     * Pro" is a sentence that can go out of date the next time the Plans page is edited.
     */
    private static String upgradeMessage(Feature feature) {
        return switch (feature) {
            case PRO_ANALYTICS -> "This insight is not part of your plan. Upgrade to unlock it.";
            case FULL_HISTORY -> "Your plan covers a recent window. Upgrade to query any date range.";
            case LOYALTY -> "Loyalty is not part of your plan. Upgrade to run a programme.";
            case MULTI_BRANCH -> "Your plan covers one branch. Upgrade to open another.";
            case QR_CUSTOMIZATION -> "Customising the QR badge is not part of your plan.";
        };
    }
}
