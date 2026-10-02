package com.cafeqr.till.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * One movement of cash in or out of an open drawer, mid-shift, with the reason on it.
 *
 * <p>The till counts the drawer at both ends of the day and judges it against the cash it took
 * between them. A movement is the cash that came and went that the till never saw as a sale — a
 * crate of milk paid from the drawer, change fetched from the bank. It hangs off the open session
 * and shifts what the drawer is expected to hold at close, so a drawer that is short because
 * someone bought milk reads as exactly right, and the report says where the money went.
 */
@Entity
@Table(name = "till_movements")
public class TillMovement extends BaseEntity {

    /** Which way the cash went. OUT of the drawer, or IN to it. */
    public enum Direction { OUT, IN }

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    /** Always positive; {@link #direction} carries the sign. */
    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 8)
    private Direction direction;

    /** Why the cash moved. The whole point of the row. */
    @Column(name = "note", nullable = false, length = 200)
    private String note;

    @Column(name = "created_by")
    private Long createdBy;

    /** Snapshotted: a movement still names whoever made it after they leave. */
    @Column(name = "created_by_name", length = 200)
    private String createdByName;

    public Long getSessionId() {
        return sessionId;
    }

    public void setSessionId(Long sessionId) {
        this.sessionId = sessionId;
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

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public Direction getDirection() {
        return direction;
    }

    public void setDirection(Direction direction) {
        this.direction = direction;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(Long createdBy) {
        this.createdBy = createdBy;
    }

    public String getCreatedByName() {
        return createdByName;
    }

    public void setCreatedByName(String createdByName) {
        this.createdByName = createdByName;
    }
}
