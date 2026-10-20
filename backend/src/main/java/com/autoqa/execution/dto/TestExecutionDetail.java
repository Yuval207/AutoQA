package com.autoqa.execution.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record TestExecutionDetail(
        UUID id,
        UUID scenarioId,
        String scenarioName,
        String featureName,
        String scenarioType,
        String status,
        String errorMessage,
        String actualResult,
        Long durationMs,
        Instant startedAt,
        Instant completedAt,
        List<StepResultDetail> steps
) {}
