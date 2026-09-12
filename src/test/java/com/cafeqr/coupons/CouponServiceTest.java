package com.cafeqr.coupons;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.coupons.domain.Coupon;
import com.cafeqr.coupons.domain.CouponItem;
import com.cafeqr.coupons.repository.CouponRepository;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.domain.Restaurant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * What a coupon takes off a bill, and what it leaves alone.
 *
 * <p>The subtotal is the café's priced basket and must survive untouched — a receipt has to keep
 * saying what the items cost. The discount lands on the VAT and the total, so a 100%-off item
 * really costs the customer nothing rather than nothing plus tax.
 */
@ExtendWith(MockitoExtension.class)
class CouponServiceTest {

    @Mock private CouponRepository couponRepository;
    @Mock private MenuItemRepository menuItemRepository;
    @Mock private AccessGuard accessGuard;

    private CouponService couponService;

    @BeforeEach
    void setUp() {
        couponService = new CouponService(couponRepository, menuItemRepository, accessGuard);
    }

    private static Restaurant restaurant() {
        Restaurant r = new Restaurant();
        r.setId(1L);
        r.setVatEnabled(true);
        r.setVatRate(new BigDecimal("5"));
        return r;
    }

    /** An order already priced by OrderService: lines, subtotal, VAT on the subtotal, total. */
    private static Order priced(long[] menuItemIds, String[] lineTotals) {
        Order order = new Order();
        order.setRestaurantId(1L);
        BigDecimal subtotal = new BigDecimal("0.000");
        for (int i = 0; i < menuItemIds.length; i++) {
            OrderItem line = new OrderItem();
            line.setMenuItemId(menuItemIds[i]);
            line.setQuantity(1);
            line.setNameEnSnapshot("Item " + menuItemIds[i]);
            line.setNameArSnapshot("Item " + menuItemIds[i]);
            line.setPriceSnapshot(new BigDecimal(lineTotals[i]));
            line.setLineTotal(new BigDecimal(lineTotals[i]));
            order.addItem(line);
            subtotal = subtotal.add(new BigDecimal(lineTotals[i]));
        }
        BigDecimal vat = subtotal.multiply(new BigDecimal("0.05")).setScale(3, java.math.RoundingMode.HALF_UP);
        order.setSubtotal(subtotal);
        order.setVatAmount(vat);
        order.setTotal(subtotal.add(vat));
        return order;
    }

    private void stubCoupon(String code, boolean active, Set<CouponItem> items) {
        Coupon coupon = new Coupon();
        coupon.setRestaurantId(1L);
        coupon.setCode(code);
        coupon.setLabel("Staff meal");
        coupon.setActive(active);
        coupon.setItems(items);
        when(couponRepository.findByRestaurantIdAndCode(eq(1L), eq(code))).thenReturn(Optional.of(coupon));
    }

    private static Set<CouponItem> items(CouponItem... rows) {
        return new LinkedHashSet<>(java.util.Arrays.asList(rows));
    }

    @Test
    void takesEachItemsOwnPercentOffAndLeavesTheSubtotalAlone() {
        // Coffee 100% off, cake 10% off, juice not covered at all.
        stubCoupon("STAFF", true, items(new CouponItem(100L, 100), new CouponItem(200L, 10)));
        Order order = priced(new long[]{100L, 200L, 300L}, new String[]{"1.500", "2.000", "1.000"});

        couponService.apply(order, restaurant(), "staff");

        // 1.500 + 0.200 = 1.700 off the items; the juice pays in full.
        assertThat(order.getCouponDiscount()).isEqualByComparingTo("1.700");
        assertThat(order.getCouponCode()).isEqualTo("STAFF");
        assertThat(order.getCouponLabel()).isEqualTo("Staff meal");
        // The basket is what it always was — 4.500 of items at the café's prices.
        assertThat(order.getSubtotal()).isEqualByComparingTo("4.500");
        // VAT falls to 5% of what is actually being charged: 4.500 - 1.700 = 2.800 -> 0.140.
        assertThat(order.getVatAmount()).isEqualByComparingTo("0.140");
        assertThat(order.getTotal()).isEqualByComparingTo("2.940");
    }

