package com.cafeqr.coupons;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.util.Pasted;
import com.cafeqr.coupons.domain.Coupon;
import com.cafeqr.coupons.domain.CouponItem;
import com.cafeqr.coupons.dto.CouponRequest;
import com.cafeqr.coupons.dto.CouponResponse;
import com.cafeqr.coupons.repository.CouponRepository;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.domain.Restaurant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Coupons: the owner's codes, and what typing one on an order actually takes off.
 *
 * <p>The discount is worked out here from the coupon's own percents against the lines the
 * server priced, never from a figure the pad sends. The pad computes the same number to show on
 * the totals, but it is a screen — a tablet with a stale menu, or someone editing the request,
 * must not be able to decide what a café charges.
 */
@Service
public class CouponService {

    private static final int MONEY_SCALE = 3;
    /** Ambiguous glyphs left out: a code is read off a screen and typed at a counter (no O/0, I/1). */
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final CouponRepository couponRepository;
    private final MenuItemRepository menuItemRepository;
    private final AccessGuard accessGuard;

    public CouponService(CouponRepository couponRepository,
                         MenuItemRepository menuItemRepository,
                         AccessGuard accessGuard) {
        this.couponRepository = couponRepository;
        this.menuItemRepository = menuItemRepository;
        this.accessGuard = accessGuard;
    }

    // ------------------------------------------------------------------ owner's screen

    @Transactional(readOnly = true)
    public List<CouponResponse> list() {
        return couponRepository.findByRestaurantIdOrderByCreatedAtDesc(scopedRestaurantId())
                .stream().map(CouponResponse::from).toList();
    }

    @Transactional
    public CouponResponse create(CouponRequest request) {
        Long restaurantId = scopedRestaurantId();
        String code = normalizeCode(request.code());
        if (couponRepository.existsByRestaurantIdAndCode(restaurantId, code)) {
            throw new ConflictException("You already have a coupon with the code " + code + ".");
        }
        Coupon coupon = new Coupon();
        coupon.setRestaurantId(restaurantId);
        coupon.setCode(code);
        coupon.setLabel(request.label().trim());
        coupon.setActive(Boolean.TRUE.equals(request.active()));
        coupon.setItems(resolveItems(restaurantId, request.items()));
        return CouponResponse.from(couponRepository.save(coupon));
    }

    @Transactional
    public CouponResponse update(Long id, CouponRequest request) {
        Long restaurantId = scopedRestaurantId();
        Coupon coupon = getOwned(restaurantId, id);
        String code = normalizeCode(request.code());
        if (!code.equals(coupon.getCode())
                && couponRepository.existsByRestaurantIdAndCode(restaurantId, code)) {
            throw new ConflictException("You already have a coupon with the code " + code + ".");
        }
        coupon.setCode(code);
        coupon.setLabel(request.label().trim());
        coupon.setActive(Boolean.TRUE.equals(request.active()));
        // Replace wholesale rather than merge: the screen always sends the full list, and a
        // percent that changed has to reach the table (see CouponItem's equals).
        coupon.getItems().clear();
        coupon.getItems().addAll(resolveItems(restaurantId, request.items()));
        return CouponResponse.from(coupon);
    }

    @Transactional
    public void delete(Long id) {
        Long restaurantId = scopedRestaurantId();
        couponRepository.delete(getOwned(restaurantId, id));
    }

