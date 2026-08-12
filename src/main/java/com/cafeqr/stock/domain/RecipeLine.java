package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * One line of a bill of materials. Exactly one owner is set:
 *
 * <ul>
 *   <li>{@link #menuItemId} — the item's own base recipe.</li>
 *   <li>{@link #menuItemOptionId} — a modifier's <em>delta</em>. {@link #quantityBase} may be
 *       negative: options work on stock exactly the way they already work on price, so what a
 *       line consumes is {@code base + SUM(chosen option deltas)}. A "Large" that swaps an 8 oz
 *       cup for a 12 oz one is −1 of the first and +1 of the second.</li>
 *   <li>{@link #prepItemId} — a PREP stock item's own recipe (a sub-recipe / batch).</li>
 * </ul>
 */
@Entity
@Table(name = "recipe_lines")
public class RecipeLine extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "menu_item_id")
    private Long menuItemId;

    @Column(name = "menu_item_option_id")
    private Long menuItemOptionId;

    @Column(name = "prep_item_id")
    private Long prepItemId;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    @Column(name = "quantity_base", nullable = false)
    private BigDecimal quantityBase;

    @Enumerated(EnumType.STRING)
    @Column(name = "order_type_scope", nullable = false, length = 10)
    private OrderTypeScope orderTypeScope = OrderTypeScope.ALL;

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public Long getMenuItemId() {
        return menuItemId;
    }

    public void setMenuItemId(Long menuItemId) {
        this.menuItemId = menuItemId;
    }

    public Long getMenuItemOptionId() {
        return menuItemOptionId;
    }

    public void setMenuItemOptionId(Long menuItemOptionId) {
        this.menuItemOptionId = menuItemOptionId;
    }

    public Long getPrepItemId() {
        return prepItemId;
    }

    public void setPrepItemId(Long prepItemId) {
        this.prepItemId = prepItemId;
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

    public OrderTypeScope getOrderTypeScope() {
        return orderTypeScope;
    }

    public void setOrderTypeScope(OrderTypeScope orderTypeScope) {
        this.orderTypeScope = orderTypeScope;
    }
}
