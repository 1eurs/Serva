package com.cafeqr.stock.domain;

/** What sort of thing a {@link StockItem} is. */
public enum StockKind {
    /** Consumed by recipes: beans, milk, syrup, cups. */
    INGREDIENT,
    /** A countable finished thing sold as-is: croissant, bottled water. Backs SIMPLE menu items. */
    GOOD,
    /**
     * Made in-house from other stock — simple syrup, a tray of cookies. Has its own recipe
     * (via {@code recipe_lines.prepItemId}) and a batch yield; producing one batch consumes
     * the recipe and adds {@code batchYieldBase} of this item.
     */
    PREP
}
