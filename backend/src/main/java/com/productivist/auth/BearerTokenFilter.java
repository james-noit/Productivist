package com.productivist.auth;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

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
 * email equals the configured admin email additionally gets ROLE_ADMIN, and the users whose emails are in the configured
 * fitness director list get ROLE_FITNESS_DIRECTOR (the admin is always a director too).
 */
public class BearerTokenFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";

    public static final String ROLE_ADMIN = "ROLE_ADMIN";
    public static final String ROLE_FITNESS_DIRECTOR = "ROLE_FITNESS_DIRECTOR";

    private static final List<GrantedAuthority> ADMIN =
            List.of(new SimpleGrantedAuthority(ROLE_ADMIN), new SimpleGrantedAuthority(ROLE_FITNESS_DIRECTOR));
    private static final List<GrantedAuthority> DIRECTOR = List.of(new SimpleGrantedAuthority(ROLE_FITNESS_DIRECTOR));

    private final TokenService tokens;
    /** Lower-cased; blank means there is no admin. */
    private final String adminEmail;
    /** Lower-cased; empty means there are no directors besides the admin. */
    private final Set<String> directorEmails;

    public BearerTokenFilter(TokenService tokens, String adminEmail, Collection<String> directorEmails) {
        this.tokens = tokens;
        this.adminEmail = adminEmail == null ? "" : adminEmail.strip().toLowerCase(Locale.ROOT);
        this.directorEmails = directorEmails == null
                ? Set.of()
                : directorEmails.stream()
                        .filter(e -> e != null)
                        .map(e -> e.strip().toLowerCase(Locale.ROOT))
                        .filter(e -> !e.isEmpty())
                        .collect(Collectors.toUnmodifiableSet());
    }

    /** Splits the comma-separated {@code FITNESS_DIRECTOR_EMAILS} value. */
    public static List<String> parseEmails(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return List.of(csv.split(","));
    }

    /** The authorities an account with this email gets (empty for an ordinary user). */
    List<GrantedAuthority> authoritiesFor(String email) {
        if (!adminEmail.isEmpty() && adminEmail.equals(email)) return ADMIN;
        if (directorEmails.contains(email)) return DIRECTOR;
        return List.of();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(PREFIX)) {
            tokens.resolve(header.substring(PREFIX.length()).trim()).ifPresent(identity -> {
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(new UsernamePasswordAuthenticationToken(
                        identity.userId(), null, authoritiesFor(identity.email())));
                SecurityContextHolder.setContext(context);
            });
        }
        chain.doFilter(request, response);
    }
}
