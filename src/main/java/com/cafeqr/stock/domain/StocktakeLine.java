package com.cafeqr.stock.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/** One item being counted. {@code countedBase} stays null until a human actually counts it. */
@Entity
@Table(name = "stocktake_lines")
public class StocktakeLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "stocktake_id", nullable = false)
    private Stocktake stocktake;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    /** What the system believed when the count was opened. Hidden from staff on a blind count. */
    @Column(name = "expected_base", nullable = false)
    private BigDecimal expectedBase;

    @Column(name = "counted_base")
    private BigDecimal countedBase;

    /** Cost snapshot so the variance can be valued even if the item is re-priced later. */
    @Column(name = "unit_cost")
    private BigDecimal unitCost;

    public boolean isCounted() {
        return countedBase != null;
    }

    /** Counted minus expected: negative means stock went missing. Null until counted. */
    public BigDecimal variance() {
        return countedBase == null ? null : countedBase.subtract(expectedBase);
    }

    /** Money value of the variance, negative for a loss. */
    public BigDecimal varianceValue() {
        BigDecimal v = variance();
        if (v == null || unitCost == null) {
            return BigDecimal.ZERO;
        }
        return v.multiply(unitCost);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Stocktake getStocktake() {
        return stocktake;
    }

    public void setStocktake(Stocktake stocktake) {
        this.stocktake = stocktake;
    }

    public Long getStockItemId() {
        return stockItemId;
    }

    public void setStockItemId(Long stockItemId) {
        this.stockItemId = stockItemId;
    }

    public BigDecimal getExpectedBase() {
        return expectedBase;
    }

    public void setExpectedBase(BigDecimal expectedBase) {
        this.expectedBase = expectedBase;
    }

    public BigDecimal getCountedBase() {
        return countedBase;
    }

    public void setCountedBase(BigDecimal countedBase) {
        this.countedBase = countedBase;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }
}
