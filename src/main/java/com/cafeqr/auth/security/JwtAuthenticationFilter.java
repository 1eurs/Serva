package com.cafeqr.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Extracts and validates the bearer access token on each request. */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final StreamTicketService streamTickets;
    private final CustomUserDetailsService accounts;

    public JwtAuthenticationFilter(JwtService jwtService, StreamTicketService streamTickets,
                                   CustomUserDetailsService accounts) {
        this.jwtService = jwtService;
        this.streamTickets = streamTickets;
        this.accounts = accounts;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String token = resolveToken(request);
        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                CustomUserDetails principal = authenticate(token);
                if (principal != null) {
                    var authentication = new UsernamePasswordAuthenticationToken(
                            principal, null, principal.getAuthorities());
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            } catch (Exception ex) {
                // Invalid/expired token: leave the context unauthenticated; the entry point handles 401.
                log.debug("Rejected JWT: {}", ex.getMessage());
            }
        }

        chain.doFilter(request, response);
    }

    /**
     * Verifies the token, then builds the principal from the account row rather than from the
     * claims the token was minted with.
     *
     * <p>A JWT states what was true when it was issued, which is exactly right for identity —
     * that is what the signature protects — and wrong for everything else. The claims used to be
     * the only source of an account's permissions, branch and active flag, so an owner who
     * deactivated a member at the end of a shift left them able to work the till for the rest of
     * the token's life, and taking an area away from someone took effect whenever their browser
     * next happened to refresh. Neither is a thing an owner can be asked to reason about.
     *
     * <p>The cost is one indexed lookup on a request that is about to make several. The claims
     * stay in the token: they cost nothing, and they are what makes a captured token readable
     * when something has to be explained afterwards.
     */
    private CustomUserDetails authenticate(String token) {
        CustomUserDetails claimed = jwtService.parsePrincipal(token);
        CustomUserDetails account = accounts.loadById(claimed.getUserId()).orElse(null);
        if (account == null || !account.isEnabled()) {
            log.debug("Rejected JWT for user {}: the account is deactivated or gone", claimed.getUserId());
            return null;
        }
        return account;
    }

    /**
     * Reads the bearer token from the Authorization header, or — on a stream endpoint only —
     * exchanges a {@code ticket} query parameter for the token held behind it.
     *
     * <p>This used to accept the access token itself as {@code ?access_token=}, on every
     * endpoint. EventSource cannot set headers, so something has to travel in the URL; what
     * travelled was the full token, and it travelled into the nginx access log, browser
     * history and any outgoing Referer, where it stayed valid against the whole API for its
     * remaining life. A ticket is opaque, expires in minutes, and {@link #isStreamPath} keeps
     * it from opening anything but a stream.
     */
    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length()).trim();
        }
        String ticket = request.getParameter("ticket");
        if (ticket != null && !ticket.isBlank() && isStreamPath(request)) {
            return streamTickets.resolve(ticket.trim());
        }
        return null;
    }

    /** Streams are the only endpoints that cannot send a header, so the only ones a ticket opens. */
    private boolean isStreamPath(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path != null && path.endsWith("/stream");
    }
}
