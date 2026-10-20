package com.autoqa.execution.service;

import com.autoqa.auth.entity.User;
import com.autoqa.common.exception.BadRequestException;
import com.autoqa.common.exception.ResourceNotFoundException;
import com.autoqa.execution.dto.*;
import com.autoqa.execution.entity.*;
import com.autoqa.execution.repository.*;
import com.autoqa.feature.entity.Feature;
import com.autoqa.feature.repository.FeatureRepository;
import com.autoqa.finding.entity.BugFinding;
import com.autoqa.finding.repository.BugFindingRepository;
import com.autoqa.project.entity.EnvironmentConfiguration;
import com.autoqa.project.entity.Project;
import com.autoqa.project.entity.RepositorySource;
import com.autoqa.project.repository.EnvironmentConfigRepository;
import com.autoqa.project.repository.RepositorySourceRepository;
import com.autoqa.project.service.ProjectService;
import com.autoqa.testplan.entity.TestScenario;
import com.autoqa.testplan.repository.TestScenarioRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class TestRunService {

    private static final Logger log = LoggerFactory.getLogger(TestRunService.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private final TestRunRepository testRunRepository;
    private final TestExecutionRepository executionRepository;
    private final TestStepResultRepository stepResultRepository;
    private final TestScenarioRepository scenarioRepository;
    private final FeatureRepository featureRepository;
    private final BugFindingRepository findingRepository;
    private final RepositorySourceRepository repoSourceRepository;
    private final EnvironmentConfigRepository envConfigRepository;
    private final ProjectService projectService;

        // SSE emitters for live updates
    private final Map<UUID, List<SseEmitter>> runEmitters = new ConcurrentHashMap<>();

    @Value("${autoqa.storage.artifacts-path}")
    private String artifactsPath;

    public TestRunService(TestRunRepository testRunRepository,
                          TestExecutionRepository executionRepository,
                          TestStepResultRepository stepResultRepository,
                          TestScenarioRepository scenarioRepository,
                          FeatureRepository featureRepository,
                          BugFindingRepository findingRepository,
                          RepositorySourceRepository repoSourceRepository,
                          EnvironmentConfigRepository envConfigRepository,
                          ProjectService projectService) {
        this.testRunRepository = testRunRepository;
        this.executionRepository = executionRepository;
        this.stepResultRepository = stepResultRepository;
        this.scenarioRepository = scenarioRepository;
        this.featureRepository = featureRepository;
        this.findingRepository = findingRepository;
        this.repoSourceRepository = repoSourceRepository;
        this.envConfigRepository = envConfigRepository;
        this.projectService = projectService;
    }

    @Transactional
    public TestRunResponse createTestRun(UUID projectId, UUID userId) {
        Project project = projectService.getProjectEntity(projectId, userId);
        User user = project.getUser();

                // Validate prerequisites
        RepositorySource repo = repoSourceRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId)
                .orElseThrow(() -> new BadRequestException("No repository uploaded for this project"));

        if (!"ANALYZED".equals(repo.getStatus()) && !"EXTRACTED".equals(repo.getStatus())) {
            throw new BadRequestException("Repository must be analyzed before running tests");
        }

        List<TestScenario> approvedScenarios = scenarioRepository
                .findByProjectIdAndStatusOrderByCreatedAt(projectId, "APPROVED");

        if (approvedScenarios.isEmpty()) {
                        // Also check for PENDING scenarios
            List<TestScenario> pendingScenarios = scenarioRepository
                    .findByProjectIdAndStatusOrderByCreatedAt(projectId, "PENDING");
            if (pendingScenarios.isEmpty()) {
                throw new BadRequestException("No test scenarios found. Upload a feature specification first.");
            }
                        // Auto-approve pending scenarios for convenience in Phase 1
            approvedScenarios = pendingScenarios;
            for (TestScenario s : approvedScenarios) {
                s.setStatus("APPROVED");
                scenarioRepository.save(s);
            }
        }

        EnvironmentConfiguration envConfig = envConfigRepository.findByProjectId(projectId)
                .orElseThrow(() -> new BadRequestException("No environment configuration found. Configure startup settings."));

                // Create the test run
        TestRun run = new TestRun();
        run.setProject(project);
        run.setUser(user);
        run.setStatus("QUEUED");
        run.setTotalScenarios(approvedScenarios.size());
        run = testRunRepository.save(run);

                // Create test execution entries for each scenario
        for (TestScenario scenario : approvedScenarios) {
            TestExecution execution = new TestExecution();
            execution.setTestRun(run);
            execution.setScenario(scenario);
            execution.setStatus("PENDING");
            executionRepository.save(execution);
        }

        return toRunResponse(run);
    }

    @Transactional(readOnly = true)
    public TestRunResponse getTestRun(UUID runId) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResourceNotFoundException("Test run not found"));
        return toRunResponse(run);
    }

    @Transactional(readOnly = true)
    public List<TestRunResponse> getTestRuns(UUID projectId) {
        return testRunRepository.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(this::toRunResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public TestRunDetailResponse getTestRunDetail(UUID runId) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResourceNotFoundException("Test run not found"));

        List<TestExecution> executions = executionRepository.findByTestRunIdOrderByCreatedAt(runId);
        List<BugFinding> findings = findingRepository.findByTestRunIdOrderByCreatedAt(runId);

        List<TestExecutionDetail> executionDetails = executions.stream()
                .map(ex -> {
                    List<TestStepResult> steps = stepResultRepository.findByExecutionIdOrderByStepIndex(ex.getId());
                    TestScenario scenario = ex.getScenario();
                    Feature feature = scenario.getFeature();
                    return new TestExecutionDetail(
                            ex.getId(), scenario.getId(), scenario.getName(),
                            feature.getName(), scenario.getScenarioType(),
                            ex.getStatus(), ex.getErrorMessage(), ex.getActualResult(),
                            ex.getDurationMs(), ex.getStartedAt(), ex.getCompletedAt(),
                            steps.stream().map(s -> new StepResultDetail(
                                    s.getId(), s.getStepIndex(), s.getActionType(),
                                    s.getActionTarget(), s.getActionValue(),
                                    s.getStatus(), s.getExpectedValue(), s.getActualValue(),
                                    s.getErrorMessage(), s.getScreenshotPath(),
                                    s.getConsoleLogs(), s.getNetworkErrors(), s.getDurationMs()
                            )).toList()
                    );
                }).toList();

        List<BugFindingDetail> findingDetails = findings.stream()
                .map(f -> {
                    String cleanEvidence = f.getEvidenceRefs();
                    if (cleanEvidence != null) {
                        cleanEvidence = cleanEvidence.replaceAll("^\\[?\"?|\"?\\]?$", "").trim();
                    }
                    return new BugFindingDetail(
                            f.getId(), f.getTitle(), f.getDescription(), f.getSeverity(),
                            f.getCategory(), f.getStatus(), f.getFeatureName(),
                            f.getScenarioName(), f.getFailedStep(), f.getExpectedBehaviour(),
                            f.getActualBehaviour(), f.getReproductionSteps(), cleanEvidence,
                            f.getConsoleErrors(), f.getNetworkErrors(),
                            f.getRootCauseHypothesis(), f.isHypothesis(),
                            f.getSuggestedFix(), f.getReproducibility()
                    );
                }).toList();

        return new TestRunDetailResponse(
                toRunResponse(run), executionDetails, findingDetails
        );
    }

        // Worker API methods

    /**
     * Worker polls for queued runs. Returns the next run to execute or empty.
     */
    @Transactional
    public Optional<WorkerJob> pollForJob() {
        Optional<TestRun> runOpt = testRunRepository.findFirstByStatusOrderByCreatedAt("QUEUED");
        if (runOpt.isEmpty()) return Optional.empty();

        TestRun run = runOpt.get();
        run.setStatus("PREPARING");
        run.setStartedAt(Instant.now());
        testRunRepository.save(run);

                // Build worker job
        RepositorySource repo = repoSourceRepository
                .findFirstByProjectIdOrderByCreatedAtDesc(run.getProject().getId())
                .orElse(null);

        EnvironmentConfiguration envConfig = envConfigRepository
                .findByProjectId(run.getProject().getId())
                .orElse(null);

        List<TestExecution> executions = executionRepository.findByTestRunIdOrderByCreatedAt(run.getId());

        List<WorkerJob.TestCase> testCases = executions.stream()
                .map(ex -> {
                    TestScenario scenario = ex.getScenario();
                    Feature feature = scenario.getFeature();
                    return new WorkerJob.TestCase(
                            ex.getId(), scenario.getId(), scenario.getName(),
                            feature.getName(), scenario.getActions(),
                            scenario.getExpectedOutcomes(), scenario.getPreconditions()
                    );
                }).toList();

        String absoluteExtractedPath = null;
        if (repo != null && repo.getExtractedPath() != null) {
            java.nio.file.Path p = java.nio.file.Paths.get(repo.getExtractedPath());
            if (!p.isAbsolute()) {
                p = java.nio.file.Paths.get(System.getProperty("user.dir")).resolve(p).normalize().toAbsolutePath();
            }
            absoluteExtractedPath = p.toString();
        }

        String workingDir = envConfig != null ? envConfig.getWorkingDirectory() : null;
        if (workingDir != null && (workingDir.equals(repo != null ? repo.getExtractedPath() : null) || workingDir.equals(absoluteExtractedPath) || (absoluteExtractedPath != null && absoluteExtractedPath.endsWith(workingDir)))) {
            workingDir = null;
        }

        return Optional.of(new WorkerJob(
                run.getId(),
                run.getProject().getId(),
                absoluteExtractedPath,
                envConfig != null ? envConfig.getInstallCommand() : null,
                envConfig != null ? envConfig.getStartupCommand() : null,
                envConfig != null ? envConfig.getPort() : 3000,
                envConfig != null ? envConfig.getHealthCheckPath() : "/",
                envConfig != null ? envConfig.getStartupTimeoutSeconds() : 120,
                workingDir,
                envConfig != null ? envConfig.getEnvironmentVariables() : null,
                testCases,
                (artifactsPath != null && java.nio.file.Paths.get(artifactsPath).isAbsolute()) ? artifactsPath : "/Users/yuvalsharma/Desktop/AutoQA/data/artifacts"

        ));
    }

    @Transactional
    public void updateRunStatus(UUID runId, String status, String errorMessage, String startupLog) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResourceNotFoundException("Test run not found"));
        run.setStatus(status);
        if (errorMessage != null) run.setErrorMessage(errorMessage);
        if (startupLog != null) run.setStartupLog(startupLog);
        if ("RUNNING".equals(status)) run.setStartedAt(Instant.now());
        if ("COMPLETED".equals(status) || "FAILED".equals(status) || "CANCELLED".equals(status)) {
            run.setCompletedAt(Instant.now());
            if (run.getStartedAt() != null) {
                run.setDurationMs(run.getCompletedAt().toEpochMilli() - run.getStartedAt().toEpochMilli());
            }
        }
        testRunRepository.save(run);
        emitUpdate(runId, "status", Map.of("status", status));
    }

    @Transactional
    public void updateAppUrl(UUID runId, String appUrl) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResourceNotFoundException("Test run not found"));
        run.setAppUrl(appUrl);
        testRunRepository.save(run);
    }

    @Transactional
    public void reportExecutionResult(UUID executionId, ExecutionResultReport report) {
        TestExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new ResourceNotFoundException("Test execution not found"));

        execution.setStatus(report.status());
        execution.setStartedAt(report.startedAt());
        execution.setCompletedAt(report.completedAt());
        execution.setDurationMs(report.durationMs());
        execution.setErrorMessage(report.errorMessage());
        execution.setActualResult(report.actualResult());
        executionRepository.save(execution);

                // Save step results
        if (report.steps() != null) {
            for (StepResultReport step : report.steps()) {
                TestStepResult stepResult = new TestStepResult();
                stepResult.setExecution(execution);
                stepResult.setStepIndex(step.stepIndex());
                stepResult.setActionType(step.actionType());
                stepResult.setActionTarget(step.actionTarget());
                stepResult.setActionValue(step.actionValue());
                stepResult.setStatus(step.status());
                stepResult.setExpectedValue(step.expectedValue());
                stepResult.setActualValue(step.actualValue());
                stepResult.setErrorMessage(step.errorMessage());
                stepResult.setScreenshotPath(step.screenshotPath());
                stepResult.setConsoleLogs(step.consoleLogs());
                stepResult.setNetworkErrors(step.networkErrors());
                stepResult.setDurationMs(step.durationMs());
                stepResultRepository.save(stepResult);
            }
        }

                // Update run counters
        TestRun run = execution.getTestRun();
        updateRunCounts(run);

        emitUpdate(run.getId(), "execution", Map.of(
                "executionId", executionId,
                "status", report.status(),
                "scenarioName", execution.getScenario().getName()
        ));
    }

    @Transactional
    public void reportBugFinding(UUID runId, BugFindingReport report) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResourceNotFoundException("Test run not found"));

        BugFinding finding = new BugFinding();
        finding.setTestRun(run);
        finding.setProject(run.getProject());
        finding.setTitle(report.title());
        finding.setDescription(report.description());
        finding.setSeverity(report.severity());
        finding.setCategory(report.category());
        finding.setFeatureName(report.featureName());
        finding.setScenarioName(report.scenarioName());
        finding.setFailedStep(report.failedStep());
        finding.setExpectedBehaviour(report.expectedBehaviour());
        finding.setActualBehaviour(report.actualBehaviour());
        finding.setReproductionSteps(ensureValidJson(report.reproductionSteps(), false));
        finding.setEvidenceRefs(ensureValidJson(report.evidenceRefs(), false));
        finding.setConsoleErrors(ensureValidJson(report.consoleErrors(), true));
        finding.setNetworkErrors(ensureValidJson(report.networkErrors(), true));
        finding.setRootCauseHypothesis(report.rootCauseHypothesis());
        finding.setHypothesis(true);
        finding.setGroupKey(report.groupKey());

        if (report.executionId() != null) {
            executionRepository.findById(report.executionId())
                    .ifPresent(finding::setExecution);
        }

        findingRepository.save(finding);
    }

    @Transactional
    public void finalizeRun(UUID runId) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResourceNotFoundException("Test run not found"));

        updateRunCounts(run);

        if (!"FAILED".equals(run.getStatus()) && !"CANCELLED".equals(run.getStatus())) {
            run.setStatus("COMPLETED");
        }
        run.setCompletedAt(Instant.now());
        if (run.getStartedAt() != null) {
            run.setDurationMs(run.getCompletedAt().toEpochMilli() - run.getStartedAt().toEpochMilli());
        }
        testRunRepository.save(run);
        emitUpdate(runId, "completed", Map.of("status", run.getStatus()));
    }

    private void updateRunCounts(TestRun run) {
        List<TestExecution> execs = executionRepository.findByTestRunIdOrderByCreatedAt(run.getId());
        int passed = 0, failed = 0, error = 0, skipped = 0;
        for (TestExecution ex : execs) {
            switch (ex.getStatus()) {
                case "PASSED" -> passed++;
                case "FAILED" -> failed++;
                case "ERROR", "BLOCKED" -> error++;
                case "SKIPPED" -> skipped++;
            }
        }
        run.setPassedCount(passed);
        run.setFailedCount(failed);
        run.setErrorCount(error);
        run.setSkippedCount(skipped);
        testRunRepository.save(run);
    }

        // SSE Support
    public SseEmitter subscribe(UUID runId) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5 min timeout
        runEmitters.computeIfAbsent(runId, k -> new ArrayList<>()).add(emitter);
        emitter.onCompletion(() -> removeEmitter(runId, emitter));
        emitter.onTimeout(() -> removeEmitter(runId, emitter));
        emitter.onError(e -> removeEmitter(runId, emitter));
        return emitter;
    }

    private void emitUpdate(UUID runId, String eventType, Map<String, Object> data) {
        List<SseEmitter> emitters = runEmitters.get(runId);
        if (emitters == null) return;

        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventType)
                        .data(data));
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        emitters.removeAll(dead);
    }

    private void removeEmitter(UUID runId, SseEmitter emitter) {
        List<SseEmitter> emitters = runEmitters.get(runId);
        if (emitters != null) {
            emitters.remove(emitter);
        }
    }

        // Dashboard stats
    public DashboardStats getDashboardStats(UUID userId) {
        var projects = projectService.listProjects(userId);
        int totalProjects = projects.size();

        long totalRuns = 0;
        long totalPassed = 0;
        long totalFailed = 0;
        String latestStatus = "NONE";

        for (var project : projects) {
            var runs = testRunRepository.findByProjectIdOrderByCreatedAtDesc(project.id());
            totalRuns += runs.size();
            for (var run : runs) {
                totalPassed += run.getPassedCount();
                totalFailed += run.getFailedCount();
            }
            if (!runs.isEmpty() && "NONE".equals(latestStatus)) {
                latestStatus = runs.get(0).getStatus();
            }
        }

        double passRate = (totalPassed + totalFailed) > 0
                ? (totalPassed * 100.0) / (totalPassed + totalFailed) : 0;

        return new DashboardStats(totalProjects, totalRuns, latestStatus,
                Math.round(passRate * 10) / 10.0, totalPassed, totalFailed);
    }

    private TestRunResponse toRunResponse(TestRun run) {
        return new TestRunResponse(
                run.getId(), run.getProject().getId(), run.getStatus(),
                run.getTotalScenarios(), run.getPassedCount(), run.getFailedCount(),
                run.getErrorCount(), run.getSkippedCount(), run.getAppUrl(),
                run.getStartedAt(), run.getCompletedAt(), run.getDurationMs(),
                run.getErrorMessage(), run.getCreatedAt()
        );
    }
    private String ensureValidJson(String value, boolean isArray) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
            (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
            return trimmed;
        }
        if (isArray) {
            return "[\"" + value.replace("\"", "\\\"").replace("\n", "\\n") + "\"]";
        }
        return "\"" + value.replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }
}
