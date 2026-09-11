package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * How one menu item meets the shelf at one branch.
 *
 * <p>Two facts, either or both: this menu item <em>is</em> that shelf row (one sale draws one),
 * and/or no more than this many go out in a café day. The branch is part of the identity because
 * a menu item belongs to the restaurant while a shelf row belongs to a branch — two branches have
 * two fridges — so "which croissants?" has no answer without it.
 *
 * <p>A row with neither fact is deleted rather than kept: an item with no rule is exactly an item
 * with no row, and silence is the safe default — it is never hidden.
 */
@Entity
@Table(name = "menu_item_stock")
public class MenuItemStock extends BaseEntity {

    @Column(name = "menu_item_id", nullable = false)
    private Long menuItemId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    /** One sale draws one of this. Null when the item is not backed by the shelf. */
    @Column(name = "stock_item_id")
    private Long stockItemId;

    /** At most this many a café day. Null when there is no cap. */
    @Column(name = "daily_limit")
    private Integer dailyLimit;

    public boolean isEmpty() {
        return stockItemId == null && dailyLimit == null;
    }

    public Long getMenuItemId() {
        return menuItemId;
    }

    public void setMenuItemId(Long menuItemId) {
        this.menuItemId = menuItemId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public Long getStockItemId() {
        return stockItemId;
    }

    public void setStockItemId(Long stockItemId) {
        this.stockItemId = stockItemId;
    }

    public Integer getDailyLimit() {
        return dailyLimit;
    }

    public void setDailyLimit(Integer dailyLimit) {
        this.dailyLimit = dailyLimit;
    }
}
