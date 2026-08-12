package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * An order placed with a supplier. Generated from par levels (order up to par) or built by
 * hand, then received line by line — each receipt posts a RECEIVE movement and re-averages
 * the item's cost, so COGS stays honest without a second data-entry pass.
 */
@Entity
@Table(name = "purchase_orders")
public class PurchaseOrder extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "supplier_id")
    private Long supplierId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private PurchaseOrderStatus status = PurchaseOrderStatus.DRAFT;

    @Column(name = "reference", length = 60)
    private String reference;

    @Column(name = "notes", length = 500)
    private String notes;

    @Column(name = "expected_at")
    private LocalDate expectedAt;

    @Column(name = "created_by")
    private Long createdBy;

    @OneToMany(mappedBy = "purchaseOrder", fetch = FetchType.EAGER,
            cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PurchaseOrderLine> lines = new ArrayList<>();

    public void addLine(PurchaseOrderLine line) {
        line.setPurchaseOrder(this);
        lines.add(line);
    }

    /** Re-derives the status from how much of the order has landed. */
    public void refreshStatusFromLines() {
        if (status == PurchaseOrderStatus.CANCELLED || lines.isEmpty()) {
            return;
        }
        boolean anyReceived = lines.stream().anyMatch(l -> l.getQuantityReceivedBase().signum() > 0);
        boolean allReceived = lines.stream().allMatch(PurchaseOrderLine::isFullyReceived);
        if (allReceived) {
            status = PurchaseOrderStatus.RECEIVED;
        } else if (anyReceived) {
            status = PurchaseOrderStatus.PARTIAL;
        }
    }

    public Instant closedAtOrNull() {
        return status == PurchaseOrderStatus.RECEIVED ? getUpdatedAt() : null;
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

    public Long getSupplierId() {
        return supplierId;
    }

    public void setSupplierId(Long supplierId) {
        this.supplierId = supplierId;
    }

    public PurchaseOrderStatus getStatus() {
        return status;
    }

    public void setStatus(PurchaseOrderStatus status) {
        this.status = status;
    }

    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public LocalDate getExpectedAt() {
        return expectedAt;
    }

    public void setExpectedAt(LocalDate expectedAt) {
        this.expectedAt = expectedAt;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(Long createdBy) {
        this.createdBy = createdBy;
    }

    public List<PurchaseOrderLine> getLines() {
        return lines;
    }

    public void setLines(List<PurchaseOrderLine> lines) {
        this.lines = lines;
    }
}
