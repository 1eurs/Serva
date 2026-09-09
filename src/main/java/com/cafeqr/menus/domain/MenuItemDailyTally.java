package com.cafeqr.menus.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;

/**
 * How many of one capped menu item have gone out at one branch today.
 *
 * <p>The cap itself ({@link MenuItem#getDailyLimit()}) is a property of the item and reads the
 * same everywhere — "we bake twenty a day" — but the tally against it is physical, like stock,
 * and belongs to the branch that did the selling. It used to sit on {@code menu_items} beside
 * the cap, which meant a restaurant-wide item shared one counter: the busy branch selling its
 * twenty sold out the quiet one, and a cancellation at either handed the slot to the other.
 *
 * <p>One row per (item, branch), rolled over in place rather than one row per day: a
 * {@link #tallyDate} that is not today means nothing has gone out yet today, so the table
 * stays the size of the menu and no nightly job is needed.
 */
@Entity
@Table(name = "menu_item_daily_tally")
@IdClass(MenuItemDailyTally.Key.class)
public class MenuItemDailyTally {

    @Id
    @Column(name = "menu_item_id")
    private Long menuItemId;

    @Id
    @Column(name = "branch_id")
    private Long branchId;

    /** The café-local day {@link #sold} belongs to; a different day means it has reset. */
    @Column(name = "tally_date", nullable = false)
    private LocalDate tallyDate;

    @Column(name = "sold", nullable = false)
    private int sold = 0;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }

    /** How many have gone out on {@code today}, which is zero once the row has gone stale. */
    public int soldOn(LocalDate today) {
        return today.equals(tallyDate) ? sold : 0;
    }

    /** Moves the row on to {@code today}, clearing yesterday's count, before it is written to. */
    public void rollOverTo(LocalDate today) {
        if (!today.equals(tallyDate)) {
            this.tallyDate = today;
            this.sold = 0;
        }
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

    public LocalDate getTallyDate() {
        return tallyDate;
    }

    public void setTallyDate(LocalDate tallyDate) {
        this.tallyDate = tallyDate;
    }

    public int getSold() {
        return sold;
    }

    public void setSold(int sold) {
        this.sold = sold;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    /** Composite identity: one row per (item, branch). */
    public static class Key implements Serializable {
        private Long menuItemId;
        private Long branchId;

        public Key() {
        }

        public Key(Long menuItemId, Long branchId) {
            this.menuItemId = menuItemId;
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
            return Objects.equals(menuItemId, key.menuItemId) && Objects.equals(branchId, key.branchId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(menuItemId, branchId);
        }
    }
}
