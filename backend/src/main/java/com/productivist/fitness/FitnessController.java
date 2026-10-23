package com.productivist.fitness;

import java.util.List;

import com.productivist.auth.BearerTokenFilter;
import com.productivist.fitness.FitnessCatalogService.Draft;
import com.productivist.fitness.FitnessCatalogService.DraftSaved;
import com.productivist.fitness.FitnessCatalogService.Published;
import com.productivist.fitness.FitnessCatalogService.Version;
import com.productivist.fitness.FitnessCatalogService.VersionDocument;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;

/**
 * Authoring of the Sportask catalog overlay for the fitness directors (see {@code app.fitness.director-emails}; access is
 * enforced in SecurityConfig, the admin is a director too). The published overlay is read by everyone through
 * {@link SportCatalogController}.
 */
@RestController
@RequestMapping("/api/fitness")
public class FitnessController {

    public record Me(String email, boolean admin) {}

    public record DraftBody(JsonNode document, Long expectedRevision) {}

    public record PublishBody(String note, Long expectedRevision, Integer rollbackOf) {}

    public record RestoreBody(Long expectedRevision) {}

    private final FitnessCatalogService catalog;
    private final JdbcClient jdbc;

    public FitnessController(FitnessCatalogService catalog, JdbcClient jdbc) {
        this.catalog = catalog;
        this.jdbc = jdbc;
    }

    /** Lets the frontend ask "am I a fitness director?": 200 for directors and the admin, 403 for everyone else. */
    @GetMapping("/me")
    public Me me(@AuthenticationPrincipal Long userId, Authentication authentication) {
        String email = jdbc.sql("SELECT email FROM users WHERE id = :id").param("id", userId).query(String.class).single();
        boolean admin = authentication.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals(BearerTokenFilter.ROLE_ADMIN));
        return new Me(email, admin);
    }

    @GetMapping("/draft")
    public Draft draft() {
        return catalog.draft();
    }

    @PutMapping("/draft")
    public DraftSaved saveDraft(@AuthenticationPrincipal Long userId, @RequestBody DraftBody body) {
        return catalog.saveDraft(userId, body == null ? null : body.document(), body == null ? null : body.expectedRevision());
    }

    @PostMapping("/publish")
    public Published publish(@AuthenticationPrincipal Long userId, @RequestBody PublishBody body) {
        return catalog.publish(userId, body.note(), body.expectedRevision(), body.rollbackOf());
    }

    @GetMapping("/versions")
    public List<Version> versions() {
        return catalog.versions();
    }

    @GetMapping("/versions/{version}")
    public VersionDocument version(@PathVariable int version) {
        return catalog.version(version);
    }

    @PostMapping("/versions/{version}/restore")
    public DraftSaved restore(@AuthenticationPrincipal Long userId, @PathVariable int version, @RequestBody RestoreBody body) {
        return catalog.restore(userId, version, body.expectedRevision());
    }
}
