package com.cafeqr.orders.realtime;

import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.cafeqr.users.event.StaffAccessChangedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * In-memory registry of Server-Sent Event emitters keyed by channel.
 *
 * <p>Channels:
 * <ul>
 *   <li>{@code restaurant:{id}} – every order in a restaurant (owner/admin dashboard)</li>
 *   <li>{@code branch:{id}} – orders for one branch (branch staff/kitchen dashboard)</li>
 *   <li>{@code order:{trackingToken}} – a single customer's order tracking stream</li>
 * </ul>
 * Suitable for a single-instance modular monolith (no external broker required).
 */
@Service
public class OrderStreamService {

    private static final Logger log = LoggerFactory.getLogger(OrderStreamService.class);
    // Long-lived on purpose: a kitchen tablet keeps the board open all day, and every server-side
    // recycle shows up as a reconnect blip on the dashboard. Liveness doesn't depend on this —
    // dead connections are reaped by the 20s heartbeat the moment a send fails.
    private static final long TIMEOUT_MS = 6 * 60 * 60 * 1000L; // 6 hours

    private final Map<String, List<Subscriber>> channels = new ConcurrentHashMap<>();

    /**
     * One open connection, and the staff account it was opened for.
     *
     * <p>Null for a customer's order-tracking stream: that one is opened with a tracking token
     * rather than a login, so there is no account to revoke.
     */
    private record Subscriber(SseEmitter emitter, Long userId) {}

    public static String restaurantChannel(Long restaurantId) {
        return "restaurant:" + restaurantId;
    }

    public static String branchChannel(Long branchId) {
        return "branch:" + branchId;
    }

    public static String orderChannel(String trackingToken) {
        return "order:" + trackingToken;
    }

    /** Live QR-activity channel for one branch (dashboard Tables tab). */
    public static String qaChannel(Long branchId) {
        return "qa:" + branchId;
    }

    public boolean hasSubscribers(String channel) {
        List<Subscriber> subscribers = channels.get(channel);
        return subscribers != null && !subscribers.isEmpty();
    }

    /** A stream nobody signs in for — a customer watching their own order. */
    public SseEmitter subscribe(String channel) {
        return subscribe(channel, null);
    }

    /**
     * @param userId the staff account this stream belongs to, so it can be cut when that
     *               account's access changes; null for an anonymous customer stream.
     */
    public SseEmitter subscribe(String channel, Long userId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        channels.computeIfAbsent(channel, key -> new CopyOnWriteArrayList<>())
                .add(new Subscriber(emitter, userId));

        emitter.onCompletion(() -> remove(channel, emitter));
        emitter.onTimeout(() -> remove(channel, emitter));
        emitter.onError(e -> remove(channel, emitter));

        try {
            emitter.send(SseEmitter.event().name("connected").data("ok"));
        } catch (IOException e) {
            remove(channel, emitter);
        }
        return emitter;
    }

    /**
     * Closes every stream held open for one staff account.
     *
     * <p>A request is re-checked against the account row every time; a stream is checked once,
     * when it opens, and then talks for up to six hours. So deactivating someone mid-shift left
     * the tablet in their hand still filling with live orders — read-only, since every action
     * they took was refused, but the board was still theirs to watch. Cutting the connection
     * hands it back to the ordinary rules: the browser reconnects, needs a fresh ticket, and the
     * ticket needs an account that still exists.
     */
    public void disconnectStaff(Long userId) {
        if (userId == null) {
            return;
        }
        channels.forEach((channel, subscribers) -> {
            for (Subscriber subscriber : subscribers) {
                if (userId.equals(subscriber.userId())) {
                    subscribers.remove(subscriber);
                    try {
                        subscriber.emitter().complete();
                    } catch (Exception e) {
                        log.debug("Closing stream on {} for user {}: {}", channel, userId, e.getMessage());
                    }
                }
            }
        });
    }

    /** Access changed for a member: let go of anything still open in their name. */
    @EventListener
    public void onStaffAccessChanged(StaffAccessChangedEvent event) {
        disconnectStaff(event.userId());
    }

    public void publish(String channel, OrderEvent event) {
        List<Subscriber> subscribers = channels.get(channel);
        if (subscribers == null || subscribers.isEmpty()) {
            return;
        }
        for (Subscriber subscriber : subscribers) {
            try {
                subscriber.emitter().send(SseEmitter.event().name(event.type()).data(event.data()));
            } catch (Exception e) {
                log.debug("Dropping dead SSE emitter on {}: {}", channel, e.getMessage());
                remove(channel, subscriber.emitter());
            }
        }
    }

    public void publishAll(Collection<String> targetChannels, OrderEvent event) {
        targetChannels.forEach(channel -> publish(channel, event));
    }

    /**
     * Keep-alive heartbeat. Idle SSE connections are cut by reverse proxies
     * (nginx {@code proxy_read_timeout} defaults to 60s; Cloudflare ~100s), which
     * is why the dashboard's "Live" pill flips to "Reconnecting" between orders in
     * production. A periodic comment ping keeps every stream warm. Comments
     * ({@code :ping}) are ignored by the browser's EventSource, so no client-side
     * handler fires. Dead emitters are pruned as they surface.
     */
    @Scheduled(fixedDelay = 20_000L)
    public void heartbeat() {
        channels.forEach((channel, subscribers) -> {
            for (Subscriber subscriber : subscribers) {
                try {
                    subscriber.emitter().send(SseEmitter.event().comment("ping"));
                } catch (Exception e) {
                    remove(channel, subscriber.emitter());
                }
            }
        });
    }

    /**
     * Marks an SSE response as un-bufferable so reverse proxies stream it through
     * immediately. {@code X-Accel-Buffering: no} disables nginx response buffering
     * for this one response (no nginx.conf change needed); {@code no-transform}
     * stops Cloudflare from compressing/altering the event stream.
     */
    public static void disableProxyBuffering(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
    }

    private void remove(String channel, SseEmitter emitter) {
        List<Subscriber> subscribers = channels.get(channel);
        if (subscribers != null) {
            subscribers.removeIf(subscriber -> subscriber.emitter().equals(emitter));
        }
    }
}
