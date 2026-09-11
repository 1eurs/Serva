package com.cafeqr.restaurants.domain;

import com.cafeqr.common.domain.BaseEntity;
import com.cafeqr.common.domain.BilingualNamed;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "restaurants")
public class Restaurant extends BaseEntity implements BilingualNamed {

    @Column(name = "name", nullable = false)
    private String name;

    /**
     * The café's name in each language, mirroring how every menu item is named. Either may be
     * null — plenty of cafés have only ever written their name one way — and the reader falls
     * back to the other rather than showing an empty header.
     */
    @Column(name = "name_en", length = 150)
    private String nameEn;

    @Column(name = "name_ar", length = 150)
    private String nameAr;

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

    @Column(name = "menu_theme", nullable = false, length = 40)
    private String theme = "onyx";

    @Column(name = "menu_theme_custom_json")
    private String themeCustomJson;

    /** Receipt customization JSON (style preset, logo toggle, footer, VAT/CR numbers). */
    @Column(name = "receipt_settings_json")
    private String receiptSettingsJson;

    /**
     * The house card shown at the top of the public menu (show flag + bilingual note),
     * as a frontend-owned JSON document. NULL = no card. Kept out of the theme document
     * on purpose: this is the café's content, not its paint.
     */
    @Column(name = "menu_info_json")
    private String menuInfoJson;

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

    /** The name to print where only one will fit — a receipt, a loyalty card, an email subject. */
    public String displayName() {
        return nameAr != null ? nameAr : (nameEn != null ? nameEn : name);
    }

    /**
     * Keeps the legacy single {@code name} column in step with the bilingual pair, so the
     * callers still reading it (receipts, loyalty portal, onboarding emails) never see a name
     * the owner has since changed. Arabic wins because that is what a café here prints.
     */
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

    public String getMenuInfoJson() {
        return menuInfoJson;
    }

    public void setMenuInfoJson(String menuInfoJson) {
        this.menuInfoJson = menuInfoJson;
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
