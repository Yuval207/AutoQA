package com.autoqa.execution.dto;

public record DashboardStats(
        int totalProjects,
        long totalRuns,
        String latestRunStatus,
        double passRate,
        long totalPassed,
        long totalFailed
) {}
