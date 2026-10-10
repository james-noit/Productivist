package com.productivist.sync;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

/**
 * Wire shapes for sync. Field names mirror the frontend types in src/types; every synced row also
 * carries {@code updatedAt} (client edit time, epoch ms, decides last-write-wins) and {@code deleted}.
 */
public final class SyncDtos {

    private SyncDtos() {}

    private static final String PRIORITY = "low|medium|high";

    public record ProjectDto(
            @NotBlank @Size(max = 64) String id,
            @Size(max = 32) String icon,
            @NotBlank @Size(max = 500) String name,
            @Size(max = 5000) String description,
            @Size(max = 100_000) String notes,
            double order,
            long createdAt,
            long updatedAt,
            boolean deleted) {}

    public record MilestoneDto(
            @NotBlank @Size(max = 64) String id,
            @NotBlank @Size(max = 64) String projectId,
            @NotBlank @Size(max = 500) String name,
            double order,
            long createdAt,
            long updatedAt,
            boolean deleted) {}

    public record TodoDto(
            @NotBlank @Size(max = 64) String id,
            @NotBlank @Size(max = 1000) String title,
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
            @Valid StateDto state) {}

    public record PushResponse(long cursor) {}

    /** Everything that changed after the requested cursor, tombstones included; {@code state} is null if unchanged. */
    public record PullResponse(
            long cursor,
            List<ProjectDto> projects,
            List<MilestoneDto> milestones,
            List<TodoDto> todos,
            StateDto state) {}
}
