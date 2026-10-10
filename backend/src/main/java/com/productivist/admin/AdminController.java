package com.productivist.admin;

import java.time.OffsetDateTime;
import java.util.List;

import com.productivist.auth.AuthController;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Account moderation for the single admin (see {@code app.admin.email}; access is enforced in SecurityConfig).
 * It deliberately exposes account metadata and row counts only, never the content of anyone's tasks or projects.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);
    private static final int MAX_PAGE_SIZE = 100;

    public record Me(String email) {}

    public record Stats(long users, long withoutPassword, long sessions, long todos, long projects,
            long objectives) {}

    public record UserSummary(long id, String email, OffsetDateTime createdAt, boolean hasPassword, int sessions,
            int todos, int projects, int objectives) {}

    public record UserPage(List<UserSummary> users, long total) {}

    public record UserUpdate(String email, String password) {
        @Override
        public String toString() {
            return "UserUpdate[email=" + email + ", password=<redacted>]";
        }
    }

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;

    public AdminController(JdbcClient jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    /** Lets the frontend ask "am I the admin?": 200 for the admin, 403 for everyone else. */
    @GetMapping("/me")
    public Me me(@AuthenticationPrincipal Long adminId) {
        return jdbc.sql("SELECT email FROM users WHERE id = :id").param("id", adminId).query(Me.class).single();
    }

    @GetMapping("/stats")
    public Stats stats() {
        return jdbc.sql("""
                        SELECT (SELECT count(*) FROM users) AS users,
                               (SELECT count(*) FROM users WHERE password_hash IS NULL) AS without_password,
                               (SELECT count(*) FROM auth_tokens) AS sessions,
                               (SELECT count(*) FROM todos WHERE NOT deleted) AS todos,
                               (SELECT count(*) FROM projects WHERE NOT deleted) AS projects,
                               (SELECT count(*) FROM objectives WHERE NOT deleted) AS objectives
                        """)
                .query((rs, i) -> new Stats(rs.getLong("users"), rs.getLong("without_password"), rs.getLong("sessions"),
                        rs.getLong("todos"), rs.getLong("projects"), rs.getLong("objectives")))
                .single();
    }

    @GetMapping("/users")
    public UserPage users(@RequestParam(defaultValue = "") String query, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        int limit = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        long offset = (long) Math.max(page, 0) * limit;
        // position() instead of LIKE so '%' and '_' in the search text need no escaping.
        String filter = "position(lower(:query) in email) > 0";
        long total = jdbc.sql("SELECT count(*) FROM users WHERE " + filter)
                .param("query", query.strip())
                .query(Long.class)
                .single();
        List<UserSummary> users = jdbc.sql("""
                        SELECT id, email, created_at, password_hash IS NOT NULL AS has_password,
                               (SELECT count(*) FROM auth_tokens t WHERE t.user_id = users.id) AS sessions,
                               (SELECT count(*) FROM todos t WHERE t.user_id = users.id AND NOT t.deleted) AS todos,
                               (SELECT count(*) FROM projects p WHERE p.user_id = users.id AND NOT p.deleted) AS projects,
                               (SELECT count(*) FROM objectives o WHERE o.user_id = users.id AND NOT o.deleted) AS objectives
                        FROM users WHERE\s""" + filter + """
                         ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset
                        """)
                .param("query", query.strip())
                .param("limit", limit)
                .param("offset", offset)
                .query((rs, i) -> new UserSummary(rs.getLong("id"), rs.getString("email"),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getBoolean("has_password"),
                        rs.getInt("sessions"), rs.getInt("todos"), rs.getInt("projects"), rs.getInt("objectives")))
                .list();
        return new UserPage(users, total);
    }

    /** Changes the email and/or sets a new password (which also signs the user out everywhere). */
    @PatchMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void update(@AuthenticationPrincipal Long adminId, @PathVariable long id, @RequestBody UserUpdate body) {
        refuseSelf(adminId, id);
        if (body == null || (body.email() == null && body.password() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to update");
        }
        requireUser(id);
        if (body.email() != null) {
            String email = AuthController.normalizeEmail(body.email());
            try {
                jdbc.sql("UPDATE users SET email = :email WHERE id = :id").param("email", email).param("id", id).update();
            } catch (DuplicateKeyException e) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
            }
        }
        if (body.password() != null) {
            String password = AuthController.requirePassword(body.password(), AuthController.MIN_PASSWORD_LENGTH);
            jdbc.sql("UPDATE users SET password_hash = :hash WHERE id = :id")
                    .param("hash", encoder.encode(password))
                    .param("id", id)
                    .update();
            revokeSessions(id);
        }
        log.info("Admin {} updated user {} (email={}, password={})", adminId, id, body.email() != null,
                body.password() != null);
    }

    /** Signs the user out on every device. Their local data is untouched; they just have to log in again. */
    @DeleteMapping("/users/{id}/sessions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal Long adminId, @PathVariable long id) {
        refuseSelf(adminId, id);
        requireUser(id);
        revokeSessions(id);
        log.info("Admin {} revoked the sessions of user {}", adminId, id);
    }

    /** Deletes the account and, through the foreign keys, its tokens and every synced row. */
    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Long adminId, @PathVariable long id) {
        refuseSelf(adminId, id);
        requireUser(id);
        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", id).update();
        log.info("Admin {} deleted user {}", adminId, id);
    }

    /** The admin's own account is managed like any other user's, so a slip here cannot lock them out. */
    private static void refuseSelf(Long adminId, long id) {
        if (adminId != null && adminId == id) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The admin account cannot be changed here");
        }
    }

    private void requireUser(long id) {
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM users WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
        if (!exists) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user");
    }

    private void revokeSessions(long id) {
        jdbc.sql("DELETE FROM auth_tokens WHERE user_id = :id").param("id", id).update();
    }
}
