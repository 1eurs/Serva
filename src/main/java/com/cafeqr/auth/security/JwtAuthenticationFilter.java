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

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    /** A credential and which family it must belong to, so the two are never parsed alike. */
    private record Credential(String token, boolean stream) {
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        Credential credential = resolveCredential(request);
        if (credential != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                CustomUserDetails principal = credential.stream()
                        ? jwtService.parseStreamTicket(credential.token())
                        : jwtService.parsePrincipal(credential.token());
                var authentication = new UsernamePasswordAuthenticationToken(
                        principal, null, principal.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (Exception ex) {
                // Invalid/expired token: leave the context unauthenticated; the entry point handles 401.
                log.debug("Rejected JWT: {}", ex.getMessage());
            }
        }

        chain.doFilter(request, response);
    }

    /**
     * Reads the bearer token from the Authorization header, or — on a stream endpoint only —
     * exchanges a {@code ticket} query parameter for the token held behind it.
     *
     * <p>This used to accept the access token itself as {@code ?access_token=}, on every
     * endpoint. EventSource cannot set headers, so something has to travel in the URL; what
     * travelled was the full token, and it travelled into the nginx access log, browser
     * history and any outgoing Referer, where it stayed valid against the whole API for its
     * remaining life. A ticket expires in minutes, and two independent things keep it from
     * opening anything else: {@link #isStreamPath} here, and the type check in
     * {@link JwtService#parsePrincipal}, which rejects a ticket sent as a bearer token.
     */
    private Credential resolveCredential(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return new Credential(header.substring(BEARER_PREFIX.length()).trim(), false);
        }
        String ticket = request.getParameter("ticket");
        if (ticket != null && !ticket.isBlank() && isStreamPath(request)) {
            return new Credential(ticket.trim(), true);
        }
        return null;
    }

    /** Streams are the only endpoints that cannot send a header, so the only ones a ticket opens. */
    private boolean isStreamPath(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path != null && path.endsWith("/stream");
    }
}
