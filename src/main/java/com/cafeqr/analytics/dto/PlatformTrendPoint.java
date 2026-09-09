package com.cafeqr.analytics.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One day of platform-wide activity: what was ordered, what it was worth, who joined. */
public record PlatformTrendPoint(
        LocalDate day,
        long orders,
        BigDecimal revenue,
        long newRestaurants
) {}
