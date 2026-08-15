package com.cafeqr.auth.security;

import com.cafeqr.common.config.AppProperties;
import com.cafeqr.users.domain.Permission;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.EnumSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The rules that keep a credential out of a URL — and out of every access log, browser
 * history entry and Referer header that a URL ends up in.
 */
class JwtAuthenticationFilterTest {

    private static final String SECRET =
            "Y2FmZXFyLXN1cGVyLXNlY3JldC1rZXktY2hhbmdlLW1lLWluLXByb2R1Y3Rpb24tMTIzNDU2";

    private final JwtService jwtService = new JwtService(new AppProperties(
            new AppProperties.Jwt(SECRET, 60, 30, "cafeqr"),
            null, "http://localhost:8080", null, null, null, null, null, null));
    private final StreamTicketService tickets = new StreamTicketService(jwtService);
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

    private final CustomUserDetails user = new CustomUserDetails(
            42L, "owner@cafe.com", "hash", EnumSet.of(Permission.ORDERS), true, 7L, null, true);
    private final String token = jwtService.generateAccessToken(user);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private boolean authenticates(MockHttpServletRequest request) throws Exception {
        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
        return SecurityContextHolder.getContext().getAuthentication() != null;
    }

    private MockHttpServletRequest get(String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
        request.setRequestURI(uri);
        return request;
    }

    @Test
    void authorizationHeaderStillAuthenticates() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.addHeader("Authorization", "Bearer " + token);

        assertThat(authenticates(request)).isTrue();
    }

    @Test
    void ticketOpensAStream() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders/stream");
        request.setParameter("ticket", tickets.issue(user).ticket());

        assertThat(authenticates(request)).isTrue();
    }

    /** The point of the ticket: a leaked stream URL must not be a key to the whole API. */
    @Test
    void ticketOpensNothingButAStream() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.setParameter("ticket", tickets.issue(user).ticket());

        assertThat(authenticates(request)).isFalse();
    }

    /**
     * A ticket is now a signed token rather than an opaque key into a server-side map, so it
     * would authenticate perfectly well as a bearer token if nothing said otherwise. What
     * says otherwise is the {@code typ} claim check in JwtService — without it, handing out a
     * stream ticket would be handing out full API access with a longer blast radius than the
     * URL-borne access token this whole mechanism replaced.
     */
    @Test
    void ticketIsRefusedAsABearerToken() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.addHeader("Authorization", "Bearer " + tickets.issue(user).ticket());

        assertThat(authenticates(request)).isFalse();
    }

    /** And the converse: an access token is not a ticket, even on a stream path. */
    @Test
    void accessTokenIsRefusedAsATicket() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders/stream");
        request.setParameter("ticket", token);

        assertThat(authenticates(request)).isFalse();
    }

    @Test
    void unknownTicketIsRefused() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders/stream");
        request.setParameter("ticket", "not-a-ticket-anyone-issued");

        assertThat(authenticates(request)).isFalse();
    }

    /**
     * The regression this all exists to prevent. The access token used to be accepted as a
     * query parameter on every endpoint, so one logged URL was the user's full API access
     * for the life of the token.
     */
    @Test
    void accessTokenInTheUrlIsNoLongerAccepted() throws Exception {
        MockHttpServletRequest stream = get("/api/dashboard/orders/stream");
        stream.setParameter("access_token", token);
        assertThat(authenticates(stream)).isFalse();

        SecurityContextHolder.clearContext();

        MockHttpServletRequest ordinary = get("/api/dashboard/orders");
        ordinary.setParameter("access_token", token);
        assertThat(authenticates(ordinary)).isFalse();
    }
}
