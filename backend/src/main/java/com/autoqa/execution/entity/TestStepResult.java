package com.autoqa.execution.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "test_step_results")
public class TestStepResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "execution_id", nullable = false)
    private TestExecution execution;

    @Column(name = "step_index", nullable = false)
    private int stepIndex;

    @Column(name = "action_type", nullable = false)
    private String actionType;

    @Column(name = "action_target")
    private String actionTarget;

    @Column(name = "action_value", columnDefinition = "text")
    private String actionValue;

    @Column(nullable = false)
    private String status = "PENDING";

    @Column(name = "expected_value", columnDefinition = "text")
    private String expectedValue;

    @Column(name = "actual_value", columnDefinition = "text")
    private String actualValue;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "screenshot_path")
    private String screenshotPath;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "console_logs", columnDefinition = "jsonb")
    private String consoleLogs;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "network_errors", columnDefinition = "jsonb")
    private String networkErrors;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() { createdAt = Instant.now(); }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public TestExecution getExecution() { return execution; }
    public void setExecution(TestExecution execution) { this.execution = execution; }
    public int getStepIndex() { return stepIndex; }
    public void setStepIndex(int stepIndex) { this.stepIndex = stepIndex; }
    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }
    public String getActionTarget() { return actionTarget; }
    public void setActionTarget(String actionTarget) { this.actionTarget = actionTarget; }
    public String getActionValue() { return actionValue; }
    public void setActionValue(String actionValue) { this.actionValue = actionValue; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getExpectedValue() { return expectedValue; }
    public void setExpectedValue(String expectedValue) { this.expectedValue = expectedValue; }
    public String getActualValue() { return actualValue; }
    public void setActualValue(String actualValue) { this.actualValue = actualValue; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public String getScreenshotPath() { return screenshotPath; }
    public void setScreenshotPath(String screenshotPath) { this.screenshotPath = screenshotPath; }
    public String getConsoleLogs() { return consoleLogs; }
    public void setConsoleLogs(String consoleLogs) { this.consoleLogs = consoleLogs; }
    public String getNetworkErrors() { return networkErrors; }
    public void setNetworkErrors(String networkErrors) { this.networkErrors = networkErrors; }
    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
    public Instant getCreatedAt() { return createdAt; }
}
