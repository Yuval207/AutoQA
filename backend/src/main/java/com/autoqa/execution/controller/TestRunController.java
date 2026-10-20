package com.autoqa.execution.controller;

import com.autoqa.auth.entity.User;
import com.autoqa.execution.dto.*;
import com.autoqa.execution.service.TestRunService;
import com.autoqa.project.service.ProjectService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class TestRunController {

    private final TestRunService testRunService;
    private final ProjectService projectService;

    public TestRunController(TestRunService testRunService, ProjectService projectService) {
        this.testRunService = testRunService;
        this.projectService = projectService;
    }

    @PostMapping("/projects/{projectId}/runs")
    public ResponseEntity<TestRunResponse> createTestRun(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(testRunService.createTestRun(projectId, user.getId()));
    }

    @GetMapping("/projects/{projectId}/runs")
    public ResponseEntity<List<TestRunResponse>> getTestRuns(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal User user) {
        projectService.verifyOwnership(projectId, user.getId());
        return ResponseEntity.ok(testRunService.getTestRuns(projectId));
    }

    @GetMapping({"/dashboard/stats", "/runs/stats"})
    public ResponseEntity<DashboardStats> getDashboardStats(@AuthenticationPrincipal User user) {
        return ResponseEntity.ok(testRunService.getDashboardStats(user.getId()));
    }

    @GetMapping("/runs/{runId}")
    public ResponseEntity<TestRunDetailResponse> getTestRunDetail(@PathVariable UUID runId) {
        return ResponseEntity.ok(testRunService.getTestRunDetail(runId));
    }

    @GetMapping("/runs/{runId}/detail")
    public ResponseEntity<TestRunDetailResponse> getTestRunDetailExplicit(@PathVariable UUID runId) {
        return ResponseEntity.ok(testRunService.getTestRunDetail(runId));
    }

    @GetMapping(value = "/runs/{runId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribeToRun(@PathVariable UUID runId) {
        return testRunService.subscribe(runId);
    }
}
