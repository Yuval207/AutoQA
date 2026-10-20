package com.autoqa.execution.dto;

import java.util.UUID;

public record BugFindingReport(
        UUID executionId,
        String title,
        String description,
        String severity,
        String category,
        String featureName,
        String scenarioName,
        String failedStep,
        String expectedBehaviour,
        String actualBehaviour,
        String reproductionSteps,
        String evidenceRefs,
        String consoleErrors,
        String networkErrors,
        String rootCauseHypothesis,
        String groupKey
) {}
