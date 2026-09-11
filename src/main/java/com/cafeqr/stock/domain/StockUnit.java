package com.cafeqr.stock.domain;

import java.math.BigDecimal;

/**
 * What the number beside an item counts.
 *
 * <p>Five units and almost no conversion between them. The previous inventory held everything in
 * base units — grams, millilitres, pieces — so that a recipe asking for 18 g of beans could be
 * subtracted from a 1 kg bag. Nothing subtracts any more, and without that the conversion only
 * ever cost the owner: a shelf counted in grams made them read "6000.0 g" for the six kilos in
 * their hand, and a form made them say the same pack twice to get there.
 *
 * <p>So a kilo is a kilo. An item set up in KG is counted, ordered and priced in kilos, and the
 * figure that comes back out is the one that went in.
 *
 * <p>The one exception is {@link #factorTo}: a recipe may be written in a unit's ×1000 sibling,
 * because "18 g" is how a recipe is spoken and "0.018 kg" is not. That single factor is the whole
 * conversion story.
 */
public enum StockUnit {
    KG,
    G,
    L,
    ML,
    /** Things you count rather than weigh: cups, lids, bottles, croissants. */
    PIECE;

    private static final BigDecimal THOUSAND = BigDecimal.valueOf(1000);
    private static final BigDecimal THOUSANDTH = new BigDecimal("0.001");

    /**
     * Multiply a quantity in this unit by this to express it in {@code target}, or null when the
     * two do not describe the same kind of thing. Grams and litres are not the same kind of thing;
     * neither is anything and a piece.
     */
    public BigDecimal factorTo(StockUnit target) {
        if (this == target) return BigDecimal.ONE;
        if (this == G && target == KG) return THOUSANDTH;
        if (this == KG && target == G) return THOUSAND;
        if (this == ML && target == L) return THOUSANDTH;
        if (this == L && target == ML) return THOUSAND;
        return null;
    }

    public boolean compatibleWith(StockUnit other) {
        return factorTo(other) != null;
    }
}
