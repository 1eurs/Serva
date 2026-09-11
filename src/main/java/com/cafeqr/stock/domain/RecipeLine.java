package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * One ingredient of one menu item at one branch: 18 g of the beans, 200 ml of the milk.
 *
 * <p>Read for usage and days-of-cover and never for consumption — the shelf is not moved by a
 * recipe. The unit may be the shelf row's own or its ×1000 sibling ({@link StockUnit#factorTo}),
 * so a recipe can say "18 g" against a shelf counted in kilos without anyone doing the sum.
 */
@Entity
@Table(name = "recipe_lines")
public class RecipeLine extends BaseEntity {

    @Column(name = "menu_item_id", nullable = false)
    private Long menuItemId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    @Column(name = "quantity", nullable = false, precision = 14, scale = 3)
    private BigDecimal quantity;

    @Enumerated(EnumType.STRING)
    @Column(name = "unit", nullable = false, length = 8)
    private StockUnit unit;

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

    public Long getStockItemId() {
        return stockItemId;
    }

    public void setStockItemId(Long stockItemId) {
        this.stockItemId = stockItemId;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public void setQuantity(BigDecimal quantity) {
        this.quantity = quantity;
    }

    public StockUnit getUnit() {
        return unit;
    }

    public void setUnit(StockUnit unit) {
        this.unit = unit;
    }
}
