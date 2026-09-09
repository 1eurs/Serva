package com.cafeqr.orders.print;

import com.cafeqr.orders.print.domain.PrintJobStatus;
import com.cafeqr.orders.print.repository.PrintJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Retires print jobs nobody came for.
 *
 * A station expires the stale jobs it walks past on every pull, which covers every café that
 * has one. The café that does not — auto-print switched on, no station app, no counter tablet
 * — never runs that code, and would otherwise leave one PENDING row behind for every order it
 * ever took. Nothing reads them (they are past the freshness window, so they are filtered out
 * of both the queue and the "waiting to print" count), but they sit in the partial index that
 * every real pull depends on, and that index would grow for the life of the café.
 *
 * Deliberately generous: an hour, against a fifteen-minute freshness window. This is a tidy-up,
 * and a job it retires is one no station was ever going to be offered again anyway.
 */
@Component
public class PrintJobSweepJob {

    private static final Logger log = LoggerFactory.getLogger("orders.print-sweep");

    private final PrintJobRepository printJobRepository;
    private final Duration keepFor;

    public PrintJobSweepJob(PrintJobRepository printJobRepository,
                            @Value("${app.print.sweep-keep-minutes:60}") long keepMinutes) {
        this.printJobRepository = printJobRepository;
        this.keepFor = Duration.ofMinutes(keepMinutes);
    }

    @Scheduled(fixedDelayString = "${app.print.sweep-ms:900000}")
    @Transactional
    public void run() {
        int retired = printJobRepository.expireOlderThan(
                Instant.now().minus(keepFor), PrintJobStatus.PENDING, PrintJobStatus.EXPIRED);
        if (retired > 0) log.info("retired {} print job(s) nobody collected", retired);
    }
}
