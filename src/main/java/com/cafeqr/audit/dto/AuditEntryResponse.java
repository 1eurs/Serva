package com.cafeqr.audit.dto;

import com.cafeqr.audit.domain.AuditEntry;

import java.time.Instant;

public record AuditEntryResponse(
        Long id,
        Long actorId,
        String actorName,
        String action,
        String targetType,
        Long targetId,
        String targetLabel,
        String detail,
        Instant at
) {
    public static AuditEntryResponse from(AuditEntry e) {
        return new AuditEntryResponse(e.getId(), e.getActorId(), e.getActorName(), e.getAction(),
                e.getTargetType(), e.getTargetId(), e.getTargetLabel(), e.getDetail(), e.getCreatedAt());
    }
}
