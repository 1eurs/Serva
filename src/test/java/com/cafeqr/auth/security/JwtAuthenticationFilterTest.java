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
    private final StreamTicketService tickets = new StreamTicketService();
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService, tickets);

    private final String token = jwtService.generateAccessToken(new CustomUserDetails(
            42L, "owner@cafe.com", "hash", EnumSet.of(Permission.ORDERS), true, 7L, null, true));

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
        request.setParameter("ticket", tickets.issue(token).ticket());

        assertThat(authenticates(request)).isTrue();
    }

    /** The point of the ticket: a leaked stream URL must not be a key to the whole API. */
    @Test
    void ticketOpensNothingButAStream() throws Exception {
        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.setParameter("ticket", tickets.issue(token).ticket());

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