    @Test
    void anItemGivenAwayCostsNothingAtAllIncludingItsVat() {
        stubCoupon("FREEBIE", true, items(new CouponItem(100L, 100)));
        Order order = priced(new long[]{100L}, new String[]{"2.000"});

        couponService.apply(order, restaurant(), "FREEBIE");

        assertThat(order.getTotal()).isEqualByComparingTo("0.000");
        assertThat(order.getVatAmount()).isEqualByComparingTo("0.000");
    }

    @Test
    void refusesACodeThatCoversNothingInThisOrder() {
        stubCoupon("STAFF", true, items(new CouponItem(999L, 50)));
        Order order = priced(new long[]{100L}, new String[]{"2.000"});

        assertThatThrownBy(() -> couponService.apply(order, restaurant(), "STAFF"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("does not cover anything");
        assertThat(order.getCouponCode()).isNull();
        assertThat(order.getTotal()).isEqualByComparingTo("2.100");
    }

    @Test
    void aSwitchedOffCouponIsNotACouponAtAll() {
        stubCoupon("OLD", false, items(new CouponItem(100L, 50)));
        Order order = priced(new long[]{100L}, new String[]{"2.000"});

        assertThatThrownBy(() -> couponService.apply(order, restaurant(), "old"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("is not a coupon");
    }

    @Test
    void anUnknownCodeIsRefusedRatherThanIgnored() {
        when(couponRepository.findByRestaurantIdAndCode(eq(1L), eq("NOPE"))).thenReturn(Optional.empty());
        Order order = priced(new long[]{100L}, new String[]{"2.000"});

        assertThatThrownBy(() -> couponService.apply(order, restaurant(), " nope "))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void noCodeTypedTouchesNothing() {
        Order order = priced(new long[]{100L}, new String[]{"2.000"});

        couponService.apply(order, restaurant(), null);
        couponService.apply(order, restaurant(), "   ");

        assertThat(order.getCouponCode()).isNull();
        assertThat(order.getCouponDiscount()).isNull();
        assertThat(order.getTotal()).isEqualByComparingTo("2.100");
    }

    @Test
    void withVatOffOnlyTheItemMoneyComesOff() {
        stubCoupon("HALF", true, items(new CouponItem(100L, 50)));
        Restaurant noVat = restaurant();
        noVat.setVatEnabled(false);
        Order order = new Order();
        order.setRestaurantId(1L);
        OrderItem line = new OrderItem();
        line.setMenuItemId(100L);
        line.setQuantity(1);
        line.setNameEnSnapshot("Latte");
        line.setNameArSnapshot("لاتيه");
        line.setPriceSnapshot(new BigDecimal("2.000"));
        line.setLineTotal(new BigDecimal("2.000"));
        order.addItem(line);
        order.setSubtotal(new BigDecimal("2.000"));
        order.setVatAmount(new BigDecimal("0.000"));
        order.setTotal(new BigDecimal("2.000"));

        couponService.apply(order, noVat, "HALF");

        assertThat(order.getCouponDiscount()).isEqualByComparingTo("1.000");
        assertThat(order.getTotal()).isEqualByComparingTo("1.000");
        assertThat(order.getVatAmount()).isEqualByComparingTo("0.000");
    }

    /** Codes are read off a screen and typed one-handed, so how they are typed cannot matter. */
    @Test
    void codesMatchHoweverTheyAreTypedOrPasted() {
        assertThat(CouponService.normalizeCode(" staff meal ")).isEqualTo("STAFFMEAL");
        assertThat(CouponService.normalizeCode("staff‏-7k2q")).isEqualTo("STAFF-7K2Q");
        // An Arabic keyboard's number row types ٢, and it has to reach the same row as 2.
        assertThat(CouponService.normalizeCode("staff٢")).isEqualTo("STAFF2");
    }
}
