package com.cafeqr.auth;

import com.cafeqr.auth.security.StreamTicketService;
import com.cafeqr.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Hands out the short-lived ticket an {@code EventSource} needs to open a stream.
 *
 * <p>Called with the ordinary Authorization header — so the credential that proves who you
 * are travels in a header as usual, and only the ticket ever reaches a URL.
 */
@RestController
@Tag(name = "Auth")
public class StreamTicketController {

    private static final String BEARER_PREFIX = "Bearer ";

    private final StreamTicketService streamTickets;

    public StreamTicketController(StreamTicketService streamTickets) {
        this.streamTickets = streamTickets;
    }

    @Operation(summary = "A short-lived ticket for opening an SSE stream")
    @PostMapping("/api/dashboard/stream-ticket")
    public ApiResponse<StreamTicketService.Ticket> issue(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            /* Reachable only by calling this with a ticket instead of a header, which would
               otherwise let one ticket mint the next and never expire. */
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bearer token required");
        }
        return ApiResponse.ok(streamTickets.issue(header.substring(BEARER_PREFIX.length()).trim()));
    }
}
