package com.cafeqr.auth.security;

import com.cafeqr.common.config.AppProperties;
import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.EnumSet;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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

    /** The account behind the token, as the filter will read it back out of the database. */
    private final User account = account(true);
    private final UserRepository users = mock(UserRepository.class);
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(
            jwtService, tickets, new CustomUserDetailsService(users));

    private final String token = jwtService.generateAccessToken(new CustomUserDetails(
            42L, "owner@cafe.com", "hash", EnumSet.of(Permission.ORDERS), true, 7L, null, true));

    @BeforeEach
    void accountExists() {
        when(users.findById(42L)).thenReturn(Optional.of(account));
    }

    private static User account(boolean active) {
        User user = new User();
        user.setId(42L);
        user.setUsername("owner@cafe.com");
        user.setPasswordHash("hash");
        user.setPermissions(EnumSet.of(Permission.ORDERS));
        user.setOwner(true);
        user.setRestaurantId(7L);
        user.setActive(active);
        return user;
    }

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
     * A token is proof of identity, not a standing grant. An owner who deactivates someone at
     * the end of a shift has done it now, not whenever the token they are holding runs out.
     */
    @Test
    void aDeactivatedAccountsTokenStopsWorkingAtOnce() throws Exception {
        when(users.findById(42L)).thenReturn(Optional.of(account(false)));

        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.addHeader("Authorization", "Bearer " + token);

        assertThat(authenticates(request)).isFalse();
    }

    /** Same for an account that has been removed outright — a cancelled invite, say. */
    @Test
    void aDeletedAccountsTokenStopsWorkingAtOnce() throws Exception {
        when(users.findById(42L)).thenReturn(Optional.empty());

        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.addHeader("Authorization", "Bearer " + token);

        assertThat(authenticates(request)).isFalse();
    }

    /**
     * Permissions come from the row, not the claims, so an area taken away is gone on the next
     * request rather than on the next token.
     */
    @Test
    void permissionsComeFromTheAccountNotTheToken() throws Exception {
        User narrowed = account(true);
        narrowed.setPermissions(EnumSet.of(Permission.MENU));
        when(users.findById(42L)).thenReturn(Optional.of(narrowed));

        MockHttpServletRequest request = get("/api/dashboard/orders");
        request.addHeader("Authorization", "Bearer " + token); // minted while they still had ORDERS

        assertThat(authenticates(request)).isTrue();
        CustomUserDetails principal = (CustomUserDetails)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        assertThat(principal.getPermissions()).containsExactly(Permission.MENU);
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
