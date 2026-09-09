package com.cafeqr.leads.dto;

import com.cafeqr.leads.domain.Lead;

import java.time.Instant;

public record LeadResponse(
        Long id,
        String cafeName,
        String contactName,
        String phone,
        String email,
        String city,
        String note,
        String status,
        String adminNote,
        Instant contactedAt,
        Long restaurantId,
        Instant createdAt
) {
    public static LeadResponse from(Lead l) {
        return new LeadResponse(
                l.getId(), l.getCafeName(), l.getContactName(), l.getPhone(), l.getEmail(),
                l.getCity(), l.getNote(), l.getStatus().name(),
                l.getAdminNote(), l.getContactedAt(), l.getRestaurantId(), l.getCreatedAt());
    }
}
