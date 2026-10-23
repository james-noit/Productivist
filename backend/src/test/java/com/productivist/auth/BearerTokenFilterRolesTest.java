package com.productivist.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;

class BearerTokenFilterRolesTest {

    private static List<String> roles(BearerTokenFilter filter, String email) {
        return filter.authoritiesFor(email).stream().map(GrantedAuthority::getAuthority).toList();
    }

    @Test
    void theAdminIsAlsoAFitnessDirector() {
        BearerTokenFilter filter = new BearerTokenFilter(null, " Admin@Example.com ", List.of());
        assertThat(roles(filter, "admin@example.com")).containsExactlyInAnyOrder("ROLE_ADMIN", "ROLE_FITNESS_DIRECTOR");
    }

    @Test
    void directorsComeFromTheCommaSeparatedList() {
        BearerTokenFilter filter = new BearerTokenFilter(null, "admin@example.com", BearerTokenFilter.parseEmails(" Coach@Example.com , ,second@example.com"));
        assertThat(roles(filter, "coach@example.com")).containsExactly("ROLE_FITNESS_DIRECTOR");
        assertThat(roles(filter, "second@example.com")).containsExactly("ROLE_FITNESS_DIRECTOR");
        assertThat(roles(filter, "someone@example.com")).isEmpty();
    }

    @Test
    void blankConfigurationGrantsNothing() {
        BearerTokenFilter filter = new BearerTokenFilter(null, "", BearerTokenFilter.parseEmails(""));
        assertThat(roles(filter, "")).isEmpty();
        assertThat(roles(filter, "admin@example.com")).isEmpty();
        assertThat(BearerTokenFilter.parseEmails(null)).isEmpty();
    }
}
