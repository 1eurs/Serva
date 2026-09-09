package com.cafeqr.orders.print.dto;

import java.time.Instant;

/**
 * Is some device collecting this branch's print jobs, how many devices, and how many fresh
 * jobs wait. {@code stations > 1} is worth a warning on the settings page; it is no longer a
 * duplicate-print problem, since a job is claimed by one station at a time.
 */
public record StationStatusResponse(
        Instant stationSeenAt,
        boolean collecting,
        long stations,
        long pending,
        /**
         * How long the longest-waiting ticket has been waiting, in seconds; 0 when none are.
         *
         * This is the honest health signal, and {@code collecting} is not. A station whose
         * printer has died still polls, still claims, still renders — it fails only at the
         * socket — so it reports as collecting while tickets pile up behind it. Time waiting
         * catches that and "nobody is collecting" with one number.
         */
        long oldestPendingSeconds,
        /**
         * True when a dedicated collector is live — the Serva Station Android app
         * ({@code android-…}) or the Node process — as opposed to a browser tab ({@code st-…}).
         * Browsers step aside when this is true, so a café does not have to hunt down an old
         * "this tablet prints incoming tickets" switch.
         */
        boolean appCollecting) {
}
