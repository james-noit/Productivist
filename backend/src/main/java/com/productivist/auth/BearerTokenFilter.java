package com.productivist.auth;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates requests carrying "Authorization: Bearer <token>"; the principal is the user id (Long). The user whose
 * email equals the configured admin email additionally gets ROLE_ADMIN.
 */
public class BearerTokenFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";

    private static final List<GrantedAuthority> ADMIN = List.of(new SimpleGrantedAuthority("ROLE_ADMIN"));

    private final TokenService tokens;
    /** Lower-cased; blank means there is no admin. */
    private final String adminEmail;

    public BearerTokenFilter(TokenService tokens, String adminEmail) {
        this.tokens = tokens;
        this.adminEmail = adminEmail == null ? "" : adminEmail.strip().toLowerCase(Locale.ROOT);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(PREFIX)) {
            tokens.resolve(header.substring(PREFIX.length()).trim()).ifPresent(identity -> {
                boolean admin = !adminEmail.isEmpty() && adminEmail.equals(identity.email());
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(new UsernamePasswordAuthenticationToken(
                        identity.userId(), null, admin ? ADMIN : List.of()));
                SecurityContextHolder.setContext(context);
            });
        }
        chain.doFilter(request, response);
    }
}
