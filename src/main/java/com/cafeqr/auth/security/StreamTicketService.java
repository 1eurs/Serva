package com.cafeqr.auth.security;

import org.springframework.stereotype.Service;

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
 * <p>A ticket stands for the same principal but is marked as stream-only, and is only
 * accepted on stream endpoints (see {@link JwtAuthenticationFilter}). So the worst a leaked
 * log line buys is a read-only event stream, for minutes rather than the token's full life,
 * and no other API call at all — {@link JwtService#parsePrincipal} rejects a ticket outright.
 *
 * <p>Deliberately reusable within its window rather than single-use: EventSource reconnects
 * on its own after a network blip and reuses the URL it was given, and a ticket burned on
 * first use would turn every dropped packet into a dead stream.
 *
 * <p>Stateless by design. This used to be a {@code ConcurrentHashMap} of ticket → token,
 * which meant a ticket only worked on the instance that minted it and every restart
 * invalidated every live ticket — a reconnecting kitchen tablet would find its ticket gone.
 * A signed, stream-scoped token needs no shared store to do the same job.
 */
@Service
public class StreamTicketService {

    private final JwtService jwtService;

    public StreamTicketService(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    /** What a caller gets back: the ticket itself, and how long it is good for. */
    public record Ticket(String ticket, long expiresInSeconds) {
    }

    /**
     * Mints a ticket for an already-authenticated principal.
     *
     * <p>Takes the principal rather than a raw access token on purpose: the ticket is a fresh
     * assertion of who the caller is, not a re-wrapping of a credential the caller handed us.
     */
    public Ticket issue(CustomUserDetails user) {
        return new Ticket(jwtService.generateStreamTicket(user), jwtService.getStreamTicketTtlSeconds());
    }
}
