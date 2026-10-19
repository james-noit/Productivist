package com.productivist.sync;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

/**
 * Wire shapes for sync. Field names mirror the frontend types in src/types; every synced row also
 * carries {@code updatedAt} (client edit time, epoch ms, decides last-write-wins) and {@code deleted}.
 * A tombstone ({@code deleted = true}) only needs {@code id} and {@code updatedAt}; the other fields are required
 * for live rows and enforced by {@link SyncService}.
 */
public final class SyncDtos {

    private SyncDtos() {}

    private static final String PRIORITY = "low|medium|high";
    /** A local calendar day, e.g. 2026-10-10. */
    private static final String DATE = "\\d{4}-\\d{2}-\\d{2}";

    public record ProjectDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 32) String icon,
            @Size(max = 500) String name,
            @Size(max = 5000) String description,
            @Size(max = 100_000) String notes,
            double order,
            long createdAt,
            // Optional (null for projects not imported from a Git forge and for older clients).
            @Valid SourceDto source,
            long updatedAt,
            boolean deleted) {}

    public record MilestoneDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 64) String projectId,
            @Size(max = 500) String name,
            double order,
            long createdAt,
            @Pattern(regexp = DATE) String startDate,
            @Pattern(regexp = DATE) String dueDate,
            @Valid SourceDto source,
            long updatedAt,
            boolean deleted) {}

    public record TodoDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 1000) String title,
            @Size(max = 100_000) String description,
            @Pattern(regexp = PRIORITY) String importance,
            @Pattern(regexp = PRIORITY) String urgency,
            @Size(max = 100) List<@Size(max = 100) String> tags,
            boolean done,
            double order,
            long createdAt,
            Long completedAt,
            @Size(max = 64) String projectId,
            @Size(max = 64) String milestoneId,
            Integer pomodorosForTermination,
            @Pattern(regexp = "todo|inProgress|review") String status,
            @Pattern(regexp = DATE) String startDate,
            @Pattern(regexp = DATE) String dueDate,
            // Optional (null for ordinary tasks and for clients older than recurring tasks): the series this
            // occurrence belongs to.
            @Size(max = 64) String recurrenceId,
            // Optional: where an imported issue came from (see SourceDto).
            @Valid SourceDto source,
            long updatedAt,
            boolean deleted) {}

    /**
     * Where a project, milestone or task was imported from (src/types/forge.ts {@code ExternalRef}). Every component
     * is a wrapper or reference type and nullable on the wire: the client emits only the keys that are set, and Jackson 3
     * rejects an absent primitive. {@link SyncService} requires kind, host, repoId and url when a source is present.
     * Holds no secret.
     */
    public record SourceDto(
            @Pattern(regexp = "github|gitlab|gitea") String kind,
            @Size(max = 300) String host,
            @Size(max = 64) String repoId,
            @Size(max = 300) String repoPath,
            @Min(1) Integer number,
            @Size(max = 500) String url,
            @Size(max = 40) String remoteUpdatedAt,
            @Pattern(regexp = "open|closed") String remoteState,
            // Projects only: the import options and the refresh cursor.
            @Valid SourceOptionsDto options) {}

    public record SourceOptionsDto(
            Boolean includeClosed,
            Boolean onlyAssignedToMe,
            Boolean importMilestones,
            Boolean labelsAsTags,
            Long lastSyncedAt) {}

    /**
     * A recurring task: a template (title ... pomodorosForTermination) plus a rule (every/unit/weekdays/mode and
     * the dates), mirroring src/types/recurrence.ts. Occurrences are ordinary todos carrying this row's id.
     */
    public record RecurrenceDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 1000) String title,
            @Size(max = 100_000) String description,
            @Pattern(regexp = PRIORITY) String importance,
            @Pattern(regexp = PRIORITY) String urgency,
            @Size(max = 100) List<@Size(max = 100) String> tags,
            @Size(max = 64) String projectId,
            @Size(max = 64) String milestoneId,
            Integer pomodorosForTermination,
            @Min(1) @Max(365) Integer every,
            @Pattern(regexp = "day|week|month|year") String unit,
            @Size(max = 7) List<@Min(1) @Max(7) Integer> weekdays,
            @Pattern(regexp = "schedule|afterCompletion") String mode,
            @Pattern(regexp = DATE) String startDate,
            @Pattern(regexp = DATE) String endDate,
            // A wrapper, not a primitive: the client only sends `paused` when it is true, and Jackson 3 rejects an
            // absent primitive record component (FAIL_ON_NULL_FOR_PRIMITIVES is on by default). Absent = not paused.
            Boolean paused,
            @Pattern(regexp = DATE) String lastDate,
            double order,
            long createdAt,
            long updatedAt,
            boolean deleted) {}

    /** A project outcome of the Flow view; the horizon and status values mirror src/types/flow.ts. */
    public record ObjectiveDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 64) String projectId,
            @Size(max = 1000) String title,
            @Size(max = 10_000) String description,
            @Pattern(regexp = "short|medium|long") String horizon,
            @Pattern(regexp = "active|achieved|dropped") String status,
            @Pattern(regexp = DATE) String targetDate,
            double order,
            long createdAt,
            long updatedAt,
            boolean deleted) {}

    /** "fromId contributes to toObjectiveId"; fromId is a task, milestone or objective id depending on fromKind. */
    public record FlowLinkDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 64) String projectId,
            @Pattern(regexp = "task|milestone|objective") String fromKind,
            @Size(max = 64) String fromId,
            @Size(max = 64) String toObjectiveId,
            long createdAt,
            long updatedAt,
            boolean deleted) {}

    /**
     * One project's hand-placed node positions ({@code id} is the project id): an object of
     * {@code "kind:id": {x, y}} and an array of collapsed card keys. Their shape and size are checked by
     * {@link SyncService}.
     */
    public record FlowLayoutDto(
            @NotBlank @Size(max = 64) String id,
            JsonNode positions,
            JsonNode collapsed,
            long updatedAt,
            boolean deleted) {}

    /** The per-user JSON blobs: settings, daily planner and multitask state. */
    public record StateDto(
            JsonNode settings,
            JsonNode dailyPlan,
            JsonNode multitask,
            @Size(max = 64) String currentTaskId,
            boolean hasCustomOrder,
            long updatedAt) {}

    public record PushRequest(
            @Valid List<@Valid ProjectDto> projects,
            @Valid List<@Valid MilestoneDto> milestones,
            @Valid List<@Valid TodoDto> todos,
            // The Flow lists are nullable so clients older than the Flow view keep working.
            @Valid List<@Valid ObjectiveDto> objectives,
            @Valid List<@Valid FlowLinkDto> flowLinks,
            @Valid List<@Valid FlowLayoutDto> flowLayouts,
            // Nullable as well, for clients older than recurring tasks.
            @Valid List<@Valid RecurrenceDto> recurrences,
            @Valid StateDto state) {}

    public record PushResponse(long cursor) {}

    /** Everything that changed after the requested cursor, tombstones included; {@code state} is null if unchanged. */
    public record PullResponse(
            long cursor,
            List<ProjectDto> projects,
            List<MilestoneDto> milestones,
            List<TodoDto> todos,
            List<ObjectiveDto> objectives,
            List<FlowLinkDto> flowLinks,
            List<FlowLayoutDto> flowLayouts,
            List<RecurrenceDto> recurrences,
            StateDto state) {}
}
