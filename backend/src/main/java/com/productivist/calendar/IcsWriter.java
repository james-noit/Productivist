package com.productivist.calendar;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Writes an iCalendar (RFC 5545) document of all-day events, one per open task with a due date. Pure, so it is unit
 * tested without a database. A task's due date is a local calendar day, so events use {@code VALUE=DATE} (floating, no
 * time zone) and never shift with the calendar's zone. The frontend's single-event download
 * ({@code src/lib/calendar-links.ts}) writes the same UID, so an imported event and the subscribed one describe the same
 * task.
 */
public final class IcsWriter {

    /** One task as an event. {@code dueDate} is 'YYYY-MM-DD'; {@code updatedAt} is epoch ms. */
    public record Event(String id, String title, String description, String dueDate, long updatedAt, String project, String milestone) {}

    static final int MAX_DESCRIPTION = 2000;
    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private IcsWriter() {}

    public static String write(String calendarName, List<Event> events) {
        StringBuilder out = new StringBuilder(256 + events.size() * 256);
        line(out, "BEGIN:VCALENDAR");
        line(out, "VERSION:2.0");
        line(out, "PRODID:-//Productivist//Tasks//EN");
        line(out, "CALSCALE:GREGORIAN");
        line(out, "METHOD:PUBLISH");
        line(out, "X-WR-CALNAME:" + text(calendarName));
        // Hints only: each provider decides how often it polls (often every few hours).
        line(out, "REFRESH-INTERVAL;VALUE=DURATION:PT1H");
        line(out, "X-PUBLISHED-TTL:PT1H");
        for (Event e : events) {
            LocalDate day;
            try {
                day = LocalDate.parse(e.dueDate());
            } catch (DateTimeParseException | NullPointerException ex) {
                continue; // the column only checks the shape, so 2026-02-30 is possible: skip it
            }
            String stamp = STAMP.format(Instant.ofEpochMilli(Math.max(0, e.updatedAt())));
            line(out, "BEGIN:VEVENT");
            line(out, "UID:" + uid(e.id()));
            line(out, "DTSTAMP:" + stamp);
            line(out, "LAST-MODIFIED:" + stamp);
            line(out, "DTSTART;VALUE=DATE:" + DAY.format(day));
            line(out, "DTEND;VALUE=DATE:" + DAY.format(day.plusDays(1)));
            line(out, "SUMMARY:" + text(e.title()));
            String details = details(e);
            if (!details.isEmpty()) line(out, "DESCRIPTION:" + text(details));
            // A due date is not a meeting: do not mark the day as busy.
            line(out, "TRANSP:TRANSPARENT");
            line(out, "END:VEVENT");
        }
        line(out, "END:VCALENDAR");
        return out.toString();
    }

    /** Stable per task, the same as the frontend's downloaded event. */
    static String uid(String todoId) {
        return text("todo-" + todoId + "@productivist");
    }

    static String details(Event e) {
        StringBuilder place = new StringBuilder();
        if (e.project() != null && !e.project().isBlank()) place.append(e.project().strip());
        if (e.milestone() != null && !e.milestone().isBlank()) {
            if (!place.isEmpty()) place.append(" › ");
            place.append(e.milestone().strip());
        }
        String description = e.description() == null ? "" : e.description().strip();
        String all = place.isEmpty() ? description : description.isEmpty() ? place.toString() : place + "\n\n" + description;
        return all.length() > MAX_DESCRIPTION ? all.substring(0, MAX_DESCRIPTION - 1) + "…" : all;
    }

    /** RFC 5545 TEXT escaping; other control characters are dropped. */
    static String text(String value) {
        if (value == null) return "";
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> out.append("\\\\");
                case ';' -> out.append("\\;");
                case ',' -> out.append("\\,");
                case '\n' -> out.append("\\n");
                case '\r' -> { }
                default -> {
                    if (c >= 0x20 && c != 0x7f) out.append(c);
                }
            }
        }
        return out.toString();
    }

    /** Appends a content line folded at 75 octets (never inside a UTF-8 sequence or a surrogate pair), ended by CRLF. */
    static void line(StringBuilder out, String content) {
        int octets = 0;
        int i = 0;
        while (i < content.length()) {
            int cp = content.codePointAt(i);
            int width = new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8).length;
            if (octets + width > 75) {
                out.append("\r\n ");
                octets = 1; // the leading space counts
            }
            out.appendCodePoint(cp);
            octets += width;
            i += Character.charCount(cp);
        }
        out.append("\r\n");
    }
}
