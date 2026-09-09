package com.cafeqr.orders;

import com.cafeqr.orders.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Counter-mode housekeeping. In that posture the board is the "waiting to be handed over"
 * list and nobody taps Done for a customer who already paid and walked off with their
 * coffee — so paid READY orders complete themselves once they have sat long enough.
 * Completing (not just hiding) keeps every device's board in step and still awards the
 * loyalty stamp, which only fires on completion. Unpaid orders are never touched: those
 * wait for a Collect tap so nothing walks away unpaid.
 */
@Component
public class CounterModeSweepJob {

    private static final Logger log = LoggerFactory.getLogger("orders.counter-sweep");

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final Duration linger;

    public CounterModeSweepJob(OrderRepository orderRepository,
                               OrderService orderService,
                               @Value("${app.orders.counter-linger-minutes:10}") long lingerMinutes) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.linger = Duration.ofMinutes(lingerMinutes);
    }

    @Scheduled(fixedDelayString = "${app.orders.counter-sweep-ms:60000}")
    public void run() {
        sweep(Instant.now());
    }

    public int sweep(Instant now) {
        List<Long> ids = orderRepository.findCounterModeHandedOver(now.minus(linger));
        int done = 0;
        // One transaction per order: a single bad row must not hold back the rest of the board.
        for (Long id : ids) {
            try {
                orderService.completeUnattended(id);
                done++;
            } catch (RuntimeException e) {
                log.warn("counter sweep could not complete order {}: {}", id, e.getMessage());
            }
        }
        if (done > 0) {
            log.info("counter sweep completed {} handed-over order(s)", done);
        }
        return done;
    }
}
