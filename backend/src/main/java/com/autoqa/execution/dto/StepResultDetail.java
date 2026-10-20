package com.autoqa.execution.dto;

import java.util.UUID;

public record StepResultDetail(
        UUID id,
        int stepIndex,
        String actionType,
        String actionTarget,
        String actionValue,
        String status,
        String expectedValue,
        String actualValue,
        String errorMessage,
        String screenshotPath,
        String consoleLogs,
        String networkErrors,
        Long durationMs
) {}
