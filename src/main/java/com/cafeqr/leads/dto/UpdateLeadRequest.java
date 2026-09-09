package com.cafeqr.leads.dto;

import com.cafeqr.leads.domain.LeadStatus;
import jakarta.validation.constraints.Size;

/**
 * Moves a lead along the pipeline. Both fields are optional: an admin may only jot a note,
 * or only advance the status. Advancing to {@code CONTACTED} stamps {@code contactedAt}
 * server-side the first time, so "how long has this been sitting there?" stays answerable.
 */
public record UpdateLeadRequest(
        LeadStatus status,
        @Size(max = 1000) String adminNote
) {}
