package com.productivist.calendar;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The calendar subscription. A signed-in user manages one secret feed URL ({@code /api/calendar/feed}); calendars fetch it
 * without a token ({@code GET /api/calendar/ics/<token>.ics}, permitted in {@code SecurityConfig}) and get every open task
 * with a due date as an all-day event, so a changed date, a completed or a deleted task reaches the calendar at its next
 * poll. Unknown tokens are a plain 404.
 */
@RestController
@RequestMapping("/api/calendar")
public class CalendarFeedController {

    private static final Logger log = LoggerFactory.getLogger(CalendarFeedController.class);
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    static final int MAX_EVENTS = 2000;
    private static final MediaType TEXT_CALENDAR = new MediaType("text", "calendar", StandardCharsets.UTF_8);

    /** {@code token} is null while the user has no feed; {@code lastFetchedAt} (epoch ms) is the last time a calendar read it. */
    public record FeedStatus(String token, Long createdAt, Long lastFetchedAt) {}

    private final JdbcClient jdbc;
    private final SecureRandom random = new SecureRandom();

    public CalendarFeedController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/feed")
    public FeedStatus status(@AuthenticationPrincipal Long userId) {
        return jdbc.sql("SELECT token, created_at, last_fetched_at FROM calendar_feeds WHERE user_id = :u")
                .param("u", userId)
                .query((rs, i) -> new FeedStatus(rs.getString("token"), millis(rs.getTimestamp("created_at")), millis(rs.getTimestamp("last_fetched_at"))))
                .optional()
                .orElse(new FeedStatus(null, null, null));
    }

    /** Creates the feed, or replaces its token: the previous URL stops working at once. */
    @PostMapping("/feed")
    @Transactional
    public FeedStatus create(@AuthenticationPrincipal Long userId) {
        String token = newToken();
        jdbc.sql("""
                INSERT INTO calendar_feeds (user_id, token) VALUES (:u, :t)
                ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = now(), last_fetched_at = NULL
                """)
                .param("u", userId)
                .param("t", token)
                .update();
        log.info("User {} created a calendar feed URL", userId);
        return status(userId);
    }

    @DeleteMapping("/feed")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Long userId) {
        jdbc.sql("DELETE FROM calendar_feeds WHERE user_id = :u").param("u", userId).update();
    }

    /** Public: the token is the credential. {@code file} is {@code <token>.ics}. */
    @GetMapping("/ics/{file}")
    public ResponseEntity<String> feed(@PathVariable String file, @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        String token = file.endsWith(".ics") ? file.substring(0, file.length() - 4) : file;
        if (!validToken(token)) return ResponseEntity.notFound().build();
        Optional<Long> owner = jdbc.sql("UPDATE calendar_feeds SET last_fetched_at = now() WHERE token = :t RETURNING user_id")
                .param("t", token)
                .query(Long.class)
                .optional();
        if (owner.isEmpty()) return ResponseEntity.notFound().build();

        List<IcsWriter.Event> events = jdbc.sql("""
                SELECT t.id, t.title, t.description, t.due_date, t.updated_at, p.name AS project, m.name AS milestone
                FROM todos t
                LEFT JOIN projects p ON p.user_id = t.user_id AND p.id = t.project_id AND NOT p.deleted
                LEFT JOIN milestones m ON m.user_id = t.user_id AND m.id = t.milestone_id AND NOT m.deleted
                WHERE t.user_id = :u AND NOT t.deleted AND NOT t.done AND t.due_date IS NOT NULL
                ORDER BY t.due_date, t.id
                LIMIT :limit
                """)
                .param("u", owner.get())
                .param("limit", MAX_EVENTS)
                .query((rs, i) -> new IcsWriter.Event(rs.getString("id"), rs.getString("title"), rs.getString("description"),
                        rs.getString("due_date"), rs.getLong("updated_at"), rs.getString("project"), rs.getString("milestone")))
                .list();

        String body = IcsWriter.write("Productivist", events);
        String etag = etagOf(body);
        CacheControl cache = CacheControl.noCache().cachePrivate();
        if (matches(ifNoneMatch, etag)) return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        return ResponseEntity.ok()
                .contentType(TEXT_CALENDAR)
                .eTag(etag)
                .cacheControl(cache)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"productivist.ics\"")
                .header("X-Robots-Tag", "noindex")
                .body(body);
    }

    /** 32 random bytes, base64url without padding: 43 characters. */
    String newToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String etagOf(String body) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8));
            return "\"" + HexFormat.of().formatHex(digest, 0, 16) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Whether an {@code If-None-Match} list names this ETag (weak comparison). */
    static boolean matches(String header, String etag) {
        if (header == null || header.isBlank()) return false;
        for (String candidate : header.split(",")) {
            String c = candidate.strip();
            if (c.startsWith("W/")) c = c.substring(2);
            if (c.equals("*") || c.equals(etag)) return true;
        }
        return false;
    }

    static boolean validToken(String token) {
        return TOKEN.matcher(token).matches();
    }

    private static Long millis(Timestamp ts) {
        return ts == null ? null : ts.toInstant().toEpochMilli();
    }
}
