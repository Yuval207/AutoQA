package com.autoqa.execution.dto;

import java.time.Instant;
import java.util.List;

public record ExecutionResultReport(
        String status,
        Instant startedAt,
        Instant completedAt,
        Long durationMs,
        String errorMessage,
        String actualResult,
        List<StepResultReport> steps
) {}
