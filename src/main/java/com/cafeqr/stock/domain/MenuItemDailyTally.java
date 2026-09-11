package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * How many of one menu item one branch has sold in one café day.
 *
 * <p>Counted for every accepted line, limit or not, so a limit set in the afternoon honestly
 * includes the morning. Written with a native upsert (see the repository) because two orders
 * for the same item can be accepted in the same second and a find-then-save would lose one.
 *
 * <p>Read-only from Java's point of view: the entity exists so the row can be queried; every
 * write goes through the repository's atomic statements.
 */
@Entity
@Table(name = "menu_item_daily_tally")
public class MenuItemDailyTally extends BaseEntity {

    @Column(name = "menu_item_id", nullable = false)
    private Long menuItemId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "cafe_day", nullable = false)
    private LocalDate cafeDay;

    @Column(name = "sold", nullable = false)
    private int sold;

    public Long getMenuItemId() {
        return menuItemId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public LocalDate getCafeDay() {
        return cafeDay;
    }

    public int getSold() {
        return sold;
    }
}
