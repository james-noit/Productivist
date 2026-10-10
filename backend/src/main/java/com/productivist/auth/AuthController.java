package com.productivist.auth;

import java.util.Locale;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Email-only sign-in: no confirmation and no secret yet. Unknown emails are registered on the spot.
 * The recovery-key check will slot in here later; the token contract stays the same.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record LoginRequest(@NotBlank @Email @Size(max = 254) String email) {
        public LoginRequest {
            email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
        }
    }

    public record LoginResponse(String email, String token) {}

    private final JdbcClient jdbc;
    private final TokenService tokens;

    public AuthController(JdbcClient jdbc, TokenService tokens) {
        this.jdbc = jdbc;
        this.tokens = tokens;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        String email = request.email();
        long userId = jdbc.sql("""
                        INSERT INTO users (email) VALUES (:email)
                        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
                        RETURNING id
                        """)
                .param("email", email)
                .query(Long.class)
                .single();
        return new LoginResponse(email, tokens.issue(userId));
    }
}
