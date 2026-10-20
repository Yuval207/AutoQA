package com.autoqa.execution.dto;

import java.util.List;
import java.util.UUID;

public record WorkerJob(
        UUID runId,
        UUID projectId,
        String extractedPath,
        String installCommand,
        String startupCommand,
        int port,
        String healthCheckPath,
        int startupTimeoutSeconds,
        String workingDirectory,
        String environmentVariables,
        List<TestCase> testCases,
        String artifactsPath
) {
    public record TestCase(
            UUID executionId,
            UUID scenarioId,
            String scenarioName,
            String featureName,
            String actions,
            String expectedOutcomes,
            String preconditions
    ) {}
}
