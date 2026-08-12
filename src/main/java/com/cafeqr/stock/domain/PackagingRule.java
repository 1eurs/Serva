package com.cafeqr.stock.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.List;

/**
 * A reusable bundle of disposables — "Large hot cup" = 1 × 12 oz cup + 1 × lid + 1 × sleeve.
 *
 * <p>Cups are the most-run-out-of item in a café and the most tedious to model: nobody is going
 * to hand-add three lines to forty drinks. So a rule is mapped onto a size <em>option</em> (or
 * onto the item when it has no size choice) and resolved at consumption time. Re-mapping a rule
 * then costs one row, not a rewrite of every recipe that used it.
 */
@Entity
@Table(name = "packaging_rules")
public class PackagingRule extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "name_en", nullable = false, length = 120)
    private String nameEn;

    @Column(name = "name_ar", nullable = false, length = 120)
    private String nameAr;

    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    @OneToMany(mappedBy = "packagingRule", fetch = FetchType.EAGER,
            cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PackagingRuleLine> lines = new ArrayList<>();

    public void addLine(PackagingRuleLine line) {
        line.setPackagingRule(this);
        lines.add(line);
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

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public List<PackagingRuleLine> getLines() {
        return lines;
    }

    public void setLines(List<PackagingRuleLine> lines) {
        this.lines = lines;
    }
}
