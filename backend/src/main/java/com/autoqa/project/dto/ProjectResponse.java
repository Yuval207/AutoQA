package com.autoqa.project.dto;

import java.time.Instant;
import java.util.UUID;

public record ProjectResponse(
        UUID id,
        String name,
        String description,
        String projectType,
        String status,
        RepositoryInfo repository,
        EnvironmentInfo environment,
        Instant createdAt,
        Instant updatedAt
) {
    public record RepositoryInfo(
            UUID id,
            String sourceType,
            String originalFilename,
            String status,
            String analysisResult
    ) {}

    public record EnvironmentInfo(
            UUID id,
            String startupCommand,
            String installCommand,
            Integer port,
            String healthCheckPath,
            Integer startupTimeoutSeconds
    ) {}
}
