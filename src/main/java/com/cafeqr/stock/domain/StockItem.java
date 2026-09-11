package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import com.cafeqr.common.domain.BilingualNamed;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One thing on the shelf: a name, how much of it there is, and when to buy more.
 *
 * <p>{@code quantity} is the truth, not a cached balance — there is no ledger behind it to
 * reconcile against. Only a person moves it: a delivery adds, a recount replaces. That is the
 * deal the feature makes. It will never tell the owner something they did not tell it, and in
 * exchange it never quietly drifts away from what is actually in the room.
 */
@Entity
@Table(name = "stock_items")
public class StockItem extends BaseEntity implements BilingualNamed {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    /** Stock is physical: two branches have two fridges, so they hold two rows of milk. */
    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "name_en")
    private String nameEn;

    @Column(name = "name_ar")
    private String nameAr;

    @Enumerated(EnumType.STRING)
    @Column(name = "unit", nullable = false, length = 8)
    private StockUnit unit;

    @Column(name = "quantity", nullable = false, precision = 14, scale = 3)
    private BigDecimal quantity = BigDecimal.ZERO;

    /**
     * Buy more at or below this. Null means nobody has said yet — which is not the same as
     * zero, and the wall draws it differently: an empty outline rather than an empty tin.
     */
    @Column(name = "reorder_point", precision = 14, scale = 3)
    private BigDecimal reorderPoint;

    /** What one unit costs. Optional — the stock is worth recording without the invoice. */
    @Column(name = "unit_price", precision = 14, scale = 3)
    private BigDecimal unitPrice;

    /** When a person last said what was there. How old the figure is decides how far to trust it. */
    @Column(name = "last_moved_at")
    private Instant lastMovedAt;

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

    @Override
    public String getNameEn() {
        return nameEn;
    }

    @Override
    public void setNameEn(String nameEn) {
        this.nameEn = nameEn;
    }

    @Override
    public String getNameAr() {
        return nameAr;
    }

    @Override
    public void setNameAr(String nameAr) {
        this.nameAr = nameAr;
    }

    public StockUnit getUnit() {
        return unit;
    }

    public void setUnit(StockUnit unit) {
        this.unit = unit;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public void setQuantity(BigDecimal quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getReorderPoint() {
        return reorderPoint;
    }

    public void setReorderPoint(BigDecimal reorderPoint) {
        this.reorderPoint = reorderPoint;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public void setUnitPrice(BigDecimal unitPrice) {
        this.unitPrice = unitPrice;
    }

    public Instant getLastMovedAt() {
        return lastMovedAt;
    }

    public void setLastMovedAt(Instant lastMovedAt) {
        this.lastMovedAt = lastMovedAt;
    }
}
