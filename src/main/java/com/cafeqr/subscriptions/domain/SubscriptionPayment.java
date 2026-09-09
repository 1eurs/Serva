package com.cafeqr.subscriptions.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One payment a café made towards its subscription — an append-only ledger entry.
 *
 * <p>Rows are never edited. A mistake is corrected by recording a reversing entry with a
 * negative {@link #amount}, so the ledger always reconciles against the bank statement.
 */
@Entity
@Table(name = "subscription_payments")
public class SubscriptionPayment extends BaseEntity {

    @Column(name = "subscription_id", nullable = false)
    private Long subscriptionId;

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "amount", nullable = false, precision = 12, scale = 3)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 30)
    private PaymentMethod method;

    /** The bank's transfer reference — what this gets matched against on the statement. */
    @Column(name = "reference", length = 120)
    private String reference;

    /** When the money moved, not when somebody recorded it. Monthly totals follow this. */
    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;

    /** The term end date this payment bought. */
    @Column(name = "covers_until")
    private LocalDate coversUntil;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "recorded_by")
    private Long recordedBy;

    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }

    public Long getRestaurantId() { return restaurantId; }
    public void setRestaurantId(Long restaurantId) { this.restaurantId = restaurantId; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public PaymentMethod getMethod() { return method; }
    public void setMethod(PaymentMethod method) { this.method = method; }

    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }

    public LocalDate getPaidOn() { return paidOn; }
    public void setPaidOn(LocalDate paidOn) { this.paidOn = paidOn; }

    public LocalDate getCoversUntil() { return coversUntil; }
    public void setCoversUntil(LocalDate coversUntil) { this.coversUntil = coversUntil; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public Long getRecordedBy() { return recordedBy; }
    public void setRecordedBy(Long recordedBy) { this.recordedBy = recordedBy; }
}