    /**
     * A fresh code that is not in use in this café, for the New coupon button.
     *
     * <p>Generated here rather than in the browser so it can be checked against the café's
     * existing codes before it is ever shown — a suggested code that turns out to be taken
     * the moment you press Save is a worse offer than no suggestion.
     */
    @Transactional(readOnly = true)
    public String suggestCode(String prefix) {
        Long restaurantId = scopedRestaurantId();
        String head = prefix == null || prefix.isBlank() ? "" : normalizeCode(prefix) + "-";
        if (head.length() > 12) {
            head = head.substring(0, 12);
        }
        var random = new java.security.SecureRandom();
        for (int attempt = 0; attempt < 40; attempt++) {
            StringBuilder sb = new StringBuilder(head);
            for (int i = 0; i < 5; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            String candidate = sb.toString();
            if (!couponRepository.existsByRestaurantIdAndCode(restaurantId, candidate)) {
                return candidate;
            }
        }
        throw new ConflictException("Could not find a free coupon code. Try a different prefix.");
    }

    // ------------------------------------------------------------------ the order pad

    /**
     * The coupon behind a code the counter typed, for showing the discount before the order is
     * sent. Only an active one answers: a switched-off code has to read as "not a code" at the
     * counter, not as "a code that mysteriously takes nothing off".
     */
    @Transactional(readOnly = true)
    public CouponResponse lookup(String rawCode) {
        Long restaurantId = scopedRestaurantId();
        String code = normalizeCode(rawCode);
        Coupon coupon = couponRepository.findByRestaurantIdAndCode(restaurantId, code)
                .filter(Coupon::isActive)
                .orElseThrow(() -> new BadRequestException(code + " is not a coupon at this café."));
        return CouponResponse.from(coupon);
    }

    // ------------------------------------------------------------------ order time

    /**
     * Apply a typed coupon code to an order that has been priced but not yet saved.
     *
     * <p>Follows the loyalty reward exactly: the priced subtotal is left alone so the lines on
     * the receipt still say what the items cost, and the discount comes off the VAT and the
     * total. A 100%-off item therefore costs the customer nothing at all rather than nothing
     * plus tax — the café absorbs both, which is what handing something over free means.
     *
     * <p>Does nothing when no code was typed. Called before the order is saved, and so before a
     * split is settled against its total: the shares have to add up to the discounted bill.
     */
    public void apply(Order order, Restaurant restaurant, String rawCode) {
        if (rawCode == null || rawCode.isBlank()) {
            return;
        }
        String code = normalizeCode(rawCode);
        Coupon coupon = couponRepository.findByRestaurantIdAndCode(order.getRestaurantId(), code)
                .filter(Coupon::isActive)
                .orElseThrow(() -> new BadRequestException(code + " is not a coupon at this café."));

        BigDecimal discount = zero();
        for (OrderItem line : order.getItems()) {
            Integer percent = coupon.percentFor(line.getMenuItemId());
            if (percent == null) {
                continue;
            }
            discount = discount.add(line.getLineTotal()
                    .multiply(BigDecimal.valueOf(percent))
                    .divide(BigDecimal.valueOf(100), MONEY_SCALE, RoundingMode.HALF_UP));
        }
        // Refused rather than quietly applied as nothing: the person at the counter has just
        // told a customer they are getting a discount, and an order that records a coupon worth
        // 0.000 would let both of them believe it happened.
        if (discount.signum() <= 0) {
            throw new BadRequestException(coupon.getLabel() + " (" + code
                    + ") does not cover anything in this order.");
        }

        BigDecimal vatOnDiscount = vatOn(restaurant, discount);
        order.setCouponCode(coupon.getCode());
        order.setCouponLabel(coupon.getLabel());
        order.setCouponDiscount(discount);
        order.setVatAmount(max(zero(), order.getVatAmount().subtract(vatOnDiscount)));
        // Each line gives up at most its own total, so this cannot go under — clamped anyway,
        // because a bill that reads as a negative number is worse than a bill that reads 0.000.
        order.setTotal(max(zero(), order.getTotal().subtract(discount).subtract(vatOnDiscount)));
    }

    // ------------------------------------------------------------------ internals

    private Long scopedRestaurantId() {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) {
            throw new BadRequestException("Only café staff can work with coupons.");
        }
        return restaurantId;
    }

    private Coupon getOwned(Long restaurantId, Long id) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Coupon", id));
        if (!coupon.getRestaurantId().equals(restaurantId)) {
            throw ResourceNotFoundException.of("Coupon", id);
        }
        return coupon;
    }

    /**
     * The code as it will be stored and matched: cleaned of what a copy-paste smuggles in
     * ({@link Pasted}), stripped of spaces, upper-cased. A coupon is read out loud, written on a
     * card and typed with one thumb, so "staff meal", "STAFF MEAL" and a paste carrying a bidi
     * mark all have to arrive at the same row.
     */
    static String normalizeCode(String raw) {
        String cleaned = Pasted.identifier(raw);
        if (cleaned == null) {
            throw new BadRequestException("A coupon needs a code.");
        }
        String code = cleaned.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        if (code.isEmpty()) {
            throw new BadRequestException("A coupon needs a code.");
        }
        if (code.length() > 24) {
            code = code.substring(0, 24);
        }
        return code;
    }

    /**
     * Turn the screen's item rows into coupon lines, checking every item really belongs to this
     * café — the ids arrive from a browser, and a coupon pointing at somebody else's menu item
     * would be a discount on a price this café does not set.
     */
    private Set<CouponItem> resolveItems(Long restaurantId, List<CouponRequest.Item> rows) {
        // Last row wins per item: the table has one row per (coupon, item), and two percents for
        // one latte is a question with no answer.
        Map<Long, Integer> byItem = new LinkedHashMap<>();
        for (CouponRequest.Item row : rows) {
            byItem.put(row.menuItemId(), row.percentOff());
        }
        List<MenuItem> found = menuItemRepository.findAllById(byItem.keySet());
        if (found.size() != byItem.size()) {
            throw new BadRequestException("One of the chosen items no longer exists on your menu.");
        }
        for (MenuItem item : found) {
            if (!restaurantId.equals(item.getRestaurantId())) {
                throw new BadRequestException("One of the chosen items is not on your menu.");
            }
        }
        Set<CouponItem> items = new LinkedHashSet<>();
        byItem.forEach((menuItemId, percent) -> items.add(new CouponItem(menuItemId, percent)));
        return items;
    }

    /** VAT on a net amount at the café's rate — mirrors OrderService.computeVat to the fil. */
    private BigDecimal vatOn(Restaurant restaurant, BigDecimal net) {
        if (!restaurant.isVatEnabled() || restaurant.getVatRate() == null
                || restaurant.getVatRate().signum() <= 0) {
            return zero();
        }
        return net.multiply(restaurant.getVatRate())
                .divide(BigDecimal.valueOf(100), MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal max(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) >= 0 ? a : b;
    }
}
