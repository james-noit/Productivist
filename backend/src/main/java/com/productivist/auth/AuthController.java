package com.productivist.auth;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Email + password accounts. Bodies are validated by hand rather than with bean validation on purpose: the
 * framework logs a failed constraint together with the rejected value, which here would put passwords in the logs.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public static final int MIN_PASSWORD_LENGTH = 8;
    /** BCrypt only reads the first 72 bytes, so longer passwords are refused instead of silently truncated. */
    public static final int MAX_PASSWORD_BYTES = 72;
    private static final int MAX_EMAIL_LENGTH = 254;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public record Credentials(String email, String password) {
        @Override
        public String toString() {
            return "Credentials[email=" + email + ", password=<redacted>]";
        }
    }

    public record LoginResponse(String email, String token) {}

    private record UserRow(long id, String passwordHash) {}

    private final JdbcClient jdbc;
    private final TokenService tokens;
    private final PasswordEncoder encoder;
    /** Checked when the account does not exist, so response time does not reveal which emails are registered. */
    private final String decoyHash;

    public AuthController(JdbcClient jdbc, TokenService tokens, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.tokens = tokens;
        this.encoder = encoder;
        this.decoyHash = encoder.encode(UUID.randomUUID().toString());
    }

    @PostMapping("/signup")
    public LoginResponse signup(@RequestBody Credentials body) {
        String email = normalizedEmail(body);
        String password = requirePassword(body, MIN_PASSWORD_LENGTH);
        // An existing row is only taken over when it has no password yet (an account from before passwords).
        Optional<Long> id = jdbc.sql("""
                        INSERT INTO users (email, password_hash) VALUES (:email, :hash)
                        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
                        WHERE users.password_hash IS NULL
                        RETURNING id
                        """)
                .param("email", email)
                .param("hash", encoder.encode(password))
                .query(Long.class)
                .optional();
        long userId = id.orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered"));
        return new LoginResponse(email, tokens.issue(userId));
    }

    @PostMapping("/login")
    public LoginResponse login(@RequestBody Credentials body) {
        String email = normalizedEmail(body);
        String password = requirePassword(body, 1);
        Optional<UserRow> user = jdbc.sql("SELECT id, password_hash FROM users WHERE email = :email")
                .param("email", email)
                .query((rs, i) -> new UserRow(rs.getLong("id"), rs.getString("password_hash")))
                .optional();
        String hash = user.map(UserRow::passwordHash).orElse(decoyHash);
        boolean matches = encoder.matches(password, hash);
        if (user.isEmpty() || user.get().passwordHash() == null || !matches) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        return new LoginResponse(email, tokens.issue(user.get().id()));
    }

    private static String normalizedEmail(Credentials body) {
        String email = body == null || body.email() == null ? "" : body.email().strip().toLowerCase(Locale.ROOT);
        if (email.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email");
        }
        return email;
    }

    private static String requirePassword(Credentials body, int minLength) {
        String password = body == null ? null : body.password();
        if (password == null || password.length() < minLength
                || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid password");
        }
        return password;
    }
}
