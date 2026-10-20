package com.autoqa.execution.controller;

import com.autoqa.execution.dto.*;
import com.autoqa.execution.service.TestRunService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Internal API endpoints used by the Playwright worker process.
 * These endpoints are not behind JWT authentication (see SecurityConfig).
 */
@RestController
@RequestMapping("/api/worker")
public class WorkerApiController {

    private final TestRunService testRunService;

    public WorkerApiController(TestRunService testRunService) {
        this.testRunService = testRunService;
    }

    @GetMapping("/poll")
    public ResponseEntity<?> pollForJob() {
        Optional<WorkerJob> job = testRunService.pollForJob();
        return job.map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @PostMapping("/runs/{runId}/status")
    public ResponseEntity<Void> updateRunStatus(
            @PathVariable UUID runId,
            @RequestBody Map<String, String> body) {
        testRunService.updateRunStatus(
                runId,
                body.get("status"),
                body.get("errorMessage"),
                body.get("startupLog")
        );
        return ResponseEntity.ok().build();
    }

    @PostMapping("/runs/{runId}/app-url")
    public ResponseEntity<Void> updateAppUrl(
            @PathVariable UUID runId,
            @RequestBody Map<String, String> body) {
        testRunService.updateAppUrl(runId, body.get("appUrl"));
        return ResponseEntity.ok().build();
    }

    @PostMapping("/executions/{executionId}/result")
    public ResponseEntity<Void> reportExecutionResult(
            @PathVariable UUID executionId,
            @RequestBody ExecutionResultReport report) {
        testRunService.reportExecutionResult(executionId, report);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/runs/{runId}/findings")
    public ResponseEntity<Void> reportBugFinding(
            @PathVariable UUID runId,
            @RequestBody BugFindingReport report) {
        testRunService.reportBugFinding(runId, report);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/runs/{runId}/finalize")
    public ResponseEntity<Void> finalizeRun(@PathVariable UUID runId) {
        testRunService.finalizeRun(runId);
        return ResponseEntity.ok().build();
    }
}
