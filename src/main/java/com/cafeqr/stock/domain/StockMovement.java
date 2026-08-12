package com.cafeqr.stock.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One append-only entry in the stock ledger. Never updated, never deleted — a correction is a
 * new row. {@link #balanceAfter} is denormalised so an audit view never has to replay from zero.
 *
 * <p>SALE rows are unique per (order, item) at the database level, which is what makes a
 * double-accept safe and gives the cancel path exactly one row to give back.
 */
@Entity
@Table(name = "stock_movements")
public class StockMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    /** Signed: positive adds to stock, negative draws from it. */
    @Column(name = "delta_base", nullable = false)
    private BigDecimal deltaBase;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false, length = 24)
    private MovementReason reason;

    @Column(name = "balance_after", nullable = false)
    private BigDecimal balanceAfter;

    @Enumerated(EnumType.STRING)
    @Column(name = "waste_reason", length = 20)
    private WasteReason wasteReason;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "user_id")
    private Long userId;

    /** Cost per base unit at the time — on RECEIVE what was paid, elsewhere the running average. */
    @Column(name = "unit_cost")
    private BigDecimal unitCost;

    @Column(name = "note", length = 300)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void stamp() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /** Absolute value of this movement in money, at the recorded unit cost. */
    public BigDecimal costImpact() {
        if (unitCost == null || deltaBase == null) {
            return BigDecimal.ZERO;
        }
        return deltaBase.abs().multiply(unitCost);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getStockItemId() {
        return stockItemId;
    }

    public void setStockItemId(Long stockItemId) {
        this.stockItemId = stockItemId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public BigDecimal getDeltaBase() {
        return deltaBase;
    }

    public void setDeltaBase(BigDecimal deltaBase) {
        this.deltaBase = deltaBase;
    }

    public MovementReason getReason() {
        return reason;
    }

    public void setReason(MovementReason reason) {
        this.reason = reason;
    }

    public BigDecimal getBalanceAfter() {
        return balanceAfter;
    }

    public void setBalanceAfter(BigDecimal balanceAfter) {
        this.balanceAfter = balanceAfter;
    }

    public WasteReason getWasteReason() {
        return wasteReason;
    }

    public void setWasteReason(WasteReason wasteReason) {
        this.wasteReason = wasteReason;
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
