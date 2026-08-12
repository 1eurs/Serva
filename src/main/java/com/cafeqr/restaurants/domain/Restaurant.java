package com.cafeqr.restaurants.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "restaurants")
public class Restaurant extends BaseEntity {

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "slug", nullable = false)
    private String slug;

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(name = "phone")
    private String phone;

    @Column(name = "email")
    private String email;

    @Column(name = "instagram_url")
    private String instagramUrl;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency = "OMR";

    @Column(name = "vat_enabled", nullable = false)
    private boolean vatEnabled = true;

    @Column(name = "vat_rate", nullable = false)
    private BigDecimal vatRate = new BigDecimal("5");

    @Column(name = "payment_method_selection_enabled", nullable = false)
    private boolean paymentMethodSelectionEnabled = false;

    /**
     * Whether dine-in orders consume disposables. Some cafés serve dine-in in ceramic and only
     * burn cups on car orders; others use paper for everything. Packaging rules resolve against
     * this rather than the product assuming one style.
     */
    @Column(name = "disposables_for_dine_in", nullable = false)
    private boolean disposablesForDineIn = false;

    /**
     * Whether running out of an ingredient may take a menu item off sale by itself.
     *
     * <p>True keeps the automatic behaviour. False keeps every calculation — the draw-down,
     * the ledger, the cost, the low-stock warnings — and only stops stock from hiding
     * anything on its own, because a count that has drifted must not be allowed to refuse
     * a drink the café can plainly make.
     */
    @Column(name = "auto_hide_out_of_stock", nullable = false)
    private boolean autoHideOutOfStock = true;

    @Column(name = "menu_theme", nullable = false, length = 40)
    private String theme = "onyx";

    @Column(name = "menu_theme_custom_json")
    private String themeCustomJson;

    /** Receipt customization JSON (style preset, logo toggle, footer, VAT/CR numbers). */
    @Column(name = "receipt_settings_json")
    private String receiptSettingsJson;

    /** Premium "Pro look" entitlement — unlocks the advanced theme editor for this café. */
    @Column(name = "premium_look", nullable = false)
    private boolean premiumLook = false;

    /** Pricing tier — gates Pro analytics features. Defaults to PRO on rollout. */
    @Enumerated(EnumType.STRING)
    @Column(name = "plan", nullable = false, length = 20)
    private Plan plan = Plan.STANDARD;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getLogoUrl() {
        return logoUrl;
    }

    public void setLogoUrl(String logoUrl) {
        this.logoUrl = logoUrl;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getInstagramUrl() {
        return instagramUrl;
    }

    public void setInstagramUrl(String instagramUrl) {
        this.instagramUrl = instagramUrl;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public boolean isVatEnabled() {
        return vatEnabled;
    }

    public void setVatEnabled(boolean vatEnabled) {
        this.vatEnabled = vatEnabled;
    }

    public boolean isDisposablesForDineIn() {
        return disposablesForDineIn;
    }

    public void setDisposablesForDineIn(boolean disposablesForDineIn) {
        this.disposablesForDineIn = disposablesForDineIn;
    }

    public boolean isAutoHideOutOfStock() {
        return autoHideOutOfStock;
    }

    public void setAutoHideOutOfStock(boolean autoHideOutOfStock) {
        this.autoHideOutOfStock = autoHideOutOfStock;
    }

    public BigDecimal getVatRate() {
        return vatRate;
    }

    public void setVatRate(BigDecimal vatRate) {
        this.vatRate = vatRate;
    }

    public boolean isPaymentMethodSelectionEnabled() {
        return paymentMethodSelectionEnabled;
    }

    public void setPaymentMethodSelectionEnabled(boolean paymentMethodSelectionEnabled) {
        this.paymentMethodSelectionEnabled = paymentMethodSelectionEnabled;
    }

    public String getTheme() {
        return theme;
    }

    public void setTheme(String theme) {
        this.theme = theme;
    }

    public String getThemeCustomJson() {
        return themeCustomJson;
    }

    public void setThemeCustomJson(String themeCustomJson) {
        this.themeCustomJson = themeCustomJson;
    }

    public String getReceiptSettingsJson() {
        return receiptSettingsJson;
    }

    public void setReceiptSettingsJson(String receiptSettingsJson) {
        this.receiptSettingsJson = receiptSettingsJson;
    }

    public boolean isPremiumLook() {
        return premiumLook;
    }

    public void setPremiumLook(boolean premiumLook) {
        this.premiumLook = premiumLook;
    }

    public Plan getPlan() {
        return plan;
    }

    public void setPlan(Plan plan) {
        this.plan = plan;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
