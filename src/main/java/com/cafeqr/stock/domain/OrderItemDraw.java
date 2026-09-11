package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * What one order line took from one tin.
 *
 * <p>A latte draws from two tins, so the record is per (line, tin) rather than on the line. It is
 * what a cancel reads to put things back — never the current recipe, which may have changed —
 * and what the tin's sheet sums to say "used since you last counted". Deleted on restore, so a
 * cancelled order leaves no trace of having used anything.
 */
@Entity
@Table(name = "order_item_draws")
public class OrderItemDraw extends BaseEntity {

    @Column(name = "order_item_id", nullable = false)
    private Long orderItemId;

    /** Null once the tin has been thrown away — nothing left to give back. */
    @Column(name = "stock_item_id")
    private Long stockItemId;

    /** What was taken, in the tin's own unit; less than {@code wanted} when the count was clamped. */
    @Column(name = "quantity", nullable = false, precision = 14, scale = 3)
    private BigDecimal quantity;

    /** What the recipe asked for. The shelf is restored from {@code quantity}; usage reads this. */
    @Column(name = "wanted", nullable = false, precision = 14, scale = 3)
    private BigDecimal wanted;

    public Long getOrderItemId() {
        return orderItemId;
    }

    public void setOrderItemId(Long orderItemId) {
        this.orderItemId = orderItemId;
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

    public BigDecimal getWanted() {
        return wanted;
    }

    public void setWanted(BigDecimal wanted) {
        this.wanted = wanted;
    }
}
