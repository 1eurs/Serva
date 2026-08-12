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

/** One item on a {@link PurchaseOrder}, tracking ordered vs already-received quantity. */
@Entity
@Table(name = "purchase_order_lines")
public class PurchaseOrderLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "purchase_order_id", nullable = false)
    private PurchaseOrder purchaseOrder;

    @Column(name = "stock_item_id", nullable = false)
    private Long stockItemId;

    @Column(name = "quantity_base", nullable = false)
    private BigDecimal quantityBase;

    @Column(name = "quantity_received_base", nullable = false)
    private BigDecimal quantityReceivedBase = BigDecimal.ZERO;

    @Column(name = "unit_cost")
    private BigDecimal unitCost;

    public boolean isFullyReceived() {
        return quantityReceivedBase.compareTo(quantityBase) >= 0;
    }

    public BigDecimal outstandingBase() {
        BigDecimal left = quantityBase.subtract(quantityReceivedBase);
        return left.signum() > 0 ? left : BigDecimal.ZERO;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public PurchaseOrder getPurchaseOrder() {
        return purchaseOrder;
    }

    public void setPurchaseOrder(PurchaseOrder purchaseOrder) {
        this.purchaseOrder = purchaseOrder;
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

    public BigDecimal getQuantityReceivedBase() {
        return quantityReceivedBase;
    }

    public void setQuantityReceivedBase(BigDecimal quantityReceivedBase) {
        this.quantityReceivedBase = quantityReceivedBase;
    }

    public BigDecimal getUnitCost() {
        return unitCost;
    }

    public void setUnitCost(BigDecimal unitCost) {
        this.unitCost = unitCost;
    }
}
