package com.productivist.fitness;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;

/**
 * Shape and size of a Sportask catalog overlay (docs/sportask/DIRECTOR.md), never its vocabulary: whether an exercise id or
 * a phase parameter makes sense is the clients' business (the editor validates before publishing, and every consumer
 * re-validates before applying). Pure, so it is unit-tested without Spring.
 *
 * <pre>
 * { "schema": 1, "exercises": [{ "id": "...", ... }], "ladders": [...], ... }
 * </pre>
 */
public final class FitnessCatalogValidator {

    /** Same as the other Sportask ids (see {@code SyncDtos.VOCAB}). */
    static final Pattern ID = Pattern.compile("^[A-Za-z0-9_.-]{1,64}$");
    private static final Pattern SECTION = Pattern.compile("^[a-zA-Z][A-Za-z0-9]{0,31}$");

    public static final int MAX_CHARS = 262_144;
    static final int MAX_SECTIONS = 16;
    static final int MAX_ENTRIES = 500;
    static final int MAX_DEPTH = 12;
    static final int MAX_STRING_CHARS = 2_000;

    /** A refusal: the message goes to the client, the status is 400 for a bad shape and 413 for a document that is too large. */
    public static final class Invalid extends RuntimeException {
        private final boolean tooLarge;

        Invalid(String message, boolean tooLarge) {
            super(message);
            this.tooLarge = tooLarge;
        }

        public boolean tooLarge() {
            return tooLarge;
        }
    }

    private FitnessCatalogValidator() {}

    /** Returns the document as JSON text when it is acceptable; throws {@link Invalid} otherwise. */
    public static String check(JsonNode doc) {
        if (doc == null || !doc.isObject()) throw bad("The catalog must be a JSON object");
        String text = doc.toString();
        if (text.length() > MAX_CHARS) throw new Invalid("The catalog is too large", true);

        JsonNode schema = doc.get("schema");
        if (schema == null || !schema.isIntegralNumber() || !schema.canConvertToInt() || schema.intValue() < 1) {
            throw bad("schema must be a positive integer");
        }
        if (doc.size() > MAX_SECTIONS) throw bad("Too many sections");
        for (var entry : doc.properties()) {
            String key = entry.getKey();
            if (!SECTION.matcher(key).matches()) throw bad("Invalid section name");
            if (key.equals("schema")) continue;
            JsonNode list = entry.getValue();
            if (!list.isArray() || list.size() > MAX_ENTRIES) throw bad("Section " + key + " must be a list of at most " + MAX_ENTRIES);
            Set<String> ids = new HashSet<>();
            for (JsonNode item : list) {
                JsonNode id = item.get("id");
                if (!item.isObject() || id == null || !id.isString() || !ID.matcher(id.asString()).matches()) {
                    throw bad("Every entry of " + key + " needs an id");
                }
                if (!ids.add(id.asString())) throw bad("Duplicate id in " + key);
            }
        }
        checkTree(doc, 0);
        return text;
    }

    private static void checkTree(JsonNode node, int depth) {
        if (depth > MAX_DEPTH) throw bad("Nested too deeply");
        if (node.isString()) {
            if (node.asString().length() > MAX_STRING_CHARS) throw bad("A text is too long");
        } else if (node.isObject()) {
            node.properties().forEach(e -> {
                if (e.getKey().length() > 64) throw bad("A key is too long");
                checkTree(e.getValue(), depth + 1);
            });
        } else if (node.isArray()) {
            node.forEach(child -> checkTree(child, depth + 1));
        }
    }

    private static Invalid bad(String message) {
        return new Invalid(message, false);
    }
}
