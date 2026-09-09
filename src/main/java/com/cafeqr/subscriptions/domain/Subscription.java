package com.cafeqr.subscriptions.domain;

import com.cafeqr.common.domain.BaseEntity;
import com.cafeqr.restaurants.domain.Plan;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "subscriptions")
public class Subscription extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    /**
     * The tier this subscription buys — the single source of truth for what the café can open.
     * {@code restaurants.plan} mirrors it and {@link com.cafeqr.analytics.Entitlements} reads
     * that mirror, so this field is the only place a tier is decided.
     *
     * <p>Orthogonal to {@link #billingCycle}: "Pro" is a tier, "Annual" and "Lifetime" are
     * cycles. The free-text {@code plan_name} it replaces held both at once, which is how a
     * café came to be gated as PRO while its subscription said "Standard".
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "tier", nullable = false, length = 20)
    private Plan tier;

    /** Price per billing cycle (or the one-off amount when {@code billingCycle = ONE_TIME}). */
    @Column(name = "price", nullable = false)
    private BigDecimal price;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", nullable = false, length = 20)
    private BillingCycle billingCycle;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SubscriptionStatus status;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    /** How the café paid the platform. Null until a payment is recorded (e.g. self-serve onboarding). */
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", length = 20)
    private PaymentMethod paymentMethod;

    /** Code the café cites in their bank transfer so an admin can reconcile it. */
    @Column(name = "payment_reference", length = 40)
    private String paymentReference;

    /** When a platform admin confirmed the bank transfer was received. */
    @Column(name = "payment_confirmed_at")
    private Instant paymentConfirmedAt;

    /** The platform admin (user id) who confirmed the payment. */
    @Column(name = "payment_confirmed_by")
    private Long paymentConfirmedBy;

    /** Date a renewal reminder was last emailed, so the lifecycle job doesn't resend the same day. */
    @Column(name = "last_reminder_on")
    private LocalDate lastReminderOn;

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public Plan getTier() {
        return tier;
    }

    public void setTier(Plan tier) {
        this.tier = tier;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public BillingCycle getBillingCycle() {
        return billingCycle;
    }

    public void setBillingCycle(BillingCycle billingCycle) {
        this.billingCycle = billingCycle;
    }

    public SubscriptionStatus getStatus() {
        return status;
    }

    public void setStatus(SubscriptionStatus status) {
        this.status = status;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }

    public PaymentMethod getPaymentMethod() {
        return paymentMethod;
    }

    public void setPaymentMethod(PaymentMethod paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public void setPaymentReference(String paymentReference) {
        this.paymentReference = paymentReference;
    }

    public Instant getPaymentConfirmedAt() {
        return paymentConfirmedAt;
    }

    public void setPaymentConfirmedAt(Instant paymentConfirmedAt) {
        this.paymentConfirmedAt = paymentConfirmedAt;
    }

    public Long getPaymentConfirmedBy() {
        return paymentConfirmedBy;
    }

    public void setPaymentConfirmedBy(Long paymentConfirmedBy) {
        this.paymentConfirmedBy = paymentConfirmedBy;
    }

    public LocalDate getLastReminderOn() {
        return lastReminderOn;
    }

    public void setLastReminderOn(LocalDate lastReminderOn) {
        this.lastReminderOn = lastReminderOn;
    }
}
