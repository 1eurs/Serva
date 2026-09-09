package com.cafeqr.branches.domain;

import com.cafeqr.common.domain.BaseEntity;
import com.cafeqr.common.domain.BilingualNamed;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

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

    public void setCounterMode(boolean counterMode) {
        this.counterMode = counterMode;
    }
}
