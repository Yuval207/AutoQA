package com.autoqa.project.dto;

public record UpdateEnvironmentRequest(
        String startupCommand,
        String installCommand,
        Integer port,
        String healthCheckPath,
        String environmentVariables,
        String workingDirectory,
        Integer startupTimeoutSeconds
) {}
