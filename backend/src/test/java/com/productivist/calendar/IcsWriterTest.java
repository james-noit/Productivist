package com.productivist.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

class IcsWriterTest {

    private static IcsWriter.Event event(String id, String title, String due) {
        return new IcsWriter.Event(id, title, null, due, 1_700_000_000_000L, null, null);
    }

    @Test
    void writesAllDayEventsWithStableUids() {
        String ics = IcsWriter.write("Productivist", List.of(new IcsWriter.Event("a1", "Ship, it; now", "Line 1\nLine 2", "2026-12-31", 1_700_000_000_000L, "Web", "v1")));
        assertThat(ics).startsWith("BEGIN:VCALENDAR\r\n").endsWith("END:VCALENDAR\r\n");
        assertThat(ics).contains("UID:todo-a1@productivist\r\n");
        assertThat(ics).contains("DTSTART;VALUE=DATE:20261231\r\n");
        assertThat(ics).contains("DTEND;VALUE=DATE:20270101\r\n");
        assertThat(ics).contains("DTSTAMP:20231114T221320Z\r\n");
        assertThat(ics).contains("SUMMARY:Ship\\, it\\; now\r\n");
        assertThat(ics).contains("DESCRIPTION:Web › v1\\n\\nLine 1\\nLine 2\r\n");
        assertThat(ics).contains("TRANSP:TRANSPARENT\r\n");
    }

    @Test
    void skipsImpossibleDatesAndOmitsEmptyDescriptions() {
        String ics = IcsWriter.write("P", List.of(event("x", "Bad", "2026-02-30"), event("y", "Good", "2026-02-28")));
        assertThat(ics).doesNotContain("Bad").contains("SUMMARY:Good").doesNotContain("DESCRIPTION");
    }

    @Test
    void foldsLongLinesAtSeventyFiveOctetsWithoutSplittingCharacters() {
        String ics = IcsWriter.write("P", List.of(event("z", "ñ".repeat(100) + "😀".repeat(20), "2026-01-01")));
        for (String line : ics.split("\r\n")) {
            assertThat(line.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(75);
            assertThat(line).doesNotContain("�");
        }
        String unfolded = ics.replace("\r\n ", "");
        assertThat(unfolded).contains("SUMMARY:" + "ñ".repeat(100) + "😀".repeat(20) + "\r\n");
    }

    @Test
    void escapesTextAndDropsControlCharacters() {
        assertThat(IcsWriter.text("a\\b\r\nc\u0007d")).isEqualTo("a\\\\b\\ncd");
    }

    @Test
    void tokensAndEtags() {
        CalendarFeedController controller = new CalendarFeedController(null);
        String token = controller.newToken();
        assertThat(CalendarFeedController.validToken(token)).isTrue();
        assertThat(CalendarFeedController.validToken(token + "x")).isFalse();
        assertThat(CalendarFeedController.validToken("../../etc")).isFalse();
        String etag = CalendarFeedController.etagOf("body");
        assertThat(CalendarFeedController.matches(etag, etag)).isTrue();
        assertThat(CalendarFeedController.matches("W/" + etag, etag)).isTrue();
        assertThat(CalendarFeedController.matches("\"other\"", etag)).isFalse();
    }
}
