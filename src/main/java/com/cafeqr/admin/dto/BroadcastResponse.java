package com.cafeqr.admin.dto;

import java.util.List;

/** What a broadcast reached — and, when it didn't, who it couldn't reach. */
public record BroadcastResponse(
        int recipients,
        int sent,
        int failed,
        boolean dryRun,
        /** Owners with no email address on file; they need a call instead. */
        List<String> unreachable
) {}
