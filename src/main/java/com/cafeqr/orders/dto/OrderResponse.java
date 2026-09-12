package com.cafeqr.orders.dto;

import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.orders.domain.PaymentStatus;
import com.cafeqr.payments.domain.PaymentMethod;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Full order view for the dashboard (includes line items and internal notes). */
public record OrderResponse(
        Long id,
        String orderNumber,
        int dailyNumber,
        String trackingToken,
        Long restaurantId,
        Long branchId,
        Long tableId,
        String customerName,
        String customerPhone,
        /** The numbered buzzer handed over the counter — shown on the board, printed on the ticket. */
        String pagerNumber,
        String carPlate,
        String carColor,
        OrderType orderType,
        OrderStatus status,
        PaymentStatus paymentStatus,
        PaymentMethod paymentMethod,
        BigDecimal subtotal,
        BigDecimal vatAmount,
        BigDecimal total,
        Integer prepTimeMinutes,
        String declineReason,
        String customerNote,
        String internalNote,
        String loyaltyRewardLabel,
        BigDecimal loyaltyRewardDiscount,
        /** The coupon spent at the counter and what it took off — the total already reflects it. */
        String couponCode,
        String couponLabel,
        BigDecimal couponDiscount,
        List<OrderItemResponse> items,
        Instant createdAt,
        Instant acceptedAt,
        Instant declinedAt,
        Instant preparingAt,
        Instant readyAt,
        Instant completedAt,
        Instant cancelledAt
) {
    public static OrderResponse from(Order o) {
        return new OrderResponse(
                o.getId(), o.getOrderNumber(), o.getDailyNumber(), o.getTrackingToken(), o.getRestaurantId(), o.getBranchId(),
                o.getTableId(), o.getCustomerName(), o.getCustomerPhone(), o.getPagerNumber(),
                o.getCarPlate(), o.getCarColor(), o.getOrderType(), o.getStatus(),
                o.getPaymentStatus(), o.getPaymentMethod(), o.getSubtotal(), o.getVatAmount(), o.getTotal(), o.getPrepTimeMinutes(),
                o.getDeclineReason(), o.getCustomerNote(), o.getInternalNote(),
                o.getLoyaltyRewardLabel(), o.getLoyaltyRewardDiscount(),
                o.getCouponCode(), o.getCouponLabel(), o.getCouponDiscount(),
                o.getItems().stream().map(OrderItemResponse::from).toList(),
                o.getCreatedAt(), o.getAcceptedAt(), o.getDeclinedAt(), o.getPreparingAt(),
                o.getReadyAt(), o.getCompletedAt(), o.getCancelledAt());
    }
}
