package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * A cap on one menu item at one branch: no more than this many go out in a café day.
 *
 * <p>Per branch because the tally that enforces it is, and because "twelve today" belongs beside
 * the shelf that bakes them. What the item takes from that shelf lives in {@link RecipeLine}.
 * A row with no cap is deleted rather than kept: an item with no rule is exactly an item with
 * no row.
 */
@Entity
@Table(name = "menu_item_stock")
public class MenuItemStock extends BaseEntity {

    @Column(name = "menu_item_id", nullable = false)
    private Long menuItemId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    /** At most this many a café day. */
    @Column(name = "daily_limit")
    private Integer dailyLimit;

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

    public Integer getDailyLimit() {
        return dailyLimit;
    }

    public void setDailyLimit(Integer dailyLimit) {
        this.dailyLimit = dailyLimit;
    }
}
