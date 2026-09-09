package com.cafeqr.orders.print.dto;

import java.time.Instant;

/**
 * What a device with no printer of its own gets back after handing a job to the branch's
 * print station. The job is durable either way; {@code stationCollecting} is whether any
 * device has polled for jobs lately, which is the difference between "sent to the printer"
 * and "saved, but nobody is going to print it" — the one failure the queue cannot fix.
 */
public record EnqueueResponse(Long jobId, Instant stationSeenAt, boolean stationCollecting) {
}
