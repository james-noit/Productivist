package com.productivist.sync;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.productivist.sync.SyncDtos.MilestoneDto;
import com.productivist.sync.SyncDtos.ProjectDto;
import com.productivist.sync.SyncDtos.PullResponse;
import com.productivist.sync.SyncDtos.PushRequest;
import com.productivist.sync.SyncDtos.StateDto;
import com.productivist.sync.SyncDtos.TodoDto;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Last-write-wins sync. A push upserts rows only when the incoming {@code updatedAt} is not older than the
 * stored one, so replaying a batch is harmless. Every accepted write takes a fresh {@code seq}, which is what
 * pulls page on. Pushing local data right after a first login is therefore also the merge step.
 */
@Service
public class SyncService {

    private static final int MAX_JSON_CHARS = 256_000;

    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final int maxBatchSize;

    public SyncService(JdbcClient jdbc, ObjectMapper json, @Value("${app.sync.max-batch-size}") int maxBatchSize) {
        this.jdbc = jdbc;
        this.json = json;
        this.maxBatchSize = maxBatchSize;
    }

    @Transactional
    public long push(long userId, PushRequest request) {
        List<ProjectDto> projects = orEmpty(request.projects());
        List<MilestoneDto> milestones = orEmpty(request.milestones());
        List<TodoDto> todos = orEmpty(request.todos());
        if (projects.size() + milestones.size() + todos.size() > maxBatchSize) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Batch exceeds " + maxBatchSize + " rows");
        }
        projects.forEach(p -> upsertProject(userId, p));
        milestones.forEach(m -> upsertMilestone(userId, m));
        todos.forEach(t -> upsertTodo(userId, t));
        if (request.state() != null) upsertState(userId, request.state());
        return currentCursor(userId);
    }

    /**
     * The cursor is read first and every query is bounded by it, so rows committed mid-pull are picked up
     * by the next pull instead of being skipped.
     */
    @Transactional(readOnly = true)
    public PullResponse pull(long userId, long since) {
        long cursor = Math.max(since, currentCursor(userId));
        List<ProjectDto> projects = jdbc.sql("""
                        SELECT id, icon, name, description, notes, sort_order, created_at, updated_at, deleted
                        FROM projects WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new ProjectDto(
                        rs.getString("id"), rs.getString("icon"), rs.getString("name"), rs.getString("description"),
                        rs.getString("notes"), rs.getDouble("sort_order"), rs.getLong("created_at"),
                        rs.getLong("updated_at"), rs.getBoolean("deleted")))
                .list();
        List<MilestoneDto> milestones = jdbc.sql("""
                        SELECT id, project_id, name, sort_order, created_at, updated_at, deleted
                        FROM milestones WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new MilestoneDto(
                        rs.getString("id"), rs.getString("project_id"), rs.getString("name"),
                        rs.getDouble("sort_order"), rs.getLong("created_at"), rs.getLong("updated_at"),
                        rs.getBoolean("deleted")))
                .list();
        List<TodoDto> todos = jdbc.sql("""
                        SELECT id, title, description, importance, urgency, tags, done, sort_order, created_at,
                               completed_at, project_id, milestone_id, pomodoros_for_termination, status, updated_at, deleted
                        FROM todos WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> mapTodo(rs))
                .list();
        StateDto state = jdbc.sql("""
                        SELECT settings::text AS settings, daily_plan::text AS daily_plan, multitask::text AS multitask,
                               current_task_id, has_custom_order, updated_at
                        FROM user_state WHERE user_id = :u AND seq > :since AND seq <= :cursor
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new StateDto(
                        json.readTree(rs.getString("settings")), json.readTree(rs.getString("daily_plan")),
                        json.readTree(rs.getString("multitask")), rs.getString("current_task_id"),
                        rs.getBoolean("has_custom_order"), rs.getLong("updated_at")))
                .optional().orElse(null);
        return new PullResponse(cursor, projects, milestones, todos, state);
    }

    private long currentCursor(long userId) {
        return jdbc.sql("""
                        SELECT GREATEST(
                            (SELECT COALESCE(MAX(seq), 0) FROM projects   WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM milestones WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM todos      WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM user_state WHERE user_id = :u))
                        """)
                .param("u", userId)
                .query(Long.class)
                .single();
    }

    private void upsertProject(long userId, ProjectDto p) {
        if (p.deleted()) {
            tombstone("projects", "name, created_at", "'', 0", userId, p.id(), p.updatedAt());
            return;
        }
        requireText(p.name(), "project name");
        jdbc.sql("""
                        INSERT INTO projects (user_id, id, icon, name, description, notes, sort_order, created_at, updated_at, deleted)
                        VALUES (:u, :id, :icon, :name, :description, :notes, :order, :createdAt, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            icon = EXCLUDED.icon, name = EXCLUDED.name, description = EXCLUDED.description,
                            notes = EXCLUDED.notes, sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE projects.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId).param("id", p.id())
                .param("icon", nullToEmpty(p.icon())).param("name", p.name())
                .param("description", nullToEmpty(p.description())).param("notes", nullToEmpty(p.notes()))
                .param("order", p.order()).param("createdAt", p.createdAt())
                .param("updatedAt", p.updatedAt()).param("deleted", p.deleted())
                .update();
    }

    private void upsertMilestone(long userId, MilestoneDto m) {
        if (m.deleted()) {
            tombstone("milestones", "project_id, name, created_at", "'', '', 0", userId, m.id(), m.updatedAt());
            return;
        }
        requireText(m.projectId(), "milestone projectId");
        requireText(m.name(), "milestone name");
        jdbc.sql("""
                        INSERT INTO milestones (user_id, id, project_id, name, sort_order, created_at, updated_at, deleted)
                        VALUES (:u, :id, :projectId, :name, :order, :createdAt, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            project_id = EXCLUDED.project_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
                            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
                            deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE milestones.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId).param("id", m.id()).param("projectId", m.projectId()).param("name", m.name())
                .param("order", m.order()).param("createdAt", m.createdAt())
                .param("updatedAt", m.updatedAt()).param("deleted", m.deleted())
                .update();
    }

    private void upsertTodo(long userId, TodoDto t) {
        if (t.deleted()) {
            tombstone("todos", "title, importance, urgency, created_at", "'', 'medium', 'medium', 0",
                    userId, t.id(), t.updatedAt());
            return;
        }
        requireText(t.title(), "todo title");
        String tags = json.writeValueAsString(t.tags() == null ? List.of() : t.tags());
        jdbc.sql("""
                        INSERT INTO todos (user_id, id, title, description, importance, urgency, tags, done, sort_order,
                                           created_at, completed_at, project_id, milestone_id, pomodoros_for_termination,
                                           status, updated_at, deleted)
                        VALUES (:u, :id, :title, :description, :importance, :urgency,
                                ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb))), :done, :order,
                                :createdAt, :completedAt, :projectId, :milestoneId, :pomodoros, :status, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            title = EXCLUDED.title, description = EXCLUDED.description, importance = EXCLUDED.importance,
                            urgency = EXCLUDED.urgency, tags = EXCLUDED.tags, done = EXCLUDED.done,
                            sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at,
                            completed_at = EXCLUDED.completed_at, project_id = EXCLUDED.project_id,
                            milestone_id = EXCLUDED.milestone_id,
                            pomodoros_for_termination = EXCLUDED.pomodoros_for_termination,
                            status = EXCLUDED.status,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE todos.updated_at <= EXCLUDED.updated_at
                        """)
                .params(todoParams(userId, t, tags))
                .update();
    }

    /**
     * Marks a row deleted without needing its content. Table and column lists are internal constants, never
     * request data. An unknown id gets a blank placeholder row so the tombstone still reaches other devices.
     */
    private void tombstone(String table, String requiredCols, String requiredVals, long userId, String id, long updatedAt) {
        jdbc.sql(("""
                        INSERT INTO %1$s (user_id, id, %2$s, updated_at, deleted)
                        VALUES (:u, :id, %3$s, :updatedAt, TRUE)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            deleted = TRUE, updated_at = EXCLUDED.updated_at, seq = nextval('sync_seq')
                        WHERE %1$s.updated_at <= EXCLUDED.updated_at
                        """).formatted(table, requiredCols, requiredVals))
                .param("u", userId).param("id", id).param("updatedAt", updatedAt)
                .update();
    }

    private static void requireText(String value, String what) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing " + what);
        }
    }

    private static Map<String, Object> todoParams(long userId, TodoDto t, String tagsJson) {
        // A map, because JdbcClient's varargs param() calls would not let nullable values through cleanly.
        Map<String, Object> m = new HashMap<>();
        m.put("u", userId);
        m.put("id", t.id());
        m.put("title", t.title());
        m.put("description", t.description());
        m.put("importance", t.importance() == null ? "medium" : t.importance());
        m.put("urgency", t.urgency() == null ? "medium" : t.urgency());
        m.put("tags", tagsJson);
        m.put("done", t.done());
        m.put("order", t.order());
        m.put("createdAt", t.createdAt());
        m.put("completedAt", t.completedAt());
        m.put("projectId", t.projectId());
        m.put("milestoneId", t.milestoneId());
        m.put("pomodoros", t.pomodorosForTermination());
        m.put("status", t.status());
        m.put("updatedAt", t.updatedAt());
        m.put("deleted", t.deleted());
        return m;
    }

    private void upsertState(long userId, StateDto s) {
        jdbc.sql("""
                        INSERT INTO user_state (user_id, settings, daily_plan, multitask, current_task_id,
                                                has_custom_order, updated_at)
                        VALUES (:u, CAST(:settings AS jsonb), CAST(:dailyPlan AS jsonb), CAST(:multitask AS jsonb),
                                :currentTaskId, :hasCustomOrder, :updatedAt)
                        ON CONFLICT (user_id) DO UPDATE SET
                            settings = EXCLUDED.settings, daily_plan = EXCLUDED.daily_plan,
                            multitask = EXCLUDED.multitask, current_task_id = EXCLUDED.current_task_id,
                            has_custom_order = EXCLUDED.has_custom_order, updated_at = EXCLUDED.updated_at,
                            seq = nextval('sync_seq')
                        WHERE user_state.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId)
                .param("settings", jsonText(s.settings()))
                .param("dailyPlan", jsonText(s.dailyPlan()))
                .param("multitask", jsonText(s.multitask()))
                .param("currentTaskId", s.currentTaskId())
                .param("hasCustomOrder", s.hasCustomOrder())
                .param("updatedAt", s.updatedAt())
                .update();
    }

    private String jsonText(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) return "{}";
        String text = json.writeValueAsString(node);
        if (text.length() > MAX_JSON_CHARS) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "State blob too large");
        }
        return text;
    }

    private static TodoDto mapTodo(ResultSet rs) throws SQLException {
        Array tagArray = rs.getArray("tags");
        List<String> tags = tagArray == null ? List.of() : List.of((String[]) tagArray.getArray());
        return new TodoDto(
                rs.getString("id"), rs.getString("title"), rs.getString("description"),
                rs.getString("importance"), rs.getString("urgency"), tags, rs.getBoolean("done"),
                rs.getDouble("sort_order"), rs.getLong("created_at"), rs.getObject("completed_at", Long.class),
                rs.getString("project_id"), rs.getString("milestone_id"),
                rs.getObject("pomodoros_for_termination", Integer.class),
                rs.getString("status"),
                rs.getLong("updated_at"), rs.getBoolean("deleted"));
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
