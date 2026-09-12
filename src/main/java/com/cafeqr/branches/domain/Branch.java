package com.cafeqr.branches.domain;

import com.cafeqr.common.domain.BaseEntity;
import com.cafeqr.common.domain.BilingualNamed;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "branches")
public class Branch extends BaseEntity implements BilingualNamed {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "name", nullable = false)
    private String name;

    /** Branch name per language, same rule as the café's: either may be null, the reader falls back. */
    @Column(name = "name_en", length = 150)
    private String nameEn;

    @Column(name = "name_ar", length = 150)
    private String nameAr;

    @Column(name = "address")
    private String address;

    @Column(name = "phone")
    private String phone;

    /** Free-form opening hours (e.g. JSON or "Sun-Thu 8:00-23:00"). */
    @Column(name = "opening_hours")
    private String openingHours;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "accepting_orders", nullable = false)
    private boolean acceptingOrders = true;

    @Column(name = "printer_enabled", nullable = false)
    private boolean printerEnabled = false;

    /**
     * Quick-service posture: staff orders open READY (the kitchen works off the printed
     * ticket, not the board) and paid ones auto-complete after a short while.
     */
    @Column(name = "counter_mode", nullable = false)
    private boolean counterMode = false;

    /**
     * When the current pause lifts by itself. Null while paused means "until somebody says
     * otherwise" — which is the pause this column exists to make rare. Meaningless while
     * {@link #acceptingOrders} is true, and cleared whenever ordering is resumed.
     */
    @Column(name = "pause_until")
    private Instant pauseUntil;

    /**
     * Whether this shop runs a counted drawer. On, an order can only exist inside an open
     * till session; off, {@link #acceptingOrders} is the whole story and the header switch is
     * a plain pause. The escape hatch matters: nobody should have to do a cash count to sell
     * a coffee if they never wanted one.
     */
    @Column(name = "till_enabled", nullable = false)
    private boolean tillEnabled = true;

    /** Take the counted figure before showing what was expected. See V67 for why. */
    @Column(name = "till_blind_count", nullable = false)
    private boolean tillBlindCount = true;

    /** Start the next session's float at last night's counted cash. */
    @Column(name = "till_carry_float", nullable = false)
    private boolean tillCarryFloat = true;

    /** Ask for a written reason when the drawer is off by more than this. Null: never ask. */
    @Column(name = "till_note_over")
    private BigDecimal tillNoteOver = new BigDecimal("1.000");

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @Override
    public String getNameEn() {
        return nameEn;
    }

    @Override
    public void setNameEn(String nameEn) {
        this.nameEn = blankToNull(nameEn);
        syncLegacyName();
    }

    @Override
    public String getNameAr() {
        return nameAr;
    }

    @Override
    public void setNameAr(String nameAr) {
        this.nameAr = blankToNull(nameAr);
        syncLegacyName();
    }

    /** The name to print where only one will fit. */
    public String displayName() {
        return nameAr != null ? nameAr : (nameEn != null ? nameEn : name);
    }

    /** Keeps the legacy single {@code name} column in step with the bilingual pair. */
    private void syncLegacyName() {
        String primary = nameAr != null ? nameAr : nameEn;
        if (primary != null) {
            this.name = primary;
        }
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getOpeningHours() {
        return openingHours;
    }

    public void setOpeningHours(String openingHours) {
        this.openingHours = openingHours;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public boolean isAcceptingOrders() {
        return acceptingOrders;
    }

    public void setAcceptingOrders(boolean acceptingOrders) {
        this.acceptingOrders = acceptingOrders;
        // Every change of mind ends the old pause. A resume has nothing left to expire, and a
        // fresh pause sets its own expiry after this call rather than inheriting yesterday's.
        this.pauseUntil = null;
    }

    public boolean isPrinterEnabled() {
        return printerEnabled;
    }

    public void setPrinterEnabled(boolean printerEnabled) {
        this.printerEnabled = printerEnabled;
    }

    public boolean isCounterMode() {
        return counterMode;
    }

    public Instant getPauseUntil() {
        return pauseUntil;
    }

    public void setPauseUntil(Instant pauseUntil) {
        this.pauseUntil = pauseUntil;
    }

    public boolean isTillEnabled() {
        return tillEnabled;
    }

    public void setTillEnabled(boolean tillEnabled) {
        this.tillEnabled = tillEnabled;
    }

    public boolean isTillBlindCount() {
        return tillBlindCount;
    }

    public void setTillBlindCount(boolean tillBlindCount) {
        this.tillBlindCount = tillBlindCount;
    }

    public boolean isTillCarryFloat() {
        return tillCarryFloat;
    }

    public void setTillCarryFloat(boolean tillCarryFloat) {
        this.tillCarryFloat = tillCarryFloat;
    }

    public BigDecimal getTillNoteOver() {
        return tillNoteOver;
    }

    public void setTillNoteOver(BigDecimal tillNoteOver) {
        this.tillNoteOver = tillNoteOver;
    }

    /**
     * Whether a customer may order right now, pause expiry included.
     *
     * <p>A timed pause is not swept by a job — there is nothing to sweep. The stored flag stays
     * false and this answer goes true again the moment the clock passes, which is the same
     * thing from every reader's point of view and cannot be left half-done by a job that did
     * not run. Resuming (or opening the till) is what actually clears the flag.
     *
     * <p>Says nothing about the till: that is a separate question with a separate answer, and
     * a branch with a closed drawer is closed regardless of what this returns.
     */
    public boolean isAcceptingOrdersNow() {
        if (acceptingOrders) {
            return true;
        }
        return pauseUntil != null && !Instant.now().isBefore(pauseUntil);
    }

    public void setCounterMode(boolean counterMode) {
        this.counterMode = counterMode;
    }
}
