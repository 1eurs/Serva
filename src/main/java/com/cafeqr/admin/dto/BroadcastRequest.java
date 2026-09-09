package com.cafeqr.admin.dto;

import com.cafeqr.restaurants.domain.Plan;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A message to café owners — a maintenance window, a price change, a new feature.
 *
 * <p>Both languages are required rather than optional: an owner gets one email, and it has to
 * be readable by whichever of the two they actually use. The English and Arabic bodies are sent
 * in the same message, so nobody has to guess which owner reads what.
 */
public record BroadcastRequest(
        @NotBlank @Size(max = 200) String subjectEn,
        @NotBlank @Size(max = 200) String subjectAr,
        @NotBlank @Size(max = 5000) String bodyEn,
        @NotBlank @Size(max = 5000) String bodyAr,
        /** Limit to one tier; null means every active café. */
        Plan tier,
        /** Preview the audience without sending. */
        Boolean dryRun
) {}
