package com.productivist.fitness;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SportCatalogControllerTest {

    @Test
    void etagMatchingFollowsIfNoneMatch() {
        String etag = SportCatalogController.etag(3);
        assertThat(etag).isEqualTo("\"v3\"");
        assertThat(SportCatalogController.matches("\"v3\"", etag)).isTrue();
        assertThat(SportCatalogController.matches("W/\"v3\"", etag)).isTrue();
        assertThat(SportCatalogController.matches("\"v1\", \"v3\"", etag)).isTrue();
        assertThat(SportCatalogController.matches("*", etag)).isTrue();
        assertThat(SportCatalogController.matches("\"v2\"", etag)).isFalse();
        assertThat(SportCatalogController.matches(null, etag)).isFalse();
        assertThat(SportCatalogController.matches("  ", etag)).isFalse();
    }
}
