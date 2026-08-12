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
import java.util.ArrayList;
import java.util.List;

/**
 * A physical count. Opening one snapshots what the system believes; closing it posts a COUNT
 * movement for every line that differs, so the ledger explains the correction.
 *
 * <p>{@link #blind} hides the expected quantity from whoever is counting. This matters more
 * than it looks: when staff can see the expected number, counts get written to match it and
 * the variance — the entire reason for counting — becomes worthless.
 */
@Entity
@Table(name = "stocktakes")
public class Stocktake extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private StocktakeStatus status = StocktakeStatus.OPEN;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 16)
    private StocktakeScope scope = StocktakeScope.FULL;

    @Column(name = "blind", nullable = false)
    private boolean blind = true;

    @Column(name = "notes", length = 500)
    private String notes;

    @Column(name = "started_by")
    private Long startedBy;

    @Column(name = "closed_at")
    private Instant closedAt;

    @OneToMany(mappedBy = "stocktake", fetch = FetchType.EAGER,
            cascade = CascadeType.ALL, orphanRemoval = true)
    private List<StocktakeLine> lines = new ArrayList<>();

    public void addLine(StocktakeLine line) {
        line.setStocktake(this);
        lines.add(line);
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

    public StocktakeStatus getStatus() {
        return status;
    }

    public void setStatus(StocktakeStatus status) {
        this.status = status;
    }

    public StocktakeScope getScope() {
        return scope;
    }

    public void setScope(StocktakeScope scope) {
        this.scope = scope;
    }

    public boolean isBlind() {
        return blind;
    }

    public void setBlind(boolean blind) {
        this.blind = blind;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Long getStartedBy() {
        return startedBy;
    }

    public void setStartedBy(Long startedBy) {
        this.startedBy = startedBy;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public void setClosedAt(Instant closedAt) {
        this.closedAt = closedAt;
    }

    public List<StocktakeLine> getLines() {
        return lines;
    }

    public void setLines(List<StocktakeLine> lines) {
        this.lines = lines;
    }
}
