package com.productivist.sync;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.productivist.sync.SyncDtos.FlowLayoutDto;
import com.productivist.sync.SyncDtos.FlowLinkDto;
import com.productivist.sync.SyncDtos.MilestoneDto;
import com.productivist.sync.SyncDtos.ObjectiveDto;
import com.productivist.sync.SyncDtos.ProjectDto;
import com.productivist.sync.SyncDtos.PullResponse;
import com.productivist.sync.SyncDtos.PushRequest;
import com.productivist.sync.SyncDtos.RecurrenceDto;
import com.productivist.sync.SyncDtos.SourceDto;
import com.productivist.sync.SyncDtos.SportBlockDto;
import com.productivist.sync.SyncDtos.SportTemplateDto;
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
    /** Positions per layout; a project would need hundreds of cards to get near it. */
    private static final int MAX_LAYOUT_ENTRIES = 2000;
    private static final int MAX_LAYOUT_KEY_CHARS = 200;
    /** Sportask: steps and results per block, slots per template, and the text size of each JSON column. */
    private static final int MAX_SPORT_ELEMENTS = 120;
    private static final int MAX_SPORT_SLOTS = 40;
    private static final int MAX_SPORT_JSON_CHARS = 32_000;

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
        List<ObjectiveDto> objectives = orEmpty(request.objectives());
        List<FlowLinkDto> flowLinks = orEmpty(request.flowLinks());
        List<FlowLayoutDto> flowLayouts = orEmpty(request.flowLayouts());
        List<RecurrenceDto> recurrences = orEmpty(request.recurrences());
        List<SportBlockDto> sportBlocks = orEmpty(request.sportBlocks());
        List<SportTemplateDto> sportTemplates = orEmpty(request.sportTemplates());
        int rows = projects.size() + milestones.size() + todos.size()
                + objectives.size() + flowLinks.size() + flowLayouts.size() + recurrences.size()
                + sportBlocks.size() + sportTemplates.size();
        if (rows > maxBatchSize) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Batch exceeds " + maxBatchSize + " rows");
        }
        projects.forEach(p -> upsertProject(userId, p));
        milestones.forEach(m -> upsertMilestone(userId, m));
        todos.forEach(t -> upsertTodo(userId, t));
        objectives.forEach(o -> upsertObjective(userId, o));
        flowLinks.forEach(l -> upsertFlowLink(userId, l));
        flowLayouts.forEach(l -> upsertFlowLayout(userId, l));
        recurrences.forEach(r -> upsertRecurrence(userId, r));
        sportBlocks.forEach(b -> upsertSportBlock(userId, b));
        sportTemplates.forEach(t -> upsertSportTemplate(userId, t));
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
                        SELECT id, icon, name, description, notes, sort_order, created_at, source::text AS source, updated_at, deleted
                        FROM projects WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new ProjectDto(
                        rs.getString("id"), rs.getString("icon"), rs.getString("name"), rs.getString("description"),
                        rs.getString("notes"), rs.getDouble("sort_order"), rs.getLong("created_at"),
                        readSource(rs.getString("source")), rs.getLong("updated_at"), rs.getBoolean("deleted")))
                .list();
        List<MilestoneDto> milestones = jdbc.sql("""
                        SELECT id, project_id, name, sort_order, created_at, start_date, due_date, source::text AS source,
                               updated_at, deleted
                        FROM milestones WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new MilestoneDto(
                        rs.getString("id"), rs.getString("project_id"), rs.getString("name"),
                        rs.getDouble("sort_order"), rs.getLong("created_at"),
                        rs.getString("start_date"), rs.getString("due_date"), readSource(rs.getString("source")),
                        rs.getLong("updated_at"), rs.getBoolean("deleted")))
                .list();
        List<TodoDto> todos = jdbc.sql("""
                        SELECT id, title, description, importance, urgency, tags, done, sort_order, created_at,
                               completed_at, project_id, milestone_id, pomodoros_for_termination, status, start_date, due_date,
                               recurrence_id, source::text AS source, updated_at, deleted
                        FROM todos WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> mapTodo(rs))
                .list();
        List<ObjectiveDto> objectives = jdbc.sql("""
                        SELECT id, project_id, title, description, horizon, status, target_date, sort_order,
                               created_at, updated_at, deleted
                        FROM objectives WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new ObjectiveDto(
                        rs.getString("id"), rs.getString("project_id"), rs.getString("title"),
                        rs.getString("description"), rs.getString("horizon"), rs.getString("status"),
                        rs.getString("target_date"), rs.getDouble("sort_order"), rs.getLong("created_at"),
                        rs.getLong("updated_at"), rs.getBoolean("deleted")))
                .list();
        List<FlowLinkDto> flowLinks = jdbc.sql("""
                        SELECT id, project_id, from_kind, from_id, to_objective_id, created_at, updated_at, deleted
                        FROM flow_links WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new FlowLinkDto(
                        rs.getString("id"), rs.getString("project_id"), rs.getString("from_kind"),
                        rs.getString("from_id"), rs.getString("to_objective_id"), rs.getLong("created_at"),
                        rs.getLong("updated_at"), rs.getBoolean("deleted")))
                .list();
        List<FlowLayoutDto> flowLayouts = jdbc.sql("""
                        SELECT id, positions::text AS positions, collapsed::text AS collapsed, updated_at, deleted
                        FROM flow_layouts WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new FlowLayoutDto(
                        rs.getString("id"), json.readTree(rs.getString("positions")),
                        json.readTree(rs.getString("collapsed")), rs.getLong("updated_at"), rs.getBoolean("deleted")))
                .list();
        List<RecurrenceDto> recurrences = jdbc.sql("""
                        SELECT id, title, description, importance, urgency, tags, project_id, milestone_id,
                               pomodoros_for_termination, every, unit, weekdays::text AS weekdays, mode, start_date,
                               end_date, paused, last_date, sort_order, created_at, updated_at, deleted
                        FROM recurrences WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> mapRecurrence(rs))
                .list();
        List<SportBlockDto> sportBlocks = jdbc.sql("""
                        SELECT id, started_at, date, origin, goal_id, program_id, program_week, template_id, kind,
                               assessment_id, block_seconds, prep_seconds, steps::text AS steps, results::text AS results,
                               status, rpe, feedback, catalog_version, created_at, updated_at, deleted
                        FROM sport_blocks WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> mapSportBlock(rs))
                .list();
        List<SportTemplateDto> sportTemplates = jdbc.sql("""
                        SELECT id, name, slots::text AS slots, format, work_seconds, rest_seconds, min_seconds, sort_order,
                               created_at, updated_at, deleted
                        FROM sport_templates WHERE user_id = :u AND seq > :since AND seq <= :cursor ORDER BY seq
                        """)
                .param("u", userId).param("since", since).param("cursor", cursor)
                .query((rs, i) -> new SportTemplateDto(
                        rs.getString("id"), rs.getString("name"), json.readTree(rs.getString("slots")),
                        rs.getString("format"), rs.getObject("work_seconds", Integer.class),
                        rs.getObject("rest_seconds", Integer.class), rs.getObject("min_seconds", Integer.class),
                        rs.getDouble("sort_order"), rs.getLong("created_at"), rs.getLong("updated_at"),
                        rs.getBoolean("deleted")))
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
        return new PullResponse(cursor, projects, milestones, todos, objectives, flowLinks, flowLayouts, recurrences,
                sportBlocks, sportTemplates, state);
    }

    private long currentCursor(long userId) {
        return jdbc.sql("""
                        SELECT GREATEST(
                            (SELECT COALESCE(MAX(seq), 0) FROM projects   WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM milestones WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM todos      WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM objectives WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM flow_links WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM flow_layouts WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM recurrences WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM sport_blocks WHERE user_id = :u),
                            (SELECT COALESCE(MAX(seq), 0) FROM sport_templates WHERE user_id = :u),
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
                        INSERT INTO projects (user_id, id, icon, name, description, notes, sort_order, created_at, source, updated_at, deleted)
                        VALUES (:u, :id, :icon, :name, :description, :notes, :order, :createdAt, CAST(:source AS jsonb),
                                :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            icon = EXCLUDED.icon, name = EXCLUDED.name, description = EXCLUDED.description,
                            notes = EXCLUDED.notes, sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at,
                            source = EXCLUDED.source, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE projects.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId).param("id", p.id())
                .param("icon", nullToEmpty(p.icon())).param("name", p.name())
                .param("description", nullToEmpty(p.description())).param("notes", nullToEmpty(p.notes()))
                .param("order", p.order()).param("createdAt", p.createdAt())
                .param("source", sourceJson(p.source()))
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
                        INSERT INTO milestones (user_id, id, project_id, name, sort_order, created_at,
                                                start_date, due_date, source, updated_at, deleted)
                        VALUES (:u, :id, :projectId, :name, :order, :createdAt, :startDate, :dueDate,
                                CAST(:source AS jsonb), :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            project_id = EXCLUDED.project_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
                            created_at = EXCLUDED.created_at, start_date = EXCLUDED.start_date,
                            due_date = EXCLUDED.due_date, source = EXCLUDED.source,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE milestones.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId).param("id", m.id()).param("projectId", m.projectId()).param("name", m.name())
                .param("order", m.order()).param("createdAt", m.createdAt())
                .param("startDate", m.startDate()).param("dueDate", m.dueDate())
                .param("source", sourceJson(m.source()))
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
                                           status, start_date, due_date, recurrence_id, source, updated_at, deleted)
                        VALUES (:u, :id, :title, :description, :importance, :urgency,
                                ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb))), :done, :order,
                                :createdAt, :completedAt, :projectId, :milestoneId, :pomodoros, :status, :startDate, :dueDate,
                                :recurrenceId, CAST(:source AS jsonb), :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            title = EXCLUDED.title, description = EXCLUDED.description, importance = EXCLUDED.importance,
                            urgency = EXCLUDED.urgency, tags = EXCLUDED.tags, done = EXCLUDED.done,
                            sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at,
                            completed_at = EXCLUDED.completed_at, project_id = EXCLUDED.project_id,
                            milestone_id = EXCLUDED.milestone_id,
                            pomodoros_for_termination = EXCLUDED.pomodoros_for_termination,
                            status = EXCLUDED.status, start_date = EXCLUDED.start_date, due_date = EXCLUDED.due_date,
                            recurrence_id = EXCLUDED.recurrence_id, source = EXCLUDED.source,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE todos.updated_at <= EXCLUDED.updated_at
                        """)
                .params(todoParams(userId, t, tags))
                .update();
    }

    private void upsertObjective(long userId, ObjectiveDto o) {
        if (o.deleted()) {
            tombstone("objectives", "project_id, title, horizon, status, created_at", "'', '', 'short', 'active', 0",
                    userId, o.id(), o.updatedAt());
            return;
        }
        requireText(o.projectId(), "objective projectId");
        requireText(o.title(), "objective title");
        requireText(o.horizon(), "objective horizon");
        requireText(o.status(), "objective status");
        jdbc.sql("""
                        INSERT INTO objectives (user_id, id, project_id, title, description, horizon, status, target_date,
                                                sort_order, created_at, updated_at, deleted)
                        VALUES (:u, :id, :projectId, :title, :description, :horizon, :status, :targetDate,
                                :order, :createdAt, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            project_id = EXCLUDED.project_id, title = EXCLUDED.title, description = EXCLUDED.description,
                            horizon = EXCLUDED.horizon, status = EXCLUDED.status, target_date = EXCLUDED.target_date,
                            sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE objectives.updated_at <= EXCLUDED.updated_at
                        """)
                .params(objectiveParams(userId, o))
                .update();
    }

    private void upsertFlowLink(long userId, FlowLinkDto l) {
        if (l.deleted()) {
            tombstone("flow_links", "project_id, from_kind, from_id, to_objective_id, created_at",
                    "'', 'task', '', '', 0", userId, l.id(), l.updatedAt());
            return;
        }
        requireText(l.projectId(), "link projectId");
        requireText(l.fromKind(), "link fromKind");
        requireText(l.fromId(), "link fromId");
        requireText(l.toObjectiveId(), "link toObjectiveId");
        jdbc.sql("""
                        INSERT INTO flow_links (user_id, id, project_id, from_kind, from_id, to_objective_id,
                                                created_at, updated_at, deleted)
                        VALUES (:u, :id, :projectId, :fromKind, :fromId, :toObjectiveId, :createdAt, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            project_id = EXCLUDED.project_id, from_kind = EXCLUDED.from_kind, from_id = EXCLUDED.from_id,
                            to_objective_id = EXCLUDED.to_objective_id, created_at = EXCLUDED.created_at,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE flow_links.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId).param("id", l.id()).param("projectId", l.projectId())
                .param("fromKind", l.fromKind()).param("fromId", l.fromId()).param("toObjectiveId", l.toObjectiveId())
                .param("createdAt", l.createdAt()).param("updatedAt", l.updatedAt()).param("deleted", l.deleted())
                .update();
    }

    private void upsertFlowLayout(long userId, FlowLayoutDto l) {
        if (l.deleted()) {
            tombstone("flow_layouts", "positions, collapsed", "'{}', '[]'", userId, l.id(), l.updatedAt());
            return;
        }
        String positions = layoutJson(l.positions(), true);
        String collapsed = layoutJson(l.collapsed(), false);
        jdbc.sql("""
                        INSERT INTO flow_layouts (user_id, id, positions, collapsed, updated_at, deleted)
                        VALUES (:u, :id, CAST(:positions AS jsonb), CAST(:collapsed AS jsonb), :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            positions = EXCLUDED.positions, collapsed = EXCLUDED.collapsed,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE flow_layouts.updated_at <= EXCLUDED.updated_at
                        """)
                .param("u", userId).param("id", l.id()).param("positions", positions).param("collapsed", collapsed)
                .param("updatedAt", l.updatedAt()).param("deleted", l.deleted())
                .update();
    }

    private void upsertRecurrence(long userId, RecurrenceDto r) {
        if (r.deleted()) {
            tombstone("recurrences", "title, importance, urgency, every, unit, mode, start_date, created_at",
                    "'', 'medium', 'medium', 1, 'day', 'schedule', '1970-01-01', 0", userId, r.id(), r.updatedAt());
            return;
        }
        requireText(r.title(), "recurrence title");
        requireText(r.unit(), "recurrence unit");
        requireText(r.mode(), "recurrence mode");
        requireText(r.startDate(), "recurrence startDate");
        if (r.every() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing recurrence every");
        // Only a weekly series has weekdays; an empty list means none.
        List<Integer> days = r.weekdays() == null || r.weekdays().isEmpty() || !"week".equals(r.unit()) ? null : r.weekdays();
        Map<String, Object> m = new HashMap<>();
        m.put("u", userId);
        m.put("id", r.id());
        m.put("title", r.title());
        m.put("description", r.description());
        m.put("importance", r.importance() == null ? "medium" : r.importance());
        m.put("urgency", r.urgency() == null ? "medium" : r.urgency());
        m.put("tags", json.writeValueAsString(r.tags() == null ? List.of() : r.tags()));
        m.put("projectId", r.projectId());
        m.put("milestoneId", r.milestoneId());
        m.put("pomodoros", r.pomodorosForTermination());
        m.put("every", r.every());
        m.put("unit", r.unit());
        m.put("weekdays", days == null ? null : json.writeValueAsString(days));
        m.put("mode", r.mode());
        m.put("startDate", r.startDate());
        m.put("endDate", r.endDate());
        m.put("paused", Boolean.TRUE.equals(r.paused()));
        m.put("lastDate", r.lastDate());
        m.put("order", r.order());
        m.put("createdAt", r.createdAt());
        m.put("updatedAt", r.updatedAt());
        m.put("deleted", r.deleted());
        jdbc.sql("""
                        INSERT INTO recurrences (user_id, id, title, description, importance, urgency, tags, project_id,
                                                 milestone_id, pomodoros_for_termination, every, unit, weekdays, mode,
                                                 start_date, end_date, paused, last_date, sort_order, created_at,
                                                 updated_at, deleted)
                        VALUES (:u, :id, :title, :description, :importance, :urgency,
                                ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb))), :projectId,
                                :milestoneId, :pomodoros, :every, :unit, CAST(:weekdays AS jsonb), :mode,
                                :startDate, :endDate, :paused, :lastDate, :order, :createdAt, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            title = EXCLUDED.title, description = EXCLUDED.description,
                            importance = EXCLUDED.importance, urgency = EXCLUDED.urgency, tags = EXCLUDED.tags,
                            project_id = EXCLUDED.project_id, milestone_id = EXCLUDED.milestone_id,
                            pomodoros_for_termination = EXCLUDED.pomodoros_for_termination,
                            every = EXCLUDED.every, unit = EXCLUDED.unit, weekdays = EXCLUDED.weekdays,
                            mode = EXCLUDED.mode, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
                            paused = EXCLUDED.paused, last_date = EXCLUDED.last_date,
                            sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at,
                            updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE recurrences.updated_at <= EXCLUDED.updated_at
                        """)
                .params(m)
                .update();
    }

    private void upsertSportBlock(long userId, SportBlockDto b) {
        if (b.deleted()) {
            tombstone("sport_blocks",
                    "started_at, date, origin, kind, block_seconds, prep_seconds, steps, results, status, catalog_version, created_at",
                    "0, '1970-01-01', 'free', 'train', 1, 0, '[]', '[]', 'skipped', 0, 0", userId, b.id(), b.updatedAt());
            return;
        }
        requireText(b.date(), "block date");
        requireText(b.origin(), "block origin");
        requireText(b.kind(), "block kind");
        requireText(b.status(), "block status");
        if (b.startedAt() == null || b.blockSeconds() == null || b.prepSeconds() == null || b.catalogVersion() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing block startedAt, blockSeconds, prepSeconds or catalogVersion");
        }
        String steps = sportJson(b.steps(), "steps", 0, MAX_SPORT_ELEMENTS, SyncService::checkSportStep);
        String results = sportJson(b.results(), "results", 0, MAX_SPORT_ELEMENTS, SyncService::checkSportResult);
        Map<String, Object> m = new HashMap<>();
        m.put("u", userId);
        m.put("id", b.id());
        m.put("startedAt", b.startedAt());
        m.put("date", b.date());
        m.put("origin", b.origin());
        m.put("goalId", b.goalId());
        m.put("programId", b.programId());
        m.put("programWeek", b.programWeek());
        m.put("templateId", b.templateId());
        m.put("kind", b.kind());
        m.put("assessmentId", b.assessmentId());
        m.put("blockSeconds", b.blockSeconds());
        m.put("prepSeconds", b.prepSeconds());
        m.put("steps", steps);
        m.put("results", results);
        m.put("status", b.status());
        m.put("rpe", b.rpe());
        m.put("feedback", b.feedback());
        m.put("catalogVersion", b.catalogVersion());
        m.put("createdAt", b.createdAt());
        m.put("updatedAt", b.updatedAt());
        m.put("deleted", b.deleted());
        jdbc.sql("""
                        INSERT INTO sport_blocks (user_id, id, started_at, date, origin, goal_id, program_id, program_week,
                                                  template_id, kind, assessment_id, block_seconds, prep_seconds, steps, results,
                                                  status, rpe, feedback, catalog_version, created_at, updated_at, deleted)
                        VALUES (:u, :id, :startedAt, :date, :origin, :goalId, :programId, :programWeek,
                                :templateId, :kind, :assessmentId, :blockSeconds, :prepSeconds, CAST(:steps AS jsonb),
                                CAST(:results AS jsonb), :status, :rpe, :feedback, :catalogVersion, :createdAt,
                                :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            started_at = EXCLUDED.started_at, date = EXCLUDED.date, origin = EXCLUDED.origin,
                            goal_id = EXCLUDED.goal_id, program_id = EXCLUDED.program_id,
                            program_week = EXCLUDED.program_week, template_id = EXCLUDED.template_id,
                            kind = EXCLUDED.kind, assessment_id = EXCLUDED.assessment_id,
                            block_seconds = EXCLUDED.block_seconds, prep_seconds = EXCLUDED.prep_seconds,
                            steps = EXCLUDED.steps, results = EXCLUDED.results, status = EXCLUDED.status,
                            rpe = EXCLUDED.rpe, feedback = EXCLUDED.feedback, catalog_version = EXCLUDED.catalog_version,
                            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
                            deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE sport_blocks.updated_at <= EXCLUDED.updated_at
                        """)
                .params(m)
                .update();
    }

    private void upsertSportTemplate(long userId, SportTemplateDto t) {
        if (t.deleted()) {
            tombstone("sport_templates", "name, slots, format, created_at", "'-', '[{\"pattern\":\"core\"}]', 'sequence', 0",
                    userId, t.id(), t.updatedAt());
            return;
        }
        requireText(t.name(), "template name");
        requireText(t.format(), "template format");
        String slots = sportJson(t.slots(), "slots", 1, MAX_SPORT_SLOTS, SyncService::checkSportSlot);
        Map<String, Object> m = new HashMap<>();
        m.put("u", userId);
        m.put("id", t.id());
        m.put("name", t.name());
        m.put("slots", slots);
        m.put("format", t.format());
        m.put("workSeconds", t.workSeconds());
        m.put("restSeconds", t.restSeconds());
        m.put("minSeconds", t.minSeconds());
        m.put("order", t.order());
        m.put("createdAt", t.createdAt());
        m.put("updatedAt", t.updatedAt());
        m.put("deleted", t.deleted());
        jdbc.sql("""
                        INSERT INTO sport_templates (user_id, id, name, slots, format, work_seconds, rest_seconds, min_seconds,
                                                     sort_order, created_at, updated_at, deleted)
                        VALUES (:u, :id, :name, CAST(:slots AS jsonb), :format, :workSeconds, :restSeconds, :minSeconds,
                                :order, :createdAt, :updatedAt, :deleted)
                        ON CONFLICT (user_id, id) DO UPDATE SET
                            name = EXCLUDED.name, slots = EXCLUDED.slots, format = EXCLUDED.format,
                            work_seconds = EXCLUDED.work_seconds, rest_seconds = EXCLUDED.rest_seconds,
                            min_seconds = EXCLUDED.min_seconds, sort_order = EXCLUDED.sort_order,
                            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
                            deleted = EXCLUDED.deleted, seq = nextval('sync_seq')
                        WHERE sport_templates.updated_at <= EXCLUDED.updated_at
                        """)
                .params(m)
                .update();
    }

    /**
     * Validates one Sportask JSON column and returns it as JSON text: an array of {@code min..max} elements, each passing
     * {@code element}, at most {@value #MAX_SPORT_JSON_CHARS} characters. Absent or null is refused (the column is NOT NULL).
     */
    private String sportJson(JsonNode node, String what, int min, int max, Consumer<JsonNode> element) {
        if (node == null || !node.isArray() || node.size() < min || node.size() > max) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + what);
        }
        node.forEach(element);
        String text = json.writeValueAsString(node);
        if (text.length() > MAX_SPORT_JSON_CHARS) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, what + " too large");
        }
        return text;
    }

    /** A step needs an exerciseId, work and rest seconds; target, side, loadKg and round are checked when present. */
    private static void checkSportStep(JsonNode s) {
        boolean valid = s.isObject()
                && isShortText(s.get("exerciseId"))
                && isInt(s.get("workSeconds"), 0, 3600)
                && isInt(s.get("restSeconds"), 0, 3600)
                && (isAbsent(s.get("side")) || isOneOf(s.get("side"), "left", "right"))
                && (isAbsent(s.get("loadKg")) || isNum(s.get("loadKg"), 0, 500))
                && (isAbsent(s.get("round")) || isInt(s.get("round"), 1, 100))
                && (isAbsent(s.get("target")) || isDose(s.get("target")));
        if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid step");
    }

    /** A result needs a stepIndex and a boolean done; value and loadKg are checked when present. */
    private static void checkSportResult(JsonNode r) {
        boolean valid = r.isObject()
                && isInt(r.get("stepIndex"), 0, MAX_SPORT_ELEMENTS - 1)
                && r.get("done") != null && r.get("done").isBoolean()
                && (isAbsent(r.get("value")) || isNum(r.get("value"), -1000, 100_000))
                && (isAbsent(r.get("loadKg")) || isNum(r.get("loadKg"), 0, 500));
        if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid result");
    }

    /** A slot names an exercise or a movement pattern; its other keys are checked when present. */
    private static void checkSportSlot(JsonNode s) {
        boolean named = s.isObject() && (isShortText(s.get("exerciseId")) || isShortText(s.get("pattern")));
        boolean valid = named
                && (isAbsent(s.get("exerciseId")) || isShortText(s.get("exerciseId")))
                && (isAbsent(s.get("pattern")) || isShortText(s.get("pattern")))
                && (isAbsent(s.get("tag")) || isShortText(s.get("tag")))
                && (isAbsent(s.get("zone")) || isShortText(s.get("zone")))
                && (isAbsent(s.get("maxLevel")) || isInt(s.get("maxLevel"), 1, 5))
                && (isAbsent(s.get("dose")) || isDose(s.get("dose")));
        if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slot");
    }

    private static boolean isAbsent(JsonNode n) {
        return n == null || n.isNull();
    }

    private static boolean isShortText(JsonNode n) {
        return n != null && n.isString() && !n.asString().isBlank() && n.asString().length() <= 64;
    }

    private static boolean isOneOf(JsonNode n, String... allowed) {
        return n.isString() && List.of(allowed).contains(n.asString());
    }

    private static boolean isInt(JsonNode n, long min, long max) {
        return n != null && n.isIntegralNumber() && n.canConvertToLong() && n.longValue() >= min && n.longValue() <= max;
    }

    private static boolean isNum(JsonNode n, double min, double max) {
        return n != null && n.isNumber() && n.doubleValue() >= min && n.doubleValue() <= max;
    }

    /** A dose of reps and/or seconds, each within its range. */
    private static boolean isDose(JsonNode d) {
        return d.isObject()
                && (isAbsent(d.get("reps")) || isInt(d.get("reps"), 1, 1000))
                && (isAbsent(d.get("seconds")) || isInt(d.get("seconds"), 1, 3600));
    }

    /**
     * Validates one layout column and returns it as JSON text: positions must be an object of at most
     * {@value #MAX_LAYOUT_ENTRIES} {@code {x, y}} numeric pairs, collapsed an array of that many short strings.
     * Absent or null means empty.
     */
    private String layoutJson(JsonNode node, boolean positions) {
        if (node == null || node.isNull() || node.isMissingNode()) return positions ? "{}" : "[]";
        if (positions ? !node.isObject() : !node.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid layout " + (positions ? "positions" : "collapsed"));
        }
        if (node.size() > MAX_LAYOUT_ENTRIES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Layout too large");
        }
        if (positions) {
            node.properties().forEach(entry -> {
                JsonNode p = entry.getValue();
                boolean valid = entry.getKey().length() <= MAX_LAYOUT_KEY_CHARS && p.isObject()
                        && p.path("x").isNumber() && p.path("y").isNumber();
                if (!valid) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid layout position");
            });
        } else {
            node.forEach(key -> {
                if (!key.isString() || key.asString().length() > MAX_LAYOUT_KEY_CHARS) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid collapsed key");
                }
            });
        }
        return jsonText(node);
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

    private static Map<String, Object> objectiveParams(long userId, ObjectiveDto o) {
        Map<String, Object> m = new HashMap<>();
        m.put("u", userId);
        m.put("id", o.id());
        m.put("projectId", o.projectId());
        m.put("title", o.title());
        m.put("description", o.description());
        m.put("horizon", o.horizon());
        m.put("status", o.status());
        m.put("targetDate", o.targetDate());
        m.put("order", o.order());
        m.put("createdAt", o.createdAt());
        m.put("updatedAt", o.updatedAt());
        m.put("deleted", o.deleted());
        return m;
    }

    private Map<String, Object> todoParams(long userId, TodoDto t, String tagsJson) {
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
        m.put("startDate", t.startDate());
        m.put("dueDate", t.dueDate());
        m.put("recurrenceId", t.recurrenceId());
        m.put("source", sourceJson(t.source()));
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

    private TodoDto mapTodo(ResultSet rs) throws SQLException {
        Array tagArray = rs.getArray("tags");
        List<String> tags = tagArray == null ? List.of() : List.of((String[]) tagArray.getArray());
        return new TodoDto(
                rs.getString("id"), rs.getString("title"), rs.getString("description"),
                rs.getString("importance"), rs.getString("urgency"), tags, rs.getBoolean("done"),
                rs.getDouble("sort_order"), rs.getLong("created_at"), rs.getObject("completed_at", Long.class),
                rs.getString("project_id"), rs.getString("milestone_id"),
                rs.getObject("pomodoros_for_termination", Integer.class),
                rs.getString("status"), rs.getString("start_date"), rs.getString("due_date"),
                rs.getString("recurrence_id"), readSource(rs.getString("source")), rs.getLong("updated_at"),
                rs.getBoolean("deleted"));
    }

    private RecurrenceDto mapRecurrence(ResultSet rs) throws SQLException {
        Array tagArray = rs.getArray("tags");
        List<String> tags = tagArray == null ? List.of() : List.of((String[]) tagArray.getArray());
        String weekdaysJson = rs.getString("weekdays");
        List<Integer> weekdays = null;
        if (weekdaysJson != null) {
            weekdays = new ArrayList<>();
            for (JsonNode day : json.readTree(weekdaysJson)) weekdays.add(day.asInt());
        }
        return new RecurrenceDto(
                rs.getString("id"), rs.getString("title"), rs.getString("description"),
                rs.getString("importance"), rs.getString("urgency"), tags,
                rs.getString("project_id"), rs.getString("milestone_id"),
                rs.getObject("pomodoros_for_termination", Integer.class),
                rs.getInt("every"), rs.getString("unit"), weekdays, rs.getString("mode"),
                rs.getString("start_date"), rs.getString("end_date"), rs.getBoolean("paused"),
                rs.getString("last_date"), rs.getDouble("sort_order"), rs.getLong("created_at"),
                rs.getLong("updated_at"), rs.getBoolean("deleted"));
    }

    private SportBlockDto mapSportBlock(ResultSet rs) throws SQLException {
        return new SportBlockDto(
                rs.getString("id"), rs.getLong("started_at"), rs.getString("date"), rs.getString("origin"),
                rs.getString("goal_id"), rs.getString("program_id"), rs.getObject("program_week", Integer.class),
                rs.getString("template_id"), rs.getString("kind"), rs.getString("assessment_id"),
                rs.getInt("block_seconds"), rs.getInt("prep_seconds"), json.readTree(rs.getString("steps")),
                json.readTree(rs.getString("results")), rs.getString("status"), rs.getObject("rpe", Integer.class),
                rs.getString("feedback"), rs.getInt("catalog_version"), rs.getLong("created_at"),
                rs.getLong("updated_at"), rs.getBoolean("deleted"));
    }

    /** The source as JSON text for the JSONB column, or null; a present source must say where it points. */
    private String sourceJson(SourceDto source) {
        if (source == null) return null;
        requireText(source.kind(), "source kind");
        requireText(source.host(), "source host");
        requireText(source.repoId(), "source repoId");
        requireText(source.url(), "source url");
        return json.writeValueAsString(source);
    }

    private SourceDto readSource(String text) {
        return text == null ? null : json.readValue(text, SourceDto.class);
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}
