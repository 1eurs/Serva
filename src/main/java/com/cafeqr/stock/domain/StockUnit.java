package com.cafeqr.stock.domain;

/**
 * What the number beside an item counts.
 *
 * <p>Five units and no conversion between them. The previous inventory held everything in base
 * units — grams, millilitres, pieces — so that a recipe asking for 18 g of beans could be
 * subtracted from a 1 kg bag. Nothing does that any more, and without it the conversion only
 * ever cost the owner: a shelf counted in grams made them read "6000.0 g" for the six kilos in
 * their hand, and a form made them say the same pack twice to get there.
 *
 * <p>So a kilo is a kilo. An item set up in KG is counted, ordered and priced in kilos, and the
 * figure that comes back out is the one that went in.
 */
public enum StockUnit {
    KG,
    G,
    L,
    ML,
    /** Things you count rather than weigh: cups, lids, bottles, croissants. */
    PIECE
}
