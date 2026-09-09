package com.cafeqr.loyalty;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.util.Phones;
import com.cafeqr.loyalty.domain.LoyaltyMember;
import com.cafeqr.loyalty.domain.LoyaltyProgram;
import com.cafeqr.loyalty.domain.LoyaltyTransaction;
import com.cafeqr.loyalty.domain.LoyaltyTxnStatus;
import com.cafeqr.loyalty.domain.LoyaltyTxnType;
import com.cafeqr.loyalty.dto.LoyaltyMemberResponse;
import com.cafeqr.loyalty.dto.LoyaltyPortalEntryResponse;
import com.cafeqr.loyalty.dto.LoyaltyBranchActivityResponse;
import com.cafeqr.loyalty.dto.LoyaltyProgramRequest;
import com.cafeqr.loyalty.dto.LoyaltyProgramResponse;
import com.cafeqr.loyalty.dto.LoyaltySummaryResponse;
import com.cafeqr.loyalty.repository.LoyaltyMemberRepository;
import com.cafeqr.loyalty.repository.LoyaltyProgramRepository;
import com.cafeqr.loyalty.repository.LoyaltyTransactionRepository;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Stamp-card loyalty: café configuration, per-(restaurant, phone) balances, and the order-flow
 * hooks that earn stamps and reserve/confirm/void reward redemptions. The {@link LoyaltyMember}
 * counters are the operational source of truth (mutated under a row lock); the
 * {@link LoyaltyTransaction} ledger provides per-order idempotency and audit.
 */
@Service
public class LoyaltyService {

    private static final int MONEY_SCALE = 3;
    private static final String DEFAULT_STAMP_ICON = "★";
    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    /** Mirror of the customer app's MOTIF_OPTIONS (menuThemes.ts) minus 'none' (stored as null). */
    private static final Set<String> CARD_MOTIFS =
            Set.of("bean", "cup", "palm", "star", "crescent", "leaf", "drop", "geo");

