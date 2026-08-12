package com.cafeqr.stock.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

/**
 * Cached on-hand for one item at one branch. Stock is physical, so it is always branch-scoped.
 *
 * <p>This is a <em>derived</em> balance: the append-only {@code stock_movements} ledger is the
 * truth. Every write here happens in the same transaction as its movement row — see
 * {@code StockService.post}. Nothing else should touch {@link #quantityBase}.
 */
@Entity
@Table(name = "stock_levels")
@IdClass(StockLevel.Key.class)
public class StockLevel {

    @Id
    @Column(name = "stock_item_id")
    private Long stockItemId;

    @Id
    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "quantity_base", nullable = false)
    private BigDecimal quantityBase = BigDecimal.ZERO;

    /** Restock target: a purchase suggestion orders up to this. */
    @Column(name = "par_level_base")
    private BigDecimal parLevelBase;

    /** Alert threshold. At or below this the item shows as low. */
    @Column(name = "reorder_point_base")
    private BigDecimal reorderPointBase;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }

    public boolean isOut() {
        return quantityBase == null || quantityBase.signum() <= 0;
    }

    public boolean isLow() {
        return reorderPointBase != null
                && quantityBase != null
                && quantityBase.compareTo(reorderPointBase) <= 0;
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

    public BigDecimal getQuantityBase() {
        return quantityBase;
    }

    public void setQuantityBase(BigDecimal quantityBase) {
        this.quantityBase = quantityBase;
    }

    public BigDecimal getParLevelBase() {
        return parLevelBase;
    }

    public void setParLevelBase(BigDecimal parLevelBase) {
        this.parLevelBase = parLevelBase;
    }

    public BigDecimal getReorderPointBase() {
        return reorderPointBase;
    }

    public void setReorderPointBase(BigDecimal reorderPointBase) {
        this.reorderPointBase = reorderPointBase;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    /** Composite identity: one row per (item, branch). */
    public static class Key implements Serializable {
        private Long stockItemId;
        private Long branchId;

        public Key() {
        }

        public Key(Long stockItemId, Long branchId) {
            this.stockItemId = stockItemId;
            this.branchId = branchId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof Key key)) {
                return false;
            }
            return Objects.equals(stockItemId, key.stockItemId) && Objects.equals(branchId, key.branchId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(stockItemId, branchId);
        }
    }
}
