package com.cafeqr.menus.domain;

import com.cafeqr.common.domain.BaseEntity;
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

/** One choice within an option group, with a price delta (can be negative or zero). */
@Entity
@Table(name = "menu_item_options")
public class MenuItemOption extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "option_group_id", nullable = false)
    private MenuItemOptionGroup optionGroup;

    @Column(name = "name_en", nullable = false, length = 150)
    private String nameEn;

    @Column(name = "name_ar", nullable = false, length = 150)
    private String nameAr;

    @Column(name = "price_delta", nullable = false)
    private BigDecimal priceDelta = BigDecimal.ZERO;

    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    /**
     * Disposables this choice implies — the size the customer picked decides the cup. Set here
     * it wins over the item's own rule, which is what makes "Large uses a 12 oz cup" one click
     * instead of a pair of hand-typed +1/-1 recipe lines.
     */
    @Column(name = "packaging_rule_id")
    private Long packagingRuleId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public MenuItemOptionGroup getOptionGroup() { return optionGroup; }
    public void setOptionGroup(MenuItemOptionGroup optionGroup) { this.optionGroup = optionGroup; }
    public String getNameEn() { return nameEn; }
    public void setNameEn(String nameEn) { this.nameEn = nameEn; }
    public String getNameAr() { return nameAr; }
    public void setNameAr(String nameAr) { this.nameAr = nameAr; }
    public BigDecimal getPriceDelta() { return priceDelta; }
    public void setPriceDelta(BigDecimal priceDelta) { this.priceDelta = priceDelta; }
    public int getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(int displayOrder) { this.displayOrder = displayOrder; }
    public Long getPackagingRuleId() { return packagingRuleId; }
    public void setPackagingRuleId(Long packagingRuleId) { this.packagingRuleId = packagingRuleId; }
}