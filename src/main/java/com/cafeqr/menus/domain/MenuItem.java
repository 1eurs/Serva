package com.cafeqr.menus.domain;

import com.cafeqr.common.domain.BaseEntity;
import com.cafeqr.stock.domain.StockMode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "menu_items")
public class MenuItem extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    /** Null = available at every branch of the restaurant. */
    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "name_ar", nullable = false)
    private String nameAr;

    @Column(name = "description_en")
    private String descriptionEn;

    @Column(name = "description_ar")
    private String descriptionAr;

    @Column(name = "price", nullable = false)
    private BigDecimal price;

    /** Optional discount. Null type = no discount. See {@link DiscountType}. */
    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", length = 16)
    private DiscountType discountType;

    /** Percent off (PERCENT) or absolute sale price (FIXED). Meaningless when discountType is null. */
    @Column(name = "discount_value")
    private BigDecimal discountValue;

    /** Start of the discount window (inclusive). Null = active from the start. */
    @Column(name = "discount_starts_at")
    private Instant discountStartsAt;

    /** End of the discount window (exclusive). Null = never expires. */
    @Column(name = "discount_ends_at")
    private Instant discountEndsAt;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "available", nullable = false)
    private boolean available = true;

    /**
     * How much inventory tracking this item opts into. See {@link StockMode} — the ladder runs
     * NONE -> DAILY_LIMIT -> SIMPLE -> RECIPE and every rung is useful on its own.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "stock_mode", nullable = false, length = 16)
    private StockMode stockMode = StockMode.NONE;

    /** SIMPLE mode only: the countable good backing this item (auto-created when the mode is set). */
    @Column(name = "stock_item_id")
    private Long stockItemId;

    /** DAILY_LIMIT mode only: the cap. Null means uncapped even while the mode is set. */
    @Column(name = "daily_limit")
    private Integer dailyLimit;

    /** How many have gone out on {@link #dailyLimitDate}. */
    @Column(name = "daily_limit_sold", nullable = false)
    private int dailyLimitSold = 0;

    /** The café-local day {@link #dailyLimitSold} belongs to; a different day means it has reset. */
    @Column(name = "daily_limit_date")
    private LocalDate dailyLimitDate;

    /**
     * True when Serva switched this item off because stock ran out, rather than the owner
     * switching it off deliberately. Restocking only re-enables items carrying this flag — an
     * item the owner meant to keep hidden stays hidden.
     */
    @Column(name = "auto_unavailable", nullable = false)
    private boolean autoUnavailable = false;

    /** Disposables consumed when this item has no size option carrying its own rule. */
    @Column(name = "packaging_rule_id")
    private Long packagingRuleId;

    @Column(name = "preparation_time_minutes")
    private Integer preparationTimeMinutes;

    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    /** Photo gallery (slider in the detail view). First image is the grid thumbnail. */
    @OneToMany(mappedBy = "menuItem", fetch = FetchType.EAGER,
            cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC, id ASC")
    private List<MenuItemImage> images = new ArrayList<>();

    /** Flexible option groups (size, milk type, extras, …). */
    @OneToMany(mappedBy = "menuItem", fetch = FetchType.EAGER,
            cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC, id ASC")
    private List<MenuItemOptionGroup> optionGroups = new ArrayList<>();

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

    public Long getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Long categoryId) {
        this.categoryId = categoryId;
    }

    public String getNameEn() {
        return nameEn;
    }

    public void setNameEn(String nameEn) {
        this.nameEn = nameEn;
    }

    public String getNameAr() {
        return nameAr;
    }

    public void setNameAr(String nameAr) {
        this.nameAr = nameAr;
    }

    public String getDescriptionEn() {
        return descriptionEn;
    }

    public void setDescriptionEn(String descriptionEn) {
        this.descriptionEn = descriptionEn;
    }

    public String getDescriptionAr() {
        return descriptionAr;
    }

    public void setDescriptionAr(String descriptionAr) {
        this.descriptionAr = descriptionAr;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public DiscountType getDiscountType() {
        return discountType;
    }

    public void setDiscountType(DiscountType discountType) {
        this.discountType = discountType;
    }

    public BigDecimal getDiscountValue() {
        return discountValue;
    }

    public void setDiscountValue(BigDecimal discountValue) {
        this.discountValue = discountValue;
    }

    public Instant getDiscountStartsAt() {
        return discountStartsAt;
    }

    public void setDiscountStartsAt(Instant discountStartsAt) {
        this.discountStartsAt = discountStartsAt;
    }

    public Instant getDiscountEndsAt() {
        return discountEndsAt;
    }

    public void setDiscountEndsAt(Instant discountEndsAt) {
        this.discountEndsAt = discountEndsAt;
    }

    /** True when a discount is configured and {@code now} falls within its (optional) window. */
    public boolean discountActive(Instant now) {
        if (discountType == null || discountValue == null || discountValue.signum() <= 0) {
            return false;
        }
        if (discountStartsAt != null && now.isBefore(discountStartsAt)) {
            return false;
        }
        return discountEndsAt == null || now.isBefore(discountEndsAt);
    }

    /**
     * The price actually charged for this item at {@code now}: the discounted base when a
     * discount is active, otherwise the plain base price. Option price deltas stack on top of
     * this (see {@code OrderService.addItems}). Scale 3, HALF_UP — matching money columns.
     */
    public BigDecimal effectivePrice(Instant now) {
        if (!discountActive(now)) {
            return price;
        }
        BigDecimal effective = discountType == DiscountType.PERCENT
                ? price.multiply(BigDecimal.valueOf(100).subtract(discountValue))
                        .divide(BigDecimal.valueOf(100), 3, RoundingMode.HALF_UP)
                : discountValue.setScale(3, RoundingMode.HALF_UP);
        // Never let a misconfigured discount produce a price at/above the original or below zero.
        if (effective.signum() < 0 || effective.compareTo(price) >= 0) {
            return price;
        }
        return effective;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public boolean isAvailable() {
        return available;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }

    // --------------------------------------------------------------- stock

    /**
     * How many are still sellable today under {@link StockMode#DAILY_LIMIT}, or null when this
     * item isn't capped. The tally resets implicitly: a {@code dailyLimitDate} that isn't
     * {@code today} means nothing has gone out yet today, so no scheduled job is needed.
     */
    public Integer remainingToday(LocalDate today) {
        if (stockMode != StockMode.DAILY_LIMIT || dailyLimit == null) {
            return null;
        }
        int soldToday = today.equals(dailyLimitDate) ? dailyLimitSold : 0;
        return Math.max(0, dailyLimit - soldToday);
    }

    /**
     * Books {@code quantity} against today's cap, rolling the tally over to a new day first.
     * Returns false (changing nothing) when the cap can't cover it.
     */
    public boolean consumeDailyLimit(LocalDate today, int quantity) {
        if (stockMode != StockMode.DAILY_LIMIT || dailyLimit == null) {
            return true;
        }
        if (!today.equals(dailyLimitDate)) {
            dailyLimitDate = today;
            dailyLimitSold = 0;
        }
        if (dailyLimitSold + quantity > dailyLimit) {
            return false;
        }
        dailyLimitSold += quantity;
        return true;
    }

    /** Gives back {@code quantity} when an accepted order is cancelled the same day. */
    public void releaseDailyLimit(LocalDate today, int quantity) {
        if (stockMode == StockMode.DAILY_LIMIT && today.equals(dailyLimitDate)) {
            dailyLimitSold = Math.max(0, dailyLimitSold - quantity);
        }
    }

    public StockMode getStockMode() {
        return stockMode;
    }

    public void setStockMode(StockMode stockMode) {
        this.stockMode = stockMode;
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

    public int getDailyLimitSold() {
        return dailyLimitSold;
    }

    public void setDailyLimitSold(int dailyLimitSold) {
        this.dailyLimitSold = dailyLimitSold;
    }

    public LocalDate getDailyLimitDate() {
        return dailyLimitDate;
    }

    public void setDailyLimitDate(LocalDate dailyLimitDate) {
        this.dailyLimitDate = dailyLimitDate;
    }

    public boolean isAutoUnavailable() {
        return autoUnavailable;
    }

    public void setAutoUnavailable(boolean autoUnavailable) {
        this.autoUnavailable = autoUnavailable;
    }

    public Long getPackagingRuleId() {
        return packagingRuleId;
    }

    public void setPackagingRuleId(Long packagingRuleId) {
        this.packagingRuleId = packagingRuleId;
    }

    public Integer getPreparationTimeMinutes() {
        return preparationTimeMinutes;
    }

    public void setPreparationTimeMinutes(Integer preparationTimeMinutes) {
        this.preparationTimeMinutes = preparationTimeMinutes;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public List<MenuItemImage> getImages() {
        return images;
    }

    public void setImages(List<MenuItemImage> images) {
        this.images = images;
    }

    public List<MenuItemOptionGroup> getOptionGroups() {
        return optionGroups;
    }

    public void setOptionGroups(List<MenuItemOptionGroup> optionGroups) {
        this.optionGroups = optionGroups;
    }
}
