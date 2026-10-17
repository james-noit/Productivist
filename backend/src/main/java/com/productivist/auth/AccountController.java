package com.productivist.auth;

import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Self-service account removal. Every per-user table references {@code users(id) ON DELETE CASCADE}, so deleting the
 * user row erases the whole account (sessions, projects, tasks, Flow data, recurrences, settings blob). As in
 * {@link AuthController}, the body is validated by hand so the password never reaches the logs.
 */
@RestController
@RequestMapping("/api/account")
public class AccountController {

    private static final Logger log = LoggerFactory.getLogger(AccountController.class);

    public record DeleteRequest(String password) {
        @Override
        public String toString() {
            return "DeleteRequest[password=<redacted>]";
        }
    }

    private record UserRow(String email, String passwordHash) {}

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    /** Lower-cased; blank means there is no admin. */
    private final String adminEmail;

    public AccountController(JdbcClient jdbc, PasswordEncoder encoder, @Value("${app.admin.email:}") String adminEmail) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.adminEmail = adminEmail == null ? "" : adminEmail.strip().toLowerCase(Locale.ROOT);
    }

    /**
     * 400 without a usable password, 409 for the admin account (otherwise anyone could re-register the admin email and
     * inherit the role), 403 for a wrong password (deliberately not 401: the frontend reads 401 as an expired session),
     * 204 once everything is gone. Signs the user out of every device, since their tokens go with the row.
     */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@AuthenticationPrincipal Long userId, @RequestBody DeleteRequest body) {
        String password = AuthController.requirePassword(body == null ? null : body.password(), 1);
        UserRow user = jdbc.sql("SELECT email, password_hash FROM users WHERE id = :id")
                .param("id", userId)
                .query((rs, i) -> new UserRow(rs.getString("email"), rs.getString("password_hash")))
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        if (!adminEmail.isEmpty() && adminEmail.equals(user.email().strip().toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The admin account cannot be deleted");
        }
        if (user.passwordHash() == null || !encoder.matches(password, user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Wrong password");
        }
        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", userId).update();
        log.info("User {} deleted their account", userId);
    }
}
