package com.cafeqr.plans;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.plans.domain.PricingPlan;
import com.cafeqr.plans.dto.PricingPlanResponse;
import com.cafeqr.plans.dto.UpdatePlanRequest;
import com.cafeqr.plans.repository.PricingPlanRepository;
import com.cafeqr.subscriptions.SubscriptionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class PricingPlanService {

    private final PricingPlanRepository planRepository;
    private final SubscriptionService subscriptions;
    private final AuditService audit;

    public PricingPlanService(PricingPlanRepository planRepository,
                              SubscriptionService subscriptions,
                              AuditService audit) {
        this.planRepository = planRepository;
        this.subscriptions = subscriptions;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<PricingPlanResponse> list() {
        return planRepository.findAllByOrderByDisplayOrderAscIdAsc().stream()
                .map(PricingPlanResponse::from)
                .toList();
    }

    /**
     * Edit a tier's pricing. The tier identity itself is fixed — only the name, money fields,
     * and visibility can change.
     *
     * <p>A null monthlyPrice means "custom", and only ENTERPRISE may be custom. STANDARD and
     * PRO are list-price tiers: a café is quoted the number on the pricing page, and a tier with
     * no price is a tier whose subscriptions have nothing to be derived from.
     *
     * <p>Changing a list price changes what the cafés on that tier pay, right away — the same
     * way a tick on the feature grid changes what they can open. Leaving the existing rows
     * behind would put the catalogue and the subscriptions back into disagreement, which is the
     * bug this whole area was rewritten to remove. It is audited for that reason: it is a
     * decision about live money that leaves no other trace.
     */
    @Transactional
    public PricingPlanResponse update(Long id, UpdatePlanRequest request) {
        PricingPlan plan = planRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Plan", id));
        BigDecimal priceBefore = plan.getMonthlyPrice();
        if (request.name() != null) {
            plan.setName(request.name().trim());
        }
        if (request.clearMonthlyPrice()) {
            if (plan.getTier() != Plan.ENTERPRISE) {
                throw new BadRequestException(
                        "Only the Enterprise tier can have a custom price. "
                                + plan.getTier() + " needs a monthly price.");
            }
            plan.setMonthlyPrice(null);
        } else if (request.monthlyPrice() != null) {
            plan.setMonthlyPrice(request.monthlyPrice());
        }
        BigDecimal priceAfter = plan.getMonthlyPrice();
        // Either side can be null — ENTERPRISE moves between "custom" and a number — so the
        // comparison has to survive both, not just the one that reads naturally.
        boolean priceMoved = priceBefore == null
                ? priceAfter != null
                : priceAfter == null || priceAfter.compareTo(priceBefore) != 0;
        if (priceMoved) {
            int moved = subscriptions.repriceTier(plan.getTier());
            audit.record(AuditAction.PLAN_PRICE_CHANGED, "PLAN", plan.getId(), plan.getTier().name(),
                    money(priceBefore) + " → " + money(priceAfter) + " monthly"
                            + (moved > 0 ? ", repriced " + moved + " subscription"
                                    + (moved == 1 ? "" : "s") : ", no subscriptions affected"));
        }
        if (request.setupFee() != null) {
            plan.setSetupFee(request.setupFee());
        }
        if (request.active() != null) {
            plan.setActive(request.active());
        }
        if (request.displayOrder() != null) {
            plan.setDisplayOrder(request.displayOrder());
        }
        return PricingPlanResponse.from(plan);
    }

    private static String money(BigDecimal value) {
        return value == null ? "custom" : value.toPlainString();
    }
}
