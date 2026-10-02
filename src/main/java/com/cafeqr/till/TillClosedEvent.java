package com.cafeqr.till;

import java.time.LocalDate;

/**
 * Raised when a branch's till is closed. Consumers run after the close commits — the day is now
 * final enough to report on. {@code businessDate} is the café-day the session belonged to.
 */
public record TillClosedEvent(Long branchId, Long restaurantId, LocalDate businessDate) {}
