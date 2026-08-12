package com.cafeqr.users.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The member choosing their own password. Same minimum as every other password in the product. */
public record AcceptInviteRequest(
        @NotBlank @Size(min = 8, max = 100) String password
) {}
