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

/** One disposable inside a {@link PackagingRule} — the cup, the lid, the sleeve, the straw. */
@Entity
@Table(name = "packaging_rule_lines")
public class PackagingRuleLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "packaging_rule_id", nullable = false)
    private PackagingRule packagingRule;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    @Column(name = "quantity_base", nullable = false)
    private BigDecimal quantityBase = BigDecimal.ONE;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public PackagingRule getPackagingRule() {
        return packagingRule;
    }

    public void setPackagingRule(PackagingRule packagingRule) {
        this.packagingRule = packagingRule;
    }

    public Long getStockItemId() {
        return stockItemId;
    }

    public void setStockItemId(Long stockItemId) {
        this.stockItemId = stockItemId;
    }

    public BigDecimal getQuantityBase() {
        return quantityBase;
    }

    public void setQuantityBase(BigDecimal quantityBase) {
        this.quantityBase = quantityBase;
    }
}
