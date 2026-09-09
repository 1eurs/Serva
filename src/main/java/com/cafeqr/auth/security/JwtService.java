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

    private final SecretKey key;
    private final String issuer;
    private final long accessTtlMinutes;

    public JwtService(AppProperties properties) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(properties.jwt().secret()));
        this.issuer = properties.jwt().issuer();
        this.accessTtlMinutes = properties.jwt().accessTokenTtlMinutes();
    }

    public String generateAccessToken(CustomUserDetails user) {
        return generateAccessToken(user, accessTtlMinutes);
    }

    /**
     * An access token with a chosen lifetime. Used for support impersonation, which is issued
     * without a refresh token and expires on its own — an admin looking at a café's dashboard
     * should not still be inside it an hour after they closed the tab.
     */
    public String generateAccessToken(CustomUserDetails user, long ttlMinutes) {
        Instant now = Instant.now();
        Instant expiry = now.plus(ttlMinutes, ChronoUnit.MINUTES);
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

    /** Parses and verifies a token, returning the authenticated principal. Throws on any failure. */
    public CustomUserDetails parsePrincipal(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(issuer)
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
