package com.productivist.fitness;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The draft and the published versions of the Sportask catalog overlay. All writes are done by directors (the controller is
 * behind {@code ROLE_FITNESS_DIRECTOR}); {@link #published()} also feeds the public read endpoint.
 */
@Service
public class FitnessCatalogService {

    private static final Logger log = LoggerFactory.getLogger(FitnessCatalogService.class);
    /** Serialises publishing so two directors cannot be given the same version number. */
    private static final long PUBLISH_LOCK = 0x5F17_4E55L;
    private static final int MAX_NOTE_CHARS = 500;
    private static final String EMPTY = "{\"schema\":1}";

    public record Draft(JsonNode document, long revision, int baseVersion, String updatedBy, OffsetDateTime updatedAt) {}

    public record DraftSaved(long revision, OffsetDateTime updatedAt) {}

    public record Version(int version, String note, String kind, Integer rollbackOf, String author, OffsetDateTime publishedAt, int size) {}

    public record VersionDocument(int version, String note, String kind, Integer rollbackOf, String author, OffsetDateTime publishedAt, JsonNode document) {}

    /** What clients read: version 0 and an empty document until the first publish. */
    public record Published(int version, OffsetDateTime publishedAt, JsonNode document) {}

    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public FitnessCatalogService(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public Draft draft() {
        return jdbc.sql("SELECT document, revision, base_version, updated_by_email, updated_at FROM fitness_catalog_draft WHERE id = 1")
                .query((rs, i) -> new Draft(json.readTree(rs.getString("document")), rs.getLong("revision"), rs.getInt("base_version"),
                        rs.getString("updated_by_email"), rs.getObject("updated_at", OffsetDateTime.class)))
                .single();
    }

    @Transactional
    public DraftSaved saveDraft(long userId, JsonNode document, Long expectedRevision) {
        String text = validated(document);
        requireRevision(expectedRevision);
        String email = emailOf(userId);
        // The WHERE clause is the concurrency check: nobody saved since the director read the draft.
        Optional<DraftSaved> saved = jdbc.sql("""
                        UPDATE fitness_catalog_draft
                        SET document = CAST(:document AS jsonb), revision = revision + 1, updated_by_email = :email, updated_at = now()
                        WHERE id = 1 AND revision = :expected
                        RETURNING revision, updated_at
                        """)
                .param("document", text)
                .param("email", email)
                .param("expected", expectedRevision)
                .query((rs, i) -> new DraftSaved(rs.getLong("revision"), rs.getObject("updated_at", OffsetDateTime.class)))
                .optional();
        DraftSaved result = saved.orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "The draft changed since you loaded it"));
        log.info("Fitness director {} saved the catalog draft (revision {})", userId, result.revision());
        return result;
    }

    /** Snapshots the current draft as the next version. {@code rollbackOf} marks a republished older version. */
    @Transactional
    public Published publish(long userId, String note, Long expectedRevision, Integer rollbackOf) {
        requireRevision(expectedRevision);
        String text = note == null ? "" : note.strip();
        if (text.length() > MAX_NOTE_CHARS) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The note is too long");
        if (rollbackOf != null && rollbackOf < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid rollback version");
        jdbc.sql("SELECT pg_advisory_xact_lock(:key)").param("key", PUBLISH_LOCK).query().singleValue();

        Draft draft = draft();
        if (draft.revision() != expectedRevision) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The draft changed since you loaded it");
        }
        validated(draft.document()); // already checked on save; also refuses a draft written by hand in the database
        boolean unchanged = jdbc.sql("""
                        SELECT EXISTS (
                            SELECT 1 FROM fitness_catalog_versions
                            WHERE version = (SELECT max(version) FROM fitness_catalog_versions)
                              AND document = (SELECT document FROM fitness_catalog_draft WHERE id = 1))
                        """)
                .query(Boolean.class)
                .single();
        if (unchanged) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Nothing changed since the published version");

        int version = jdbc.sql("SELECT COALESCE(max(version), 0) + 1 FROM fitness_catalog_versions").query(Integer.class).single();
        jdbc.sql("""
                        INSERT INTO fitness_catalog_versions (version, document, note, kind, rollback_of, author_id, author_email)
                        SELECT :version, document, :note, :kind, :rollbackOf, :author, :email FROM fitness_catalog_draft WHERE id = 1
                        """)
                .param("version", version)
                .param("note", text)
                .param("kind", rollbackOf == null ? "publish" : "rollback")
                .param("rollbackOf", rollbackOf)
                .param("author", userId)
                .param("email", emailOf(userId))
                .update();
        jdbc.sql("UPDATE fitness_catalog_draft SET base_version = :version WHERE id = 1").param("version", version).update();
        log.info("Fitness director {} published catalog version {} ({})", userId, version, rollbackOf == null ? "publish" : "rollback of " + rollbackOf);
        return published();
    }

    public List<Version> versions() {
        return jdbc.sql("""
                        SELECT version, note, kind, rollback_of, author_email, published_at, length(document::text) AS size
                        FROM fitness_catalog_versions ORDER BY version DESC LIMIT 200
                        """)
                .query((rs, i) -> new Version(rs.getInt("version"), rs.getString("note"), rs.getString("kind"),
                        (Integer) rs.getObject("rollback_of"), rs.getString("author_email"),
                        rs.getObject("published_at", OffsetDateTime.class), rs.getInt("size")))
                .list();
    }

    public VersionDocument version(int version) {
        return jdbc.sql("SELECT version, document, note, kind, rollback_of, author_email, published_at FROM fitness_catalog_versions WHERE version = :v")
                .param("v", version)
                .query((rs, i) -> new VersionDocument(rs.getInt("version"), rs.getString("note"), rs.getString("kind"),
                        (Integer) rs.getObject("rollback_of"), rs.getString("author_email"),
                        rs.getObject("published_at", OffsetDateTime.class), json.readTree(rs.getString("document"))))
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such version"));
    }

    /** Copies a published version into the draft (not published). */
    @Transactional
    public DraftSaved restore(long userId, int version, Long expectedRevision) {
        requireRevision(expectedRevision);
        VersionDocument source = version(version);
        DraftSaved saved = saveDraft(userId, source.document(), expectedRevision);
        log.info("Fitness director {} restored catalog version {} into the draft", userId, version);
        return saved;
    }

    /** The current head, or version 0 with an empty document before the first publish. */
    public Published published() {
        return jdbc.sql("SELECT version, document, published_at FROM fitness_catalog_versions ORDER BY version DESC LIMIT 1")
                .query((rs, i) -> new Published(rs.getInt("version"), rs.getObject("published_at", OffsetDateTime.class),
                        json.readTree(rs.getString("document"))))
                .optional()
                .orElseGet(() -> new Published(0, null, json.readTree(EMPTY)));
    }

    private String validated(JsonNode document) {
        try {
            return FitnessCatalogValidator.check(document);
        } catch (FitnessCatalogValidator.Invalid e) {
            throw new ResponseStatusException(e.tooLarge() ? HttpStatus.CONTENT_TOO_LARGE : HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    private static void requireRevision(Long expected) {
        if (expected == null || expected < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "expectedRevision is required");
    }

    private String emailOf(long userId) {
        return jdbc.sql("SELECT email FROM users WHERE id = :id").param("id", userId).query(String.class).single();
    }
}
