package com.cafeqr.auth.security;

import com.cafeqr.common.config.AppProperties;
import com.cafeqr.users.domain.Permission;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/** Issues and verifies stateless JWT access tokens. */
@Service
public class JwtService {

    private static final String CLAIM_USERNAME = "usr";
    private static final String CLAIM_PERMS = "perms";
    private static final String CLAIM_OWNER = "own";
    private static final String CLAIM_RESTAURANT_ID = "rid";
    private static final String CLAIM_BRANCH_ID = "bid";
    private static final String CLAIM_TYPE = "typ";
    private static final String TYPE_ACCESS = "access";
    /**
     * Stream tickets. Long enough to survive an {@code EventSource} reconnect, short enough
     * that a ticket left in an access log goes stale fast.
     */
    private static final String TYPE_STREAM = "stream";
    private static final long STREAM_TICKET_TTL_MINUTES = 5;

    private final SecretKey key;
    private final String issuer;
    private final long accessTtlMinutes;

    public JwtService(AppProperties properties) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(properties.jwt().secret()));
        this.issuer = properties.jwt().issuer();
        this.accessTtlMinutes = properties.jwt().accessTokenTtlMinutes();
    }

    public String generateAccessToken(CustomUserDetails user) {
        Instant now = Instant.now();
        Instant expiry = now.plus(accessTtlMinutes, ChronoUnit.MINUTES);
        List<String> perms = user.getPermissions().stream().map(Permission::name).toList();
        return Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(user.getUserId()))
                .claim(CLAIM_USERNAME, user.getUsername())
                .claim(CLAIM_PERMS, perms)
                .claim(CLAIM_OWNER, user.isOwner())
                .claim(CLAIM_RESTAURANT_ID, user.getRestaurantId())
                .claim(CLAIM_BRANCH_ID, user.getBranchId())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(key)
                .compact();
    }

    public long getAccessTtlSeconds() {
        return accessTtlMinutes * 60;
    }

    /**
     * A stream ticket: the same principal, but marked so it can only ever open a stream.
     *
     * <p>Carries no server-side state, which is what lets a ticket issued by one instance be
     * accepted by another and survive a restart. The safety comes entirely from the
     * {@link #CLAIM_TYPE} claim — {@link #parsePrincipal} refuses anything that is not an
     * access token, so a ticket presented in an Authorization header authenticates nothing.
     */
    public String generateStreamTicket(CustomUserDetails user) {
        Instant now = Instant.now();
        List<String> perms = user.getPermissions().stream().map(Permission::name).toList();
        return Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(user.getUserId()))
                .claim(CLAIM_USERNAME, user.getUsername())
                .claim(CLAIM_PERMS, perms)
                .claim(CLAIM_OWNER, user.isOwner())
                .claim(CLAIM_RESTAURANT_ID, user.getRestaurantId())
                .claim(CLAIM_BRANCH_ID, user.getBranchId())
                .claim(CLAIM_TYPE, TYPE_STREAM)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(STREAM_TICKET_TTL_MINUTES, ChronoUnit.MINUTES)))
                .signWith(key)
                .compact();
    }

    public long getStreamTicketTtlSeconds() {
        return STREAM_TICKET_TTL_MINUTES * 60;
    }

    /** Parses and verifies an access token, returning the principal. Throws on any failure. */
    public CustomUserDetails parsePrincipal(String token) {
        return parse(token, TYPE_ACCESS);
    }

    /** Parses and verifies a stream ticket. Throws on any failure, including a non-ticket token. */
    public CustomUserDetails parseStreamTicket(String token) {
        return parse(token, TYPE_STREAM);
    }

    /**
     * The {@code typ} check is what keeps the token families apart, and it is load-bearing:
     * every token this application signs — access tokens, stream tickets, and the 30-day
     * phone-verification tokens minted by OtpService — is signed with the same key, so a
     * valid signature alone proves nothing about what a token is allowed to do.
     */
    private CustomUserDetails parse(String token, String requiredType) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(issuer)
                .require(CLAIM_TYPE, requiredType)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        Long userId = Long.valueOf(claims.getSubject());
        String username = claims.get(CLAIM_USERNAME, String.class);
        Set<Permission> permissions = readPermissions(claims);
        boolean owner = Boolean.TRUE.equals(claims.get(CLAIM_OWNER, Boolean.class));
        Long restaurantId = readLong(claims, CLAIM_RESTAURANT_ID);
        Long branchId = readLong(claims, CLAIM_BRANCH_ID);
        // Password hash is irrelevant for token-based auth; principal is built from claims.
        return new CustomUserDetails(userId, username, "N/A", permissions, owner,
                restaurantId, branchId, true);
    }

    @SuppressWarnings("unchecked")
    private static Set<Permission> readPermissions(Claims claims) {
        Object raw = claims.get(CLAIM_PERMS);
        Set<Permission> permissions = EnumSet.noneOf(Permission.class);
        if (raw instanceof List<?> list) {
            for (Object name : list) {
                // Tolerate permissions that no longer exist (e.g. KITCHEN, merged into ORDERS) so a
                // still-valid token issued before the change doesn't fail to parse.
                try {
                    permissions.add(Permission.valueOf(String.valueOf(name)));
                } catch (IllegalArgumentException ignored) {
                    // unknown / retired permission — skip it
                }
            }
        }
        return permissions;
    }

    private static Long readLong(Claims claims, String name) {
        Object value = claims.get(name);
        if (value == null) {
            return null;
        }
        return ((Number) value).longValue();
    }
}
