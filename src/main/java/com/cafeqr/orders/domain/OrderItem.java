package com.cafeqr.orders.domain;

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

/**
 * A line in an order. Name and price are snapshotted at order time so that later
 * menu edits never change historical orders.
 */
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "menu_item_id")
    private Long menuItemId;

    @Column(name = "name_en_snapshot", nullable = false)
    private String nameEnSnapshot;

    @Column(name = "name_ar_snapshot", nullable = false)
    private String nameArSnapshot;

    @Column(name = "price_snapshot", nullable = false)
    private BigDecimal priceSnapshot;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "note")
    private String note;

    @Column(name = "line_total", nullable = false)
    private BigDecimal lineTotal;

    /**
     * JSON snapshot of the option choices the customer made for this line, so the order
     * stays readable after the cafe edits or deletes an option group. Null for items
     * that had no options selected.
     */
    @Column(name = "selected_options_json", columnDefinition = "text")
    private String selectedOptionsJson;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Order getOrder() {
        return order;
    }

    public void setOrder(Order order) {
        this.order = order;
    }

    public Long getMenuItemId() {
        return menuItemId;
    }

    public void setMenuItemId(Long menuItemId) {
        this.menuItemId = menuItemId;
    }

    public String getNameEnSnapshot() {
        return nameEnSnapshot;
    }

    public void setNameEnSnapshot(String nameEnSnapshot) {
        this.nameEnSnapshot = nameEnSnapshot;
    }

    public String getNameArSnapshot() {
        return nameArSnapshot;
    }

    public void setNameArSnapshot(String nameArSnapshot) {
        this.nameArSnapshot = nameArSnapshot;
    }

    public BigDecimal getPriceSnapshot() {
        return priceSnapshot;
    }

    public void setPriceSnapshot(BigDecimal priceSnapshot) {
        this.priceSnapshot = priceSnapshot;
    }

    public int getQuantity() {
        return quantity;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }

    public void setLineTotal(BigDecimal lineTotal) {
        this.lineTotal = lineTotal;
    }

    public String getSelectedOptionsJson() {
        return selectedOptionsJson;
    }

    public void setSelectedOptionsJson(String selectedOptionsJson) {
        this.selectedOptionsJson = selectedOptionsJson;
    }

}
