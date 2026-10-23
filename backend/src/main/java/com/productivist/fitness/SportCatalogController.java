package com.productivist.fitness;

import com.productivist.fitness.FitnessCatalogService.Published;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The published Sportask catalog overlay, for every client. Public on purpose (no token): the content is not personal, the
 * app is local-first and sync is optional, and the add-on and mobile apps call the same API. It sends nothing about the
 * user; revalidation is a 304 on {@code If-None-Match}.
 */
@RestController
@RequestMapping("/api/sport-catalog")
public class SportCatalogController {

    private final FitnessCatalogService catalog;

    public SportCatalogController(FitnessCatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public ResponseEntity<Published> published(@RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        Published head = catalog.published();
        String etag = etag(head.version());
        // `no-cache` = store it, but ask again every time (a cheap 304), so a new version reaches clients at their next load.
        ResponseEntity.BodyBuilder response = ResponseEntity.ok().eTag(etag).cacheControl(CacheControl.noCache());
        if (matches(ifNoneMatch, etag)) return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(CacheControl.noCache()).build();
        return response.body(head);
    }

    static String etag(int version) {
        return "\"v" + version + "\"";
    }

    /** Whether any validator of an {@code If-None-Match} list (or {@code *}) names this ETag. */
    static boolean matches(String header, String etag) {
        if (header == null || header.isBlank()) return false;
        for (String candidate : header.split(",")) {
            String c = candidate.strip();
            if (c.startsWith("W/")) c = c.substring(2);
            if (c.equals("*") || c.equals(etag)) return true;
        }
        return false;
    }
}
