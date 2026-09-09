package com.cafeqr.auth.security;

import jakarta.servlet.DispatcherType;

import com.cafeqr.common.config.AppProperties;
import com.cafeqr.common.ratelimit.RateLimitFilter;
import com.cafeqr.common.ratelimit.RateLimiter;
import com.cafeqr.common.util.Pasted;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;
    private final AppProperties appProperties;
    private final RateLimiter rateLimiter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          RestAuthenticationEntryPoint authenticationEntryPoint,
                          RestAccessDeniedHandler accessDeniedHandler,
                          AppProperties appProperties,
                          RateLimiter rateLimiter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
        this.appProperties = appProperties;
        this.rateLimiter = rateLimiter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // SSE order streams finish as ASYNC re-dispatches (and errors as ERROR
                        // dispatches) on a thread with no SecurityContext; re-authorizing them
                        // throws "Access Denied" on an already-committed response. Only the
                        // initial REQUEST dispatch needs authorization.
                        .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/refresh",
                                "/api/auth/register-platform-admin",
                                "/api/auth/forgot-password", "/api/auth/reset-password").permitAll()
                        .requestMatchers("/api/public/**", "/files/**").permitAll()
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**",
                                "/actuator/health").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .addFilterBefore(rateLimitFilter(), UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private RateLimitFilter rateLimitFilter() {
        AppProperties.RateLimit rl = appProperties.rateLimit();
        return new RateLimitFilter(
                rateLimiter,
                rl == null || rl.enabledOrDefault(),
                rl != null ? rl.authPerMinuteOrDefault() : 10,
                rl != null ? rl.publicPerMinuteOrDefault() : 8);
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(appProperties.cors().allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    /**
     * BCrypt, wrapped so a password is cleaned of invisible pasted characters at exactly two
     * points: when it is hashed and when it is checked. Doing it here rather than at each caller
     * is what makes the two sides impossible to disagree about — every path that sets a password
     * (login, invite accept, reset, admin-created owner) goes through this one bean.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();
        return new PasswordEncoder() {
            @Override
            public String encode(CharSequence rawPassword) {
                return bcrypt.encode(clean(rawPassword));
            }

            @Override
            public boolean matches(CharSequence rawPassword, String encodedPassword) {
                return bcrypt.matches(clean(rawPassword), encodedPassword);
            }

            /** Null passes straight through, so BCrypt still raises its own error for it. */
            private CharSequence clean(CharSequence raw) {
                return raw == null ? null : Pasted.secret(raw.toString());
            }
        };
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }
}
