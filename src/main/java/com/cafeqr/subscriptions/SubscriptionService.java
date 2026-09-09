package com.cafeqr.subscriptions;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.util.Names;
import com.cafeqr.plans.domain.PricingPlan;
import com.cafeqr.plans.repository.PricingPlanRepository;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.PaymentMethod;
import com.cafeqr.subscriptions.domain.SubscriptionPayment;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import com.cafeqr.subscriptions.dto.BillingOverviewResponse;
import com.cafeqr.subscriptions.dto.BillingRow;
import com.cafeqr.subscriptions.dto.CreateSubscriptionRequest;
import com.cafeqr.subscriptions.dto.RecordPaymentRequest;
import com.cafeqr.subscriptions.dto.SubscriptionPaymentResponse;
import com.cafeqr.subscriptions.dto.SubscriptionResponse;
import com.cafeqr.subscriptions.dto.UpdateSubscriptionRequest;
import com.cafeqr.subscriptions.repository.SubscriptionPaymentRepository;
import com.cafeqr.subscriptions.repository.SubscriptionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SubscriptionService {

    /** Money is stored and totalled at three decimals — OMR is a 1000-baisa currency. */
    private static final int MONEY_SCALE = 3;
    /** A term inside this window is "expiring soon" — long enough to chase a bank transfer. */
    private static final int EXPIRING_SOON_DAYS = 14;

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionPaymentRepository paymentRepository;
    private final RestaurantService restaurantService;
    private final RestaurantRepository restaurantRepository;
    private final PricingPlanRepository pricingPlans;
    private final AuditService audit;

    public SubscriptionService(SubscriptionRepository subscriptionRepository,
                               SubscriptionPaymentRepository paymentRepository,
                               RestaurantService restaurantService,
                               RestaurantRepository restaurantRepository,
                               PricingPlanRepository pricingPlans,
                               AuditService audit) {
        this.pricingPlans = pricingPlans;
        this.subscriptionRepository = subscriptionRepository;
        this.paymentRepository = paymentRepository;
        this.restaurantService = restaurantService;
        this.restaurantRepository = restaurantRepository;
        this.audit = audit;
    }

    @Transactional
    public SubscriptionResponse create(Long restaurantId, CreateSubscriptionRequest request) {
        restaurantService.getEntity(restaurantId); // ensure exists

        Subscription subscription = new Subscription();
        subscription.setRestaurantId(restaurantId);
        subscription.setTier(request.tier());
        subscription.setBillingCycle(request.billingCycle());
        subscription.setPrice(priceFor(request.tier(), request.billingCycle(), request.price()));
        subscription.setStatus(request.status() != null ? request.status() : defaultStatus(request.billingCycle()));
        subscription.setStartDate(request.startDate() != null ? request.startDate() : LocalDate.now());
        subscription.setEndDate(request.billingCycle() == BillingCycle.ONE_TIME ? null : request.endDate());
        Subscription saved = subscriptionRepository.save(subscription);
        applyTier(restaurantId, saved.getTier());
        return SubscriptionResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public SubscriptionResponse getForRestaurant(Long restaurantId) {
        return subscriptionRepository.findFirstByRestaurantIdOrderByIdDesc(restaurantId)
                .map(SubscriptionResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No subscription found for restaurant " + restaurantId));
    }

    @Transactional
    public SubscriptionResponse update(Long id, UpdateSubscriptionRequest request) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Subscription", id));
        if (request.tier() != null) {
            subscription.setTier(request.tier());
        }
        BillingCycle cycle = request.billingCycle() != null ? request.billingCycle() : subscription.getBillingCycle();
        if (request.billingCycle() != null) {
            subscription.setBillingCycle(cycle);
        }
        // Tier and cycle both feed the price, so it is recomputed after either moves — not only
        // when a price was typed. Otherwise upgrading a café to PRO left it on the STANDARD fee.
        //
        // The price already on the row stands in for one nobody typed. That only matters for
        // ENTERPRISE, where the number IS the agreement: a PATCH that touches nothing but the
        // status would otherwise hand priceFor a null and wipe a negotiated fee to zero. For
        // the list-price tiers it changes nothing — the request's price is ignored either way.
        BigDecimal wanted = request.price() != null ? request.price() : subscription.getPrice();
        subscription.setPrice(priceFor(subscription.getTier(), cycle, wanted));
        if (request.status() != null) {
            subscription.setStatus(request.status());
        }
        if (request.startDate() != null) {
            subscription.setStartDate(request.startDate());
        }
        if (cycle == BillingCycle.ONE_TIME) {
            subscription.setEndDate(null);
            subscription.setLastReminderOn(null);
        } else if (request.endDate() != null) {
            subscription.setEndDate(request.endDate());
        }
        applyTier(subscription.getRestaurantId(), subscription.getTier());
        return SubscriptionResponse.from(subscription);
    }

    /**
     * What a subscription costs.
     *
     * <p>Only ENTERPRISE is negotiable. STANDARD and PRO are list-price tiers — the number on
     * the pricing page is the number the café pays — so their price is derived from the
     * catalogue rather than typed, and a supplied price is ignored rather than honoured. Before
     * this, every tier had a free-text price box, so a PRO café could sit on 18 OMR against a
     * 20 OMR list price with nothing anywhere recording that it was a deal.
     *
     * <p>The catalogue holds a monthly figure; a yearly term is twelve of them. ONE_TIME has no
     * catalogue basis at all — a lifetime deal is a negotiation by definition — so it is
     * refused for the list-price tiers rather than given an invented number.
     *
     * <p>{@link #listPrice} exposes the same rule to onboarding, which builds a café's first
     * subscription itself. That path used to take its number from a config default
     * ({@code app.billing.price}, 29.000) and so handed every new café a price that matched no
     * tier on the pricing page.
     */
    public BigDecimal listPrice(Plan tier, BillingCycle cycle) {
        return priceFor(tier, cycle, null);
    }

    /**
     * Move every subscription on a list-price tier onto the tier's current price.
     *
     * <p>Called when a platform admin edits the catalogue. Without it the catalogue and the
     * subscriptions become two writable sources for one number again — the exact shape of bug
     * that had a café gated PRO while billed at the STANDARD price — because the derived price
     * is only applied when somebody happens to edit that café's subscription.
     *
     * <p>"The list price is the price" has to mean the cafés on the tier, not just the next one
     * to be edited. ENTERPRISE is skipped: its price is a negotiation, not a lookup. ONE_TIME is
     * skipped for the same reason — there is nothing in the catalogue to derive it from.
     *
     * @return how many subscriptions actually moved
     */
    @Transactional
    public int repriceTier(Plan tier) {
        if (tier == null || tier == Plan.ENTERPRISE) {
            return 0;
        }
        int moved = 0;
        for (Subscription subscription : subscriptionRepository.findByTier(tier)) {
            if (subscription.getBillingCycle() == BillingCycle.ONE_TIME) {
                continue;
            }
            BigDecimal current = listPrice(tier, subscription.getBillingCycle());
            if (subscription.getPrice() == null || subscription.getPrice().compareTo(current) != 0) {
                subscription.setPrice(current);
                moved++;
            }
        }
        return moved;
    }

    private BigDecimal priceFor(Plan tier, BillingCycle cycle, BigDecimal requested) {
        if (tier == Plan.ENTERPRISE) {
            // Nothing to derive it from — a brand new enterprise deal starts at zero and waits
            // for the number the two sides agreed. Callers that already have one pass it in.
            return requested != null ? scale(requested) : BigDecimal.ZERO;
        }
        if (cycle == BillingCycle.ONE_TIME) {
            throw new BadRequestException(
                    "A one-time price is negotiated, so it needs the Enterprise tier. "
                            + tier + " bills monthly or yearly.");
        }
        BigDecimal monthly = pricingPlans.findByTier(tier)
                .map(PricingPlan::getMonthlyPrice)
                .orElseThrow(() -> new BadRequestException(
                        "No price is set for the " + tier + " tier. Set it on the Plans page first."));
        if (monthly == null) {
            throw new BadRequestException(
                    "The " + tier + " tier has no monthly price. Only Enterprise can be custom.");
        }
        return scale(cycle == BillingCycle.YEARLY ? monthly.multiply(BigDecimal.valueOf(12)) : monthly);
    }

    /**
     * Mirrors a subscription's tier onto its café.
     *
     * <p>{@code restaurants.plan} is what {@link com.cafeqr.analytics.Entitlements} reads on
     * every gated request, so it stays a column rather than a join. That makes it a cache, and
     * the only way a cache does not rot is if exactly one place writes it — this method, called
     * from every path that can change a tier. The café-side setter it replaces
     * ({@code PATCH /restaurants/{id}/plan}) is gone for the same reason: it let an admin move
     * the gate without moving the bill, which is how a café came to be gated PRO while its
     * subscription said "Standard" and it paid the Standard price.
     */
    private void applyTier(Long restaurantId, Plan tier) {
        if (tier == null) {
            return;
        }
        restaurantRepository.findById(restaurantId).ifPresent(cafe -> {
            Plan before = cafe.getPlan();
            if (before == tier) {
                return;
            }
            cafe.setPlan(tier);
            restaurantRepository.save(cafe);
            // PLAN_CHANGED used to be recorded by the café endpoint that set the gate directly.
            // The tier moves here now, so the log follows it — "PRO" a year from now still has
            // to say whether it was an upgrade somebody paid for or a downgrade they will call about.
            audit.recordCafe(AuditAction.PLAN_CHANGED, restaurantId,
                    Names.preferring(cafe.getNameEn(), cafe.getNameAr(), cafe.getName(), false),
                    before + " → " + tier);
        });
    }

    /**
     * Files money received against a subscription and, unless told otherwise, rolls the term
     * forward by one billing cycle and marks the café ACTIVE.
     *
     * <p>The term is extended from whichever is later: the current end date or today. Extending
     * from the end date means a café that pays early keeps the days it already bought; extending
     * from today means a café that pays two months late doesn't get a term that is already
     * half spent. Taking the later of the two gets both right.
     */
    @Transactional
    public SubscriptionPaymentResponse recordPayment(Long subscriptionId, RecordPaymentRequest request) {
        Subscription subscription = find(subscriptionId);
        LocalDate paidOn = request.paidOn() != null ? request.paidOn() : LocalDate.now();
        boolean extend = request.extendTerm() == null || request.extendTerm();

        SubscriptionPayment payment = new SubscriptionPayment();
        payment.setSubscriptionId(subscription.getId());
        payment.setRestaurantId(subscription.getRestaurantId());
        payment.setAmount(request.amount().setScale(MONEY_SCALE, RoundingMode.HALF_UP));
        payment.setMethod(request.method() != null ? request.method() : PaymentMethod.BANK_TRANSFER);
        payment.setReference(blankToNull(request.reference()));
        payment.setPaidOn(paidOn);
        payment.setNote(blankToNull(request.note()));
        payment.setRecordedBy(SecurityUtils.currentUserIdOrNull());

        if (extend) {
            if (subscription.getBillingCycle() != BillingCycle.ONE_TIME) {
                LocalDate newEnd = extendedTerm(subscription, paidOn);
                subscription.setEndDate(newEnd);
                // A fresh term means the reminder clock starts over.
                subscription.setLastReminderOn(null);
                payment.setCoversUntil(newEnd);
            }
            subscription.setStatus(SubscriptionStatus.ACTIVE);
            subscription.setPaymentMethod(payment.getMethod());
            // A payment recorded without a reference (cash in hand, a correction) must not erase
            // the reference of the transfer that is still the evidence for the current term.
            if (payment.getReference() != null) {
                subscription.setPaymentReference(payment.getReference());
            }
            subscription.setPaymentConfirmedAt(Instant.now());
            subscription.setPaymentConfirmedBy(payment.getRecordedBy());
        }
        SubscriptionPayment saved = paymentRepository.save(payment);
        audit.recordCafe(AuditAction.PAYMENT_RECORDED, subscription.getRestaurantId(),
                cafeName(subscription.getRestaurantId()),
                saved.getAmount().toPlainString() + " via " + saved.getMethod()
                        + (saved.getReference() != null ? " ref " + saved.getReference() : "")
                        + (saved.getCoversUntil() != null ? ", term now ends " + saved.getCoversUntil() : "")
                        + (extend ? "" : ", term left unchanged"));
        return SubscriptionPaymentResponse.from(saved);
    }

    /**
     * Where a payment moves the term to.
     *
     * <p>Onboarding hands a new café a TRIAL that already carries a full provisional term — that
     * date is the offer, not a gift on top of it. So the <em>first</em> payment confirms the term
     * the café was already given rather than adding a second one to it; otherwise paying for a
     * year would quietly buy two.
     *
     * <p>Every later payment extends from whichever is later, the current end date or the day the
     * money moved. Extending from the end date means a café that pays early keeps the days it
     * already bought; extending from today means a café that pays two months late doesn't get a
     * term that is already half spent. The later of the two gets both right.
     */
    static LocalDate extendedTerm(Subscription subscription, LocalDate paidOn) {
        boolean firstPayment = subscription.getPaymentConfirmedAt() == null;
        boolean provisionalTerm = subscription.getStatus() == SubscriptionStatus.TRIAL
                && subscription.getEndDate() != null
                && subscription.getEndDate().isAfter(paidOn);
        if (firstPayment && provisionalTerm) {
            return subscription.getEndDate();
        }
        LocalDate base = subscription.getEndDate() != null && subscription.getEndDate().isAfter(paidOn)
                ? subscription.getEndDate()
                : paidOn;
        return subscription.getBillingCycle() == BillingCycle.MONTHLY ? base.plusMonths(1) : base.plusYears(1);
    }

    @Transactional(readOnly = true)
    public List<SubscriptionPaymentResponse> paymentsForRestaurant(Long restaurantId) {
        return paymentRepository.findByRestaurantIdOrderByPaidOnDescIdDesc(restaurantId)
                .stream().map(SubscriptionPaymentResponse::from).toList();
    }

    /**
     * The whole billing board in one query set: every subscription, its café, and the money
     * totals across the top. Built in memory from three scans rather than per-café requests —
     * the console shows all cafés at once and would otherwise fire one request per row.
     */
    @Transactional(readOnly = true)
    public BillingOverviewResponse billingOverview() {
        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate lastMonthStart = monthStart.minusMonths(1);

        Map<Long, Restaurant> cafes = new HashMap<>();
        for (Restaurant r : restaurantRepository.findAll()) {
            cafes.put(r.getId(), r);
        }

        // Payment history folded per café: last payment date and lifetime total, so a row can
        // show "paid 240 OMR, last in March" without a second request.
        Map<Long, LocalDate> lastPaid = new HashMap<>();
        Map<Long, BigDecimal> paidTotal = new HashMap<>();
        for (SubscriptionPayment p : paymentRepository.findAll()) {
            lastPaid.merge(p.getRestaurantId(), p.getPaidOn(),
                    (a, b) -> a.isAfter(b) ? a : b);
            paidTotal.merge(p.getRestaurantId(), p.getAmount(), BigDecimal::add);
        }

        BigDecimal mrr = BigDecimal.ZERO;
        BigDecimal outstanding = BigDecimal.ZERO;
        long active = 0, trial = 0, pastDue = 0, expired = 0, cancelled = 0, expiringSoon = 0;
        List<BillingRow> rows = new ArrayList<>();

        for (Subscription s : subscriptionRepository.findAll()) {
            Restaurant cafe = cafes.get(s.getRestaurantId());
            if (cafe == null) {
                continue; // café deleted out from under its subscription; nothing to bill
            }
            Integer daysLeft = s.getEndDate() == null ? null
                    : (int) ChronoUnit.DAYS.between(today, s.getEndDate());
            BigDecimal monthly = monthlyValue(s);

            switch (s.getStatus()) {
                case ACTIVE -> active++;
                case TRIAL -> trial++;
                case PAST_DUE -> pastDue++;
                case EXPIRED -> expired++;
                case CANCELLED -> cancelled++;
            }
            if (countsTowardMrr(s)) {
                mrr = mrr.add(monthly);
            }
            boolean live = s.getStatus() == SubscriptionStatus.ACTIVE || s.getStatus() == SubscriptionStatus.TRIAL;
            if (live && daysLeft != null && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS) {
                expiringSoon++;
            }
            if (s.getStatus() == SubscriptionStatus.PAST_DUE || s.getStatus() == SubscriptionStatus.EXPIRED) {
                outstanding = outstanding.add(s.getPrice() != null ? s.getPrice() : BigDecimal.ZERO);
            }

            rows.add(new BillingRow(
                    s.getId(), cafe.getId(), cafe.getName(), cafe.getNameEn(), cafe.getNameAr(),
                    // The subscription's tier, not the café's mirror of it: this board is where
                    // a disagreement between the two would have to be spotted, so it reads the
                    // side that is authoritative.
                    cafe.getSlug(), cafe.isActive(), s.getTier(),
                    s.getBillingCycle(), s.getPrice(), monthly, s.getStatus(),
                    s.getStartDate(), s.getEndDate(), daysLeft,
                    s.getPaymentReference(), s.getPaymentConfirmedAt(),
                    lastPaid.get(cafe.getId()),
                    paidTotal.getOrDefault(cafe.getId(), BigDecimal.ZERO)));
        }

        // Most urgent first: whoever owes money at the top, then by how little time is left.
        // Cancelled and lifetime cafés sink to the bottom — neither is a deadline.
        rows.sort((a, b) -> {
            boolean aDead = a.status() == SubscriptionStatus.CANCELLED || a.daysLeft() == null;
            boolean bDead = b.status() == SubscriptionStatus.CANCELLED || b.daysLeft() == null;
            if (aDead != bDead) return aDead ? 1 : -1;
            if (aDead) return 0;
            return Integer.compare(a.daysLeft(), b.daysLeft());
        });

        BigDecimal thisMonth = scale(paymentRepository.totalCollected(monthStart, today));
        BigDecimal lastMonth = scale(paymentRepository.totalCollected(lastMonthStart, monthStart.minusDays(1)));
        return new BillingOverviewResponse(
                scale(mrr), scale(mrr.multiply(BigDecimal.valueOf(12))),
                thisMonth, lastMonth, scale(outstanding),
                active, trial, pastDue, expired, cancelled, expiringSoon, rows);
    }

    /**
     * Whether a subscription belongs in recurring revenue.
     *
     * <p>Only cafés that are actually paying. A trial is a café that <em>might</em> become
     * revenue, and folding it in overstates the one number the whole board exists to report —
     * though a trial running out still needs chasing, so it stays in the expiring queue.
     * Lifetime access is real money but not recurring money, and is excluded by its price
     * normalising to zero.
     */
    static boolean countsTowardMrr(Subscription s) {
        return s.getStatus() == SubscriptionStatus.ACTIVE;
    }

    /**
     * A subscription's price expressed per month, so a yearly café and a monthly café can be
     * added into the same number. Lifetime access contributes nothing recurring.
     */
    static BigDecimal monthlyValue(Subscription s) {
        if (s.getPrice() == null || s.getBillingCycle() == BillingCycle.ONE_TIME) {
            return BigDecimal.ZERO;
        }
        return s.getBillingCycle() == BillingCycle.MONTHLY
                ? scale(s.getPrice())
                : s.getPrice().divide(BigDecimal.valueOf(12), MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    /** Best-effort name for the audit line; a missing café is logged by id alone. */
    private String cafeName(Long restaurantId) {
        return restaurantRepository.findById(restaurantId)
                .map(r -> com.cafeqr.common.util.Names.preferring(
                        r.getNameEn(), r.getNameAr(), r.getName(), false))
                .orElse("#" + restaurantId);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private Subscription find(Long id) {
        return subscriptionRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Subscription", id));
    }

    /** A one-off payment is active immediately once recorded; recurring plans start as a trial. */
    private SubscriptionStatus defaultStatus(BillingCycle cycle) {
        return cycle == BillingCycle.ONE_TIME ? SubscriptionStatus.ACTIVE : SubscriptionStatus.TRIAL;
    }
}
