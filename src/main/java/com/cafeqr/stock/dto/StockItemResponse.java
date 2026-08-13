package com.cafeqr.stock.dto;

import com.cafeqr.stock.domain.Allergen;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;

import java.math.BigDecimal;
import java.util.List;

/**
 * One stock item together with its position at the branch being viewed. On-hand is per branch,
 * so the same item reads differently depending on where you are standing.
 */
public record StockItemResponse(
        Long id,
        String nameEn,
        String nameAr,
        String kind,
        String baseUnit,
        String purchaseUnitLabel,
        BigDecimal purchaseUnitSize,
        BigDecimal costPerBaseUnit,
        BigDecimal wastePct,
        BigDecimal batchYieldBase,
        /** About how many servings one purchase unit yields; null when nobody has said. */
        BigDecimal servingsPerPack,
        /** Base units one serving draws, derived from the yield. Null when there is no yield. */
        BigDecimal servingQuantityBase,
        /** What one serving of this item costs at the running average. Null when unknown. */
        BigDecimal servingCost,
        String category,
        String countFrequency,
        List<String> allergens,
        String nutritionJson,
        Long supplierId,
        boolean archived,
        // ---- per-branch position
        BigDecimal onHand,
        BigDecimal parLevel,
        BigDecimal reorderPoint,
        /** At or below the reorder point: time to buy more. */
        boolean low,
        /** Nothing left (or worse — a negative balance means a delivery went unlogged). */
        boolean out,
        /**
         * Whether this branch has ever recorded a figure for this item.
         *
         * <p>Never counted and counted-to-zero are different facts and only one of them is
         * news. Without this the front end had to guess at it from "no par and no reorder
         * point", which is a different question again — an item counted last night by
         * someone who never set a threshold has a real figure and no par at all.
         */
        boolean counted
) {
    public static StockItemResponse from(StockItem item, StockLevel level) {
        BigDecimal onHand = level == null ? BigDecimal.ZERO : level.getQuantityBase();
        return new StockItemResponse(
                item.getId(), item.getNameEn(), item.getNameAr(),
                item.getKind().name(), item.getBaseUnit().name(),
                item.getPurchaseUnitLabel(), item.getPurchaseUnitSize(),
                item.getCostPerBaseUnit(), item.getWastePct(), item.getBatchYieldBase(),
                item.getServingsPerPack(), item.servingQuantityBase(), item.servingCost(),
                item.getCategory(),
                item.getCountFrequency() == null ? null : item.getCountFrequency().name(),
                item.allergenSet().stream().map(Allergen::name).sorted().toList(),
                item.getNutritionJson(), item.getSupplierId(), item.isArchived(),
                onHand,
                level == null ? null : level.getParLevelBase(),
                level == null ? null : level.getReorderPointBase(),
                level != null && level.isLow(),
                /* Was `level == null || level.isOut()`, which called an item nobody has
                   counted yet "run out" — so a café that had just added its opening list
                   read "7 run out" in red before it had said a word about any of them. */
                level != null && level.isOut(),
                level != null);
    }
}
