package com.productivist.fitness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class FitnessCatalogValidatorTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private JsonNode doc(String text) {
        return json.readTree(text);
    }

    @Test
    void acceptsAnEmptyOverlayAndARealisticOne() {
        assertThat(FitnessCatalogValidator.check(doc("{\"schema\":1}"))).isEqualTo("{\"schema\":1}");
        String text = """
                {"schema":1,
                 "exercises":[{"id":"fd-bearCrawl","name":{"en":"Bear crawl","es":"Gateo del oso"},"level":3},{"id":"pushUp","dose":{"reps":10}}],
                 "cadences":[{"id":"fd-pomodoro-plus","focusSeconds":1800,"breakSeconds":300,"exerciseEvery":1}]}
                """;
        assertThat(FitnessCatalogValidator.check(doc(text))).contains("fd-bearCrawl");
    }

    @Test
    void vocabularyIsNotItsBusiness() {
        // An exercise nobody knows, with nonsense fields: the server checks shape and size only.
        FitnessCatalogValidator.check(doc("{\"schema\":1,\"exercises\":[{\"id\":\"whatever\",\"level\":99,\"pattern\":\"zzz\"}],\"newSection\":[{\"id\":\"a\"}]}"));
    }

    @Test
    void refusesABadShape() {
        for (String bad : new String[] {
            "[]", "\"x\"", "{}", "{\"schema\":\"1\"}", "{\"schema\":0}", "{\"schema\":1.5}",
            "{\"schema\":1,\"exercises\":{}}",
            "{\"schema\":1,\"exercises\":[1]}",
            "{\"schema\":1,\"exercises\":[{}]}",
            "{\"schema\":1,\"exercises\":[{\"id\":\"has space\"}]}",
            "{\"schema\":1,\"exercises\":[{\"id\":7}]}",
            "{\"schema\":1,\"exercises\":[{\"id\":\"a\"},{\"id\":\"a\"}]}",
            "{\"schema\":1,\"1bad\":[]}",
        }) {
            assertThatThrownBy(() -> FitnessCatalogValidator.check(doc(bad))).as(bad).isInstanceOf(FitnessCatalogValidator.Invalid.class);
        }
        assertThatThrownBy(() -> FitnessCatalogValidator.check(null)).isInstanceOf(FitnessCatalogValidator.Invalid.class);
    }

    @Test
    void boundsSizeEntriesDepthAndTexts() {
        String longText = "x".repeat(FitnessCatalogValidator.MAX_STRING_CHARS + 1);
        assertThatThrownBy(() -> FitnessCatalogValidator.check(doc("{\"schema\":1,\"exercises\":[{\"id\":\"a\",\"t\":\"" + longText + "\"}]}")))
                .isInstanceOf(FitnessCatalogValidator.Invalid.class).hasMessageContaining("too long");

        StringBuilder many = new StringBuilder("{\"schema\":1,\"exercises\":[");
        for (int i = 0; i <= FitnessCatalogValidator.MAX_ENTRIES; i++) many.append(i == 0 ? "" : ",").append("{\"id\":\"e").append(i).append("\"}");
        many.append("]}");
        assertThatThrownBy(() -> FitnessCatalogValidator.check(doc(many.toString()))).isInstanceOf(FitnessCatalogValidator.Invalid.class);

        String deep = "{\"schema\":1,\"exercises\":[{\"id\":\"a\",\"x\":" + "[".repeat(15) + "]".repeat(15) + "}]}";
        assertThatThrownBy(() -> FitnessCatalogValidator.check(doc(deep))).isInstanceOf(FitnessCatalogValidator.Invalid.class).hasMessageContaining("deeply");

        StringBuilder big = new StringBuilder("{\"schema\":1,\"exercises\":[");
        for (int i = 0; i < 200; i++) big.append(i == 0 ? "" : ",").append("{\"id\":\"e").append(i).append("\",\"t\":\"").append("y".repeat(1900)).append("\"}");
        big.append("]}");
        assertThatThrownBy(() -> FitnessCatalogValidator.check(doc(big.toString())))
                .isInstanceOfSatisfying(FitnessCatalogValidator.Invalid.class, e -> assertThat(e.tooLarge()).isTrue());
    }
}
