package com.cafeqr.auth.security;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived tickets that let an {@code EventSource} open a stream without an access token
 * in the URL.
 *
 * <p>EventSource cannot set headers, so the only credential it can carry is a query
 * parameter — and a query parameter is written to the nginx access log, kept in browser
 * history, and handed to any third party in a Referer. The dashboard was putting the full
 * access token there: every permission the user has, replayable against every endpoint for
 * the token's lifetime, sitting in a log file.
 *
 * <p>A ticket is an opaque random string that stands in for a token that never leaves the
 * server, and it is only accepted on stream endpoints (see {@link JwtAuthenticationFilter}).
 * So the worst a leaked log line buys is a read-only event stream, for minutes rather than
 * the token's full life, and no other API call at all.
 *
 * <p>Deliberately reusable within its window rather than single-use: EventSource reconnects
 * on its own after a network blip and reuses the URL it was given, and a ticket burned on
 * first use would turn every dropped packet into a dead stream.
 *
 * <p>In memory, because Serva runs one backend container. A second instance would need this
 * in Redis or the database — a ticket issued by one node would not resolve on the other.
 */
@Service
public class StreamTicketService {

    /** Long enough to survive a reconnect, short enough that a logged URL goes stale fast. */
    private static final Duration TTL = Duration.ofMinutes(5);
    /** A ceiling so a runaway client cannot grow the map without bound. */
    private static final int MAX_LIVE = 20_000;

    private final Map<String, Entry> tickets = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    private record Entry(String token, Instant expiresAt) {
        boolean expired(Instant now) {
            return now.isAfter(expiresAt);
        }
    }

    /** What a caller gets back: the ticket itself, and how long it is good for. */
    public record Ticket(String ticket, long expiresInSeconds) {
    }

    /**
     * Stores an access token behind a fresh ticket.
     *
     * <p>The token keeps its own expiry — the ticket only decides how long the indirection
     * lasts, so a ticket can never outlive the session it stands for.
     */
    public Ticket issue(String accessToken) {
        sweep();
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        tickets.put(ticket, new Entry(accessToken, Instant.now().plus(TTL)));
        return new Ticket(ticket, TTL.toSeconds());
    }

    /** The access token behind a ticket, or null when it is unknown or has expired. */
    public String resolve(String ticket) {
        Entry entry = tickets.get(ticket);
        if (entry == null) {
            return null;
        }
        if (entry.expired(Instant.now())) {
            tickets.remove(ticket);
            return null;
        }
        return entry.token();
    }

    /** Called on issue rather than on a timer: the map only grows when someone adds to it. */
    private void sweep() {
        Instant now = Instant.now();
        tickets.entrySet().removeIf(e -> e.getValue().expired(now));
        if (tickets.size() >= MAX_LIVE) {
            tickets.clear();
        }
    }
}