    private final LoyaltyProgramRepository programRepository;
    private final LoyaltyMemberRepository memberRepository;
    private final LoyaltyTransactionRepository txnRepository;
    private final MenuItemRepository menuItemRepository;
    private final RestaurantService restaurantService;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public LoyaltyService(LoyaltyProgramRepository programRepository,
                          LoyaltyMemberRepository memberRepository,
                          LoyaltyTransactionRepository txnRepository,
                          MenuItemRepository menuItemRepository,
                          RestaurantService restaurantService,
                          BranchService branchService,
                          AccessGuard accessGuard) {
        this.programRepository = programRepository;
        this.memberRepository = memberRepository;
        this.txnRepository = txnRepository;
        this.menuItemRepository = menuItemRepository;
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    /**
     * Stamps issued and rewards handed over per branch, between {@code from} and {@code to}.
     *
     * <p>A branch-scoped user sees only their own branch; a restaurant-wide one sees every
     * branch, or a single one by passing {@code branchId}. Same rule as the analytics screens.
     */
    @Transactional(readOnly = true)
    public List<LoyaltyBranchActivityResponse> branchActivity(Long requestedBranchId,
                                                              Instant from, Instant to) {
        Long restaurantId = requireCafeScope();
        Long scoped = accessGuard.scopedBranchId();
        Long branchScope = scoped != null ? scoped : requestedBranchId;
        if (branchScope != null) {
            branchService.getEntityInRestaurant(restaurantId, branchScope);
            accessGuard.requireBranchAccess(restaurantId, branchScope);
        }
        Map<Long, BranchResponse> branches = branchService.listByRestaurant(restaurantId).stream()
                .collect(Collectors.toMap(BranchResponse::id, b -> b));
        List<LoyaltyBranchActivityResponse> out = new ArrayList<>();
        for (Object[] row : txnRepository.activityByBranch(restaurantId, branchScope, from, to)) {
            Long branchId = row[0] == null ? null : ((Number) row[0]).longValue();
            BranchResponse branch = branchId == null ? null : branches.get(branchId);
            out.add(new LoyaltyBranchActivityResponse(branchId,
                    branch == null ? null : branch.nameEn(),
                    branch == null ? null : branch.nameAr(),
                    ((Number) row[1]).longValue(),
                    ((Number) row[2]).longValue()));
        }
        return out;
    }

    // ============================================================ dashboard (café config)

    @Transactional(readOnly = true)
    public LoyaltyProgramResponse getProgram() {
        Long restaurantId = requireCafeScope();
        return programRepository.findByRestaurantId(restaurantId)
                .map(LoyaltyProgramResponse::from)
                .orElseGet(() -> new LoyaltyProgramResponse(false, 8, "", List.of(), null,
                        null, null, DEFAULT_STAMP_ICON, null));
    }

    @Transactional
    public LoyaltyProgramResponse updateProgram(LoyaltyProgramRequest req) {
        Long restaurantId = requireCafeScope();
        Set<Long> rewardItemIds = req.rewardItemIds() == null
                ? new LinkedHashSet<>() : new LinkedHashSet<>(req.rewardItemIds());
        if (req.enabled() && rewardItemIds.isEmpty()) {
            throw new BadRequestException("Choose at least one free reward item before enabling loyalty.");
        }
        requireOwnMenuItems(restaurantId, rewardItemIds);
        LoyaltyProgram program = programRepository.findByRestaurantId(restaurantId)
                .orElseGet(() -> {
                    LoyaltyProgram p = new LoyaltyProgram();
                    p.setRestaurantId(restaurantId);
                    return p;
                });
        program.setEnabled(req.enabled());
        program.setStampsRequired(req.stampsRequired());
        program.setRewardLabel(req.rewardLabel().trim());
        program.setRewardItemIds(rewardItemIds);
        program.setMinOrderAmount(req.minOrderAmount());
        applyCardStyle(program, req);
        return LoyaltyProgramResponse.from(programRepository.save(program));
    }

    /** Card-studio fields: normalize blanks to defaults and reject values the card can't render. */
    private void applyCardStyle(LoyaltyProgram program, LoyaltyProgramRequest req) {
        String color = req.cardColor() == null ? "" : req.cardColor().trim();
        if (!color.isEmpty() && !HEX_COLOR.matcher(color).matches()) {
            throw new BadRequestException("Card color must be a #RRGGBB hex value.");
        }
        String bg = req.cardBg() == null ? "" : req.cardBg().trim();
        if (!bg.isEmpty() && !HEX_COLOR.matcher(bg).matches()) {
            throw new BadRequestException("Card background must be a #RRGGBB hex value.");
        }
        String motif = req.cardMotif() == null ? "" : req.cardMotif().trim();
        if (!motif.isEmpty() && !CARD_MOTIFS.contains(motif)) {
            throw new BadRequestException("Unknown card pattern.");
        }
        String icon = req.stampIcon() == null ? "" : req.stampIcon().trim();
        program.setCardColor(color.isEmpty() ? null : color);
        program.setCardBg(bg.isEmpty() ? null : bg);
        program.setCardMotif(motif.isEmpty() ? null : motif);
        program.setStampIcon(icon.isEmpty() ? DEFAULT_STAMP_ICON : icon);
    }

    /** Rejects reward item ids that don't exist or belong to another restaurant's menu. */
    private void requireOwnMenuItems(Long restaurantId, Set<Long> itemIds) {
        if (itemIds.isEmpty()) {
            return;
        }
        List<MenuItem> found = menuItemRepository.findAllById(itemIds);
        boolean allOwn = found.size() == itemIds.size()
                && found.stream().allMatch(i -> restaurantId.equals(i.getRestaurantId()));
        if (!allOwn) {
            throw new BadRequestException("Reward items must be items from your own menu.");
        }
    }

    @Transactional(readOnly = true)
    public List<LoyaltyMemberResponse> listMembers() {
        Long restaurantId = requireCafeScope();
        return memberRepository.findTop200ByRestaurantIdOrderByUpdatedAtDesc(restaurantId)
                .stream().map(LoyaltyMemberResponse::from).toList();
    }

    // ============================================================ public (customer)

    /** One café's stamp progress for a phone (checkout redeem toggle). */
    @Transactional(readOnly = true)
    public LoyaltySummaryResponse summaryFor(String slug, String rawPhone) {
        Restaurant restaurant = restaurantService.getActiveBySlug(slug);
        return summaryForRestaurant(restaurant.getId(), Phones.normalize(rawPhone));
    }

    /** Same as {@link #summaryFor} but keyed by restaurant id + already-normalized phone (menu banner). */
    @Transactional(readOnly = true)
    public LoyaltySummaryResponse summaryForRestaurant(Long restaurantId, String normalizedPhone) {
        LoyaltyProgram program = programRepository.findByRestaurantId(restaurantId)
                .filter(LoyaltyProgram::isEnabled).orElse(null);
        if (program == null) {
            return LoyaltySummaryResponse.disabled();
        }
        LoyaltyMember member = normalizedPhone == null ? null
                : memberRepository.findByRestaurantIdAndPhone(restaurantId, normalizedPhone).orElse(null);
        return LoyaltySummaryResponse.of(program, member);
    }

    /** Every café's stamp card for an OTP-verified (normalized) phone — the cross-café portal. */
    @Transactional(readOnly = true)
    public List<LoyaltyPortalEntryResponse> portalFor(String normalizedPhone) {
        if (normalizedPhone == null || normalizedPhone.isBlank()) {
            return List.of();
        }
        List<LoyaltyPortalEntryResponse> out = new ArrayList<>();
        for (LoyaltyMember m : memberRepository.findByPhoneOrderByUpdatedAtDesc(normalizedPhone)) {
            LoyaltyProgram program = programRepository.findByRestaurantId(m.getRestaurantId())
                    .filter(LoyaltyProgram::isEnabled).orElse(null);
            if (program == null) {
                continue; // café turned loyalty off — hide it from the portal
            }
            Restaurant r = restaurantService.getEntity(m.getRestaurantId());
            List<LoyaltyPortalEntryResponse.RewardItemName> rewardItems =
                    menuItemRepository.findAllById(program.getRewardItemIds()).stream()
                            .map(i -> new LoyaltyPortalEntryResponse.RewardItemName(i.getNameEn(), i.getNameAr()))
                            .toList();
            out.add(new LoyaltyPortalEntryResponse(
                    r.getSlug(), r.getName(), r.getNameEn(), r.getNameAr(), r.getLogoUrl(),
                    program.getStampsRequired(), program.getRewardLabel(), rewardItems,
                    m.getStamps(), m.getAvailableRewards(), m.getUpdatedAt(),
                    program.getCardColor(), program.getCardBg(), program.getStampIcon(), program.getCardMotif()));
        }
        return out;
    }

    // ============================================================ order-flow hooks

    /**
     * Reserves a reward redemption on a freshly saved order: validates the customer has a reward
     * and an eligible free item is in the cart, consumes one available reward, writes a PENDING
     * REDEEM ledger row, and applies the discount (one priced unit of the chosen item) to the order
     * total. {@code redeemItemId} is the customer's pick among the program's eligible items; when
     * null (legacy clients) the cheapest eligible line is given free. No-op when
     * {@code redeemRequested} is false. Throws when requested but not satisfiable so the order is
     * not created with an unbacked discount.
     */
    @Transactional
    public void applyRedemption(Order order, boolean redeemRequested, Long redeemItemId) {
        if (!redeemRequested) {
            return;
        }
        String phone = order.getCustomerPhone();
        if (phone == null) {
            throw new BadRequestException("A phone number is required to redeem a reward.");
        }
        LoyaltyProgram program = programRepository.findByRestaurantId(order.getRestaurantId())
                .filter(LoyaltyProgram::isEnabled)
                .orElseThrow(() -> new BadRequestException("This café has no active loyalty program."));
        Set<Long> rewardIds = program.getRewardItemIds();
        if (rewardIds.isEmpty()) {
            throw new BadRequestException("This café's loyalty reward is not set up yet.");
        }
        if (redeemItemId != null && !rewardIds.contains(redeemItemId)) {
            throw new BadRequestException("That item is not part of this café's loyalty reward.");
        }
        OrderItem rewardLine = order.getItems().stream()
                .filter(i -> i.getMenuItemId() != null && rewardIds.contains(i.getMenuItemId()))
                .filter(i -> redeemItemId == null || redeemItemId.equals(i.getMenuItemId()))
                // no explicit pick (legacy client): the cheapest eligible line is the free one
                .min(Comparator.comparing(OrderItem::getPriceSnapshot))
                .orElseThrow(() -> new BadRequestException(
                        "Add one of the reward items to your cart to redeem your reward."));
        LoyaltyMember member = memberRepository
                .lockByRestaurantIdAndPhone(order.getRestaurantId(), phone)
                .orElse(null);
        if (member == null || member.getAvailableRewards() < 1) {
            throw new BadRequestException("You don't have a reward available to redeem yet.");
        }

        member.setAvailableRewards(member.getAvailableRewards() - 1);
        memberRepository.save(member);
        txnRepository.save(redemptionTxn(order, phone));

        // The reward makes the item fully free — waive its price AND the VAT on it, so a "free
        // drink" really costs the customer nothing (the café absorbs both as the reward). The
        // priced subtotal is left untouched; only the VAT and total come down.
        Restaurant restaurant = restaurantService.getEntity(order.getRestaurantId());
        BigDecimal rewardNet = rewardLine.getPriceSnapshot();
        BigDecimal vatOnReward = vatOn(restaurant, rewardNet);
        order.setLoyaltyRewardLabel(program.getRewardLabel());
        order.setLoyaltyRewardDiscount(rewardNet);
        order.setVatAmount(order.getVatAmount().subtract(vatOnReward));
        order.setTotal(order.getTotal().subtract(rewardNet).subtract(vatOnReward));
    }

    /** On completion: earn a stamp (idempotent, if the order qualifies) and confirm any reserved reward. */
    @Transactional
    public void onOrderCompleted(Order order) {
        String phone = order.getCustomerPhone();
        if (phone == null) {
            return;
        }
        LoyaltyProgram program = programRepository.findByRestaurantId(order.getRestaurantId())
                .filter(LoyaltyProgram::isEnabled).orElse(null);
        if (program != null && qualifiesForStamp(program, order)) {
            // Lock the member BEFORE the EARN idempotency check so a concurrent completion of another
            // order for the same phone serializes here; otherwise two completions both read "no EARN
            // row" and the second insert trips uq_loyalty_txn_order_type as a 500 instead of a no-op.
            LoyaltyMember member = getOrCreateLockedMember(
                    order.getRestaurantId(), phone, order.getCustomerName());
            if (!txnRepository.existsByOrderIdAndType(order.getId(), LoyaltyTxnType.EARN)) {
                member.setLifetimeStamps(member.getLifetimeStamps() + 1);
                int stamps = member.getStamps() + 1;
                if (stamps >= program.getStampsRequired()) {
                    stamps -= program.getStampsRequired();
                    member.setAvailableRewards(member.getAvailableRewards() + 1);
                }
                member.setStamps(stamps);
                if (member.getName() == null && order.getCustomerName() != null) {
                    member.setName(order.getCustomerName());
                }
                memberRepository.save(member);

                LoyaltyTransaction earn = new LoyaltyTransaction();
                earn.setRestaurantId(order.getRestaurantId());
                earn.setBranchId(order.getBranchId());
                earn.setPhone(phone);
                earn.setOrderId(order.getId());
                earn.setType(LoyaltyTxnType.EARN);
                earn.setStatus(LoyaltyTxnStatus.CONFIRMED);
                earn.setStampsDelta(1);
                txnRepository.save(earn);
            }
        }
        confirmPendingRedemption(order, phone);
    }

    /**
     * Whether this order earned a stamp on completion. The EARN ledger row is written exactly once
     * (and only when the order qualified), so its presence is the authoritative signal the post-order
     * "a stamp was added" confirmation can trust.
     */
    @Transactional(readOnly = true)
    public boolean orderEarnedStamp(Long orderId) {
        return txnRepository.existsByOrderIdAndType(orderId, LoyaltyTxnType.EARN);
    }

    /** On cancellation/decline: void any reserved reward and return it to the member. */
    @Transactional
    public void onOrderCancelled(Order order) {
        String phone = order.getCustomerPhone();
        if (phone == null || order.getLoyaltyRewardDiscount() == null) {
            return; // no reserved redemption on this order — nothing to return
        }
        // Lock the member BEFORE re-checking the redemption status so concurrent cancels/declines of
        // the same order serialize here; otherwise both reads see PENDING and availableRewards is
        // incremented twice — minting a reward out of one redemption.
        memberRepository.lockByRestaurantIdAndPhone(order.getRestaurantId(), phone)
                .ifPresent(m -> txnRepository.findByOrderIdAndTypeAndStatus(
                                order.getId(), LoyaltyTxnType.REDEEM, LoyaltyTxnStatus.PENDING)
                        .ifPresent(txn -> {
                            txn.setStatus(LoyaltyTxnStatus.VOID);
                            txnRepository.save(txn);
                            m.setAvailableRewards(m.getAvailableRewards() + 1);
                            memberRepository.save(m);
                        }));
    }

    // ============================================================ helpers

    private void confirmPendingRedemption(Order order, String phone) {
        if (order.getLoyaltyRewardDiscount() == null) {
            return; // no redemption was applied to this order — skip the member lock on the hot path
        }
        // Same lock-first ordering as onOrderCancelled so a double-complete can't double-count
        // rewardsRedeemed: serialize on the member, then re-check the PENDING redemption under the lock.
        memberRepository.lockByRestaurantIdAndPhone(order.getRestaurantId(), phone)
                .ifPresent(m -> txnRepository.findByOrderIdAndTypeAndStatus(
                                order.getId(), LoyaltyTxnType.REDEEM, LoyaltyTxnStatus.PENDING)
                        .ifPresent(txn -> {
                            txn.setStatus(LoyaltyTxnStatus.CONFIRMED);
                            txnRepository.save(txn);
                            m.setRewardsRedeemed(m.getRewardsRedeemed() + 1);
                            memberRepository.save(m);
                        }));
    }

    private LoyaltyTransaction redemptionTxn(Order order, String phone) {
        LoyaltyTransaction txn = new LoyaltyTransaction();
        txn.setRestaurantId(order.getRestaurantId());
        txn.setBranchId(order.getBranchId());
        txn.setPhone(phone);
        txn.setOrderId(order.getId());
        txn.setType(LoyaltyTxnType.REDEEM);
        txn.setStatus(LoyaltyTxnStatus.PENDING);
        txn.setStampsDelta(0);
        return txn;
    }

    private boolean qualifiesForStamp(LoyaltyProgram program, Order order) {
        BigDecimal min = program.getMinOrderAmount();
        if (min == null || min.signum() <= 0) {
            return true;
        }
        if (order.getTotal() == null) {
            return false;
        }
        // Gate on what the customer actually ordered — the priced subtotal plus its VAT — which
        // reward redemption never touches (it only lowers total/vatAmount/loyaltyRewardDiscount).
        // Rebuilding the gross from the immutable subtotal is exact, so redeeming a free reward
        // never drops an order below the floor and robs it of the stamp it earned.
        Restaurant restaurant = restaurantService.getEntity(order.getRestaurantId());
        BigDecimal gross = order.getSubtotal().add(vatOn(restaurant, order.getSubtotal()));
        return gross.compareTo(min) >= 0;
    }

    /** VAT (output tax) on a net amount at the restaurant's rate, 0 when VAT is off. Mirrors
     *  OrderService.computeVat so a waived reward line and the order-level VAT agree to the fil. */
    private BigDecimal vatOn(Restaurant restaurant, BigDecimal net) {
        if (!restaurant.isVatEnabled() || restaurant.getVatRate() == null
                || restaurant.getVatRate().signum() <= 0) {
            return BigDecimal.ZERO.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
        }
        return net.multiply(restaurant.getVatRate())
                .divide(BigDecimal.valueOf(100), MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private LoyaltyMember getOrCreateLockedMember(Long restaurantId, String phone, String name) {
        // Ensure the row exists with an atomic INSERT ... ON CONFLICT DO NOTHING so two orders
        // completing concurrently for a brand-new phone can't both INSERT and trip uq_loyalty_member
        // (which surfaced as a 500 on the second completion). The locking read then always finds the
        // row and serializes the writers.
        memberRepository.insertIfAbsent(restaurantId, phone, name);
        return memberRepository.lockByRestaurantIdAndPhone(restaurantId, phone)
                .orElseThrow(() -> new IllegalStateException(
                        "Loyalty member missing right after insert (restaurant " + restaurantId + ")"));
    }

    private Long requireCafeScope() {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) {
            throw new BadRequestException("Only café staff can manage loyalty.");
        }
        return restaurantId;
    }
}
