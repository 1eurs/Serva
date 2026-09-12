package com.cafeqr.till.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One stretch of a branch's till being open: opened with a float, closed with a count.
 *
 * <p>While it is open the shop can sell. When it closes, everything the drawer is judged
 * against is written onto the row once and never recomputed — a refund tomorrow must not move
 * what last Tuesday's count was measured against. So the fields below are in two halves: the
 * ones set at open, and the ones set at close, with nothing in between that drifts.
 */
@Entity
@Table(name = "till_sessions")
public class TillSession extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "opened_at", nullable = false)
    private Instant openedAt;

    @Column(name = "opened_by")
    private Long openedBy;

    /** Snapshotted: a count from three months ago still names whoever made it. */
    @Column(name = "opened_by_name", length = 200)
    private String openedByName;

    @Column(name = "opening_float", nullable = false)
    private BigDecimal openingFloat = BigDecimal.ZERO;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closed_by")
    private Long closedBy;

    @Column(name = "closed_by_name", length = 200)
    private String closedByName;

    /** What was physically in the drawer, as counted by a person. */
    @Column(name = "counted_cash")
    private BigDecimal countedCash;

    /** Opening float plus the cash this session took. */
    @Column(name = "expected_cash")
    private BigDecimal expectedCash;

    /** Counted minus expected: negative is short, positive is over. */
    @Column(name = "variance")
    private BigDecimal variance;

    @Column(name = "cash_sales")
    private BigDecimal cashSales;

    @Column(name = "card_sales")
    private BigDecimal cardSales;

    @Column(name = "order_count")
    private Integer orderCount;

    public boolean isOpen() {
        return closedAt == null;
    }

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public Instant getOpenedAt() {
        return openedAt;
    }

    public void setOpenedAt(Instant openedAt) {
        this.openedAt = openedAt;
    }

    public Long getOpenedBy() {
        return openedBy;
    }

    public void setOpenedBy(Long openedBy) {
        this.openedBy = openedBy;
    }

    public String getOpenedByName() {
        return openedByName;
    }

    public void setOpenedByName(String openedByName) {
        this.openedByName = openedByName;
    }

    public BigDecimal getOpeningFloat() {
        return openingFloat;
    }

    public void setOpeningFloat(BigDecimal openingFloat) {
        this.openingFloat = openingFloat;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public void setClosedAt(Instant closedAt) {
        this.closedAt = closedAt;
    }

    public Long getClosedBy() {
        return closedBy;
    }

    public void setClosedBy(Long closedBy) {
        this.closedBy = closedBy;
    }

    public String getClosedByName() {
        return closedByName;
    }

    public void setClosedByName(String closedByName) {
        this.closedByName = closedByName;
    }

    public BigDecimal getCountedCash() {
        return countedCash;
    }

    public void setCountedCash(BigDecimal countedCash) {
        this.countedCash = countedCash;
    }

    public BigDecimal getExpectedCash() {
        return expectedCash;
    }

    public void setExpectedCash(BigDecimal expectedCash) {
        this.expectedCash = expectedCash;
    }

    public BigDecimal getVariance() {
        return variance;
    }

    public void setVariance(BigDecimal variance) {
        this.variance = variance;
    }

    public BigDecimal getCashSales() {
        return cashSales;
    }

    public void setCashSales(BigDecimal cashSales) {
        this.cashSales = cashSales;
    }

    public BigDecimal getCardSales() {
        return cardSales;
    }

    public void setCardSales(BigDecimal cardSales) {
        this.cardSales = cardSales;
    }

    public Integer getOrderCount() {
        return orderCount;
    }

    public void setOrderCount(Integer orderCount) {
        this.orderCount = orderCount;
    }

}
