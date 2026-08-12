package com.cafeqr.stock.domain;

import com.cafeqr.orders.domain.OrderType;

/** Limits a recipe line to one service style — a ceramic dine-in latte uses no paper cup. */
public enum OrderTypeScope {
    ALL,
    DINE_IN,
    CAR;

    public boolean matches(OrderType orderType) {
        return switch (this) {
            case ALL -> true;
            case DINE_IN -> orderType == OrderType.DINE_IN;
            case CAR -> orderType == OrderType.CAR;
        };
    }
}
