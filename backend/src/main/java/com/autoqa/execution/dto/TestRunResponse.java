package com.autoqa.execution.dto;

import java.time.Instant;
import java.util.UUID;

public record TestRunResponse(
        UUID id,
        UUID projectId,
        String status,
        int totalScenarios,
        int passedCount,
        int failedCount,
        int errorCount,
        int skippedCount,
        String appUrl,
        Instant startedAt,
        Instant completedAt,
        Long durationMs,
        String errorMessage,
        Instant createdAt
) {}
