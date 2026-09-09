package com.cafeqr.analytics.dto;

/** Per-staff order-handling stats: throughput, accept latency, decline rate. */
public record StaffPerformanceResponse(
        Long actorUserId,
        /** Snapshot taken at event time; the pair below is the staff member's name today. */
        String actorName,
        String actorNameEn,
        String actorNameAr,
        long accepted,
        long declined,
        long completed,
        Double avgAcceptSeconds
) {
}