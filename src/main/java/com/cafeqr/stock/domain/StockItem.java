package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * One thing the café holds: an ingredient, a countable good, or an in-house prep item.
 *
 * <p>Quantities live in {@link #baseUnit} everywhere — the ledger, recipes, on-hand. The café
 * buys in {@link #purchaseUnitLabel} ("1 kg bag") and {@link #purchaseUnitSize} converts that
 * to base units, so a recipe never has to know what the delivery looked like.
 */
@Entity
@Table(name = "stock_items")
public class StockItem extends BaseEntity {

    private static final int COST_SCALE = 6;

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "name_ar", nullable = false)
    private String nameAr;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    private StockKind kind = StockKind.INGREDIENT;

    @Enumerated(EnumType.STRING)
    @Column(name = "base_unit", nullable = false, length = 8)
    private BaseUnit baseUnit = BaseUnit.G;

    /** How the café buys it, for display only — "1 kg bag", "carton of 12". */
    @Column(name = "purchase_unit_label", length = 60)
    private String purchaseUnitLabel;

    /** Base units in one purchase unit. A 1 kg bag of beans is 1000. */
    @Column(name = "purchase_unit_size", nullable = false)
    private BigDecimal purchaseUnitSize = BigDecimal.ONE;

    /** Rolling average cost per base unit, re-averaged on every RECEIVE. Drives plate cost. */
    @Column(name = "cost_per_base_unit", nullable = false)
    private BigDecimal costPerBaseUnit = BigDecimal.ZERO;

    /**
     * Expected yield loss as a percent — grinder retention, trim, spillage. A recipe asking
     * for 18 g of a bean with 2% waste actually draws 18.36 g, which is what makes the
     * theoretical balance match reality closely enough for variance to mean something.
     */
    @Column(name = "waste_pct", nullable = false)
    private BigDecimal wastePct = BigDecimal.ZERO;

    /** PREP items only: base units produced by one batch. */
    @Column(name = "batch_yield_base")
    private BigDecimal batchYieldBase;

    /**
     * About how many servings one purchase unit yields — "a kilo of beans is 55 drinks".
     *
     * <p>This is an authoring aid, not a second engine. It is the same fact as a recipe
     * line said the way the trade says it, and {@link #servingQuantityBase()} converts:
     * a dish that uses this item draws {@code purchaseUnitSize / servingsPerPack}. Null
     * means nobody has answered yet, which is why it is not a primitive — zero servings
     * per pack is a different claim from "don't know".
     */
    @Column(name = "servings_per_pack")
    private BigDecimal servingsPerPack;

    @Column(name = "category", length = 60)
    private String category;

    @Enumerated(EnumType.STRING)
    @Column(name = "count_frequency", length = 16)
    private CountFrequency countFrequency;

    /** Comma-separated {@link Allergen} names; see {@link #allergenSet()}. */
    @Column(name = "allergens", length = 200)
    private String allergens;

    /** Per-100-base-unit nutrition as a JSON object. Optional, rolled up along recipes. */
    @Column(name = "nutrition_json", columnDefinition = "text")
    private String nutritionJson;

    @Column(name = "supplier_id")
    private Long supplierId;

    @Column(name = "archived", nullable = false)
    private boolean archived = false;

    /**
     * Base units one serving of this item costs, derived from the yield — the quantity a
     * recipe line gets when a dish is authored by ticking this item rather than by typing
     * grams. A kilo bag (1000 g) that makes 55 drinks gives 18.182 g.
     *
     * <p>Null when the yield has not been answered, or when either side of the division is
     * zero: there is no honest quantity to write, and writing zero would silently make the
     * dish free.
     */
    public BigDecimal servingQuantityBase() {
        if (servingsPerPack == null || servingsPerPack.signum() <= 0
                || purchaseUnitSize == null || purchaseUnitSize.signum() <= 0) {
            return null;
        }
        return purchaseUnitSize.divide(servingsPerPack, 3, RoundingMode.HALF_UP);
    }

    /** What one serving of this item costs at the current rolling average, or null if unknown. */
    public BigDecimal servingCost() {
        BigDecimal per = servingQuantityBase();
        return per == null ? null : costOf(per);
    }

    /** Base units drawn for a recipe asking for {@code quantity}, inflated by the waste allowance. */
    public BigDecimal withWaste(BigDecimal quantity) {
        if (quantity == null || wastePct == null || wastePct.signum() <= 0) {
            return quantity;
        }
        return quantity
                .multiply(BigDecimal.valueOf(100).add(wastePct))
                .divide(BigDecimal.valueOf(100), 3, RoundingMode.HALF_UP);
    }

    /** Cost of {@code quantity} base units at the current rolling average. */
    public BigDecimal costOf(BigDecimal quantity) {
        if (quantity == null || costPerBaseUnit == null) {
            return BigDecimal.ZERO;
        }
        return quantity.multiply(costPerBaseUnit).setScale(COST_SCALE, RoundingMode.HALF_UP);
    }

    public Set<Allergen> allergenSet() {
        if (allergens == null || allergens.isBlank()) {
            return EnumSet.noneOf(Allergen.class);
        }
        return Arrays.stream(allergens.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> {
                    try {
                        return Allergen.valueOf(s.toUpperCase(java.util.Locale.ROOT));
                    } catch (IllegalArgumentException ignored) {
                        return null; // tolerate rows written before an enum value was renamed
                    }
                })
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(Allergen.class)));
    }

    public void setAllergenSet(Set<Allergen> set) {
        this.allergens = (set == null || set.isEmpty())
                ? null
                : set.stream().map(Enum::name).collect(Collectors.joining(","));
    }

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
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

    public StockKind getKind() {
        return kind;
    }

    public void setKind(StockKind kind) {
        this.kind = kind;
    }

    public BaseUnit getBaseUnit() {
        return baseUnit;
    }

    public void setBaseUnit(BaseUnit baseUnit) {
        this.baseUnit = baseUnit;
    }

    public String getPurchaseUnitLabel() {
        return purchaseUnitLabel;
    }

    public void setPurchaseUnitLabel(String purchaseUnitLabel) {
        this.purchaseUnitLabel = purchaseUnitLabel;
    }

    public BigDecimal getPurchaseUnitSize() {
        return purchaseUnitSize;
    }

    public void setPurchaseUnitSize(BigDecimal purchaseUnitSize) {
        this.purchaseUnitSize = purchaseUnitSize;
    }

    public BigDecimal getCostPerBaseUnit() {
        return costPerBaseUnit;
    }

    public void setCostPerBaseUnit(BigDecimal costPerBaseUnit) {
        this.costPerBaseUnit = costPerBaseUnit;
    }

    public BigDecimal getWastePct() {
        return wastePct;
    }

    public void setWastePct(BigDecimal wastePct) {
        this.wastePct = wastePct;
    }

    public BigDecimal getBatchYieldBase() {
        return batchYieldBase;
    }

    public void setBatchYieldBase(BigDecimal batchYieldBase) {
        this.batchYieldBase = batchYieldBase;
    }

    public BigDecimal getServingsPerPack() {
        return servingsPerPack;
    }

    public void setServingsPerPack(BigDecimal servingsPerPack) {
        this.servingsPerPack = servingsPerPack;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public CountFrequency getCountFrequency() {
        return countFrequency;
    }

    public void setCountFrequency(CountFrequency countFrequency) {
        this.countFrequency = countFrequency;
    }

    public String getAllergens() {
        return allergens;
    }

    public void setAllergens(String allergens) {
        this.allergens = allergens;
    }

    public String getNutritionJson() {
        return nutritionJson;
    }

    public void setNutritionJson(String nutritionJson) {
        this.nutritionJson = nutritionJson;
    }

    public Long getSupplierId() {
        return supplierId;
    }

    public void setSupplierId(Long supplierId) {
        this.supplierId = supplierId;
    }

    public boolean isArchived() {
        return archived;
    }

    public void setArchived(boolean archived) {
        this.archived = archived;
    }
}
