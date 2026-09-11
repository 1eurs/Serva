package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * How a customer's choice changes what a menu item takes from the shelf.
 *
 * <p>Two shapes. A <em>substitution</em> names a tin in the base recipe and the tin to pour from
 * instead, same quantity — "Almond Milk" sends the latte's 200 ml to the almond carton. An
 * <em>addition</em> names a tin and how much on top — "Extra shot" is 18 g more beans.
 *
 * <p>Keyed by the option's name within its group, because the menu editor rebuilds option ids on
 * every save and the order line's snapshot carries the name anyway.
 */
@Entity
@Table(name = "option_recipe_lines")
public class OptionRecipeLine extends BaseEntity {

    @Column(name = "menu_item_id", nullable = false)
    private Long menuItemId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "group_name", nullable = false, length = 150)
    private String groupName;

    @Column(name = "option_name", nullable = false, length = 150)
    private String optionName;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    /** Set for a substitution: the base tin this option stands in for. */
    @Column(name = "replaces_stock_item_id")
    private Long replacesStockItemId;

    @Column(name = "quantity", precision = 14, scale = 3)
    private BigDecimal quantity;

    @Enumerated(EnumType.STRING)
    @Column(name = "unit", length = 8)
    private StockUnit unit;

    public boolean isSubstitution() {
        return replacesStockItemId != null;
    }

    public Long getMenuItemId() { return menuItemId; }
    public void setMenuItemId(Long menuItemId) { this.menuItemId = menuItemId; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getOptionName() { return optionName; }
    public void setOptionName(String optionName) { this.optionName = optionName; }
    public Long getStockItemId() { return stockItemId; }
    public void setStockItemId(Long stockItemId) { this.stockItemId = stockItemId; }
    public Long getReplacesStockItemId() { return replacesStockItemId; }
    public void setReplacesStockItemId(Long replacesStockItemId) { this.replacesStockItemId = replacesStockItemId; }
    public BigDecimal getQuantity() { return quantity; }
    public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
    public StockUnit getUnit() { return unit; }
    public void setUnit(StockUnit unit) { this.unit = unit; }
}
