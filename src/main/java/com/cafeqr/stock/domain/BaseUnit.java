package com.cafeqr.stock.domain;

/**
 * The unit a stock item is held and consumed in. Everything in the ledger, in recipes and in
 * on-hand balances is expressed in one of these — purchase units ("1 kg bag") are a display
 * convenience converted at the edge via {@code StockItem.purchaseUnitSize}.
 */
public enum BaseUnit {
    /** Grams — beans, flour, sugar. */
    G,
    /** Millilitres — milk, syrup, juice. */
    ML,
    /** Countable things — croissants, cups, lids. */
    PIECE;

    /** Sensible decimal places when showing a quantity in this unit. */
    public int displayScale() {
        return this == PIECE ? 0 : 1;
    }
}
