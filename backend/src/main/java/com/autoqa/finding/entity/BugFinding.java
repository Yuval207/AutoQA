package com.autoqa.finding.entity;

import com.autoqa.execution.entity.TestExecution;
import com.autoqa.execution.entity.TestRun;
import com.autoqa.project.entity.Project;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "bug_findings")
public class BugFinding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "test_run_id", nullable = false)
    private TestRun testRun;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "execution_id")
    private TestExecution execution;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false)
    private String severity = "MEDIUM";

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String status = "OPEN";

    @Column(name = "feature_name")
    private String featureName;

    @Column(name = "scenario_name")
    private String scenarioName;

    @Column(name = "failed_step", columnDefinition = "text")
    private String failedStep;

    @Column(name = "expected_behaviour", columnDefinition = "text")
    private String expectedBehaviour;

    @Column(name = "actual_behaviour", columnDefinition = "text")
    private String actualBehaviour;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "reproduction_steps", columnDefinition = "jsonb")
    private String reproductionSteps;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "evidence_refs", columnDefinition = "jsonb")
    private String evidenceRefs;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "console_errors", columnDefinition = "jsonb")
    private String consoleErrors;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "network_errors", columnDefinition = "jsonb")
    private String networkErrors;

    @Column(name = "root_cause_hypothesis", columnDefinition = "text")
    private String rootCauseHypothesis;

    @Column(name = "is_hypothesis")
    private boolean isHypothesis = true;

    @Column(name = "suggested_fix", columnDefinition = "text")
    private String suggestedFix;

    private String reproducibility = "NOT_VERIFIED";

    @Column(name = "group_key")
    private String groupKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = Instant.now(); updatedAt = Instant.now(); }

    @PreUpdate
    protected void onUpdate() { updatedAt = Instant.now(); }

    // Getters and setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public TestRun getTestRun() { return testRun; }
    public void setTestRun(TestRun testRun) { this.testRun = testRun; }
    public TestExecution getExecution() { return execution; }
    public void setExecution(TestExecution execution) { this.execution = execution; }
    public Project getProject() { return project; }
    public void setProject(Project project) { this.project = project; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getFeatureName() { return featureName; }
    public void setFeatureName(String featureName) { this.featureName = featureName; }
    public String getScenarioName() { return scenarioName; }
    public void setScenarioName(String scenarioName) { this.scenarioName = scenarioName; }
    public String getFailedStep() { return failedStep; }
    public void setFailedStep(String failedStep) { this.failedStep = failedStep; }
    public String getExpectedBehaviour() { return expectedBehaviour; }
    public void setExpectedBehaviour(String expectedBehaviour) { this.expectedBehaviour = expectedBehaviour; }
    public String getActualBehaviour() { return actualBehaviour; }
    public void setActualBehaviour(String actualBehaviour) { this.actualBehaviour = actualBehaviour; }
    public String getReproductionSteps() { return reproductionSteps; }
    public void setReproductionSteps(String reproductionSteps) { this.reproductionSteps = reproductionSteps; }
    public String getEvidenceRefs() { return evidenceRefs; }
    public void setEvidenceRefs(String evidenceRefs) { this.evidenceRefs = evidenceRefs; }
    public String getConsoleErrors() { return consoleErrors; }
    public void setConsoleErrors(String consoleErrors) { this.consoleErrors = consoleErrors; }
    public String getNetworkErrors() { return networkErrors; }
    public void setNetworkErrors(String networkErrors) { this.networkErrors = networkErrors; }
    public String getRootCauseHypothesis() { return rootCauseHypothesis; }
    public void setRootCauseHypothesis(String rootCauseHypothesis) { this.rootCauseHypothesis = rootCauseHypothesis; }
    public boolean isHypothesis() { return isHypothesis; }
    public void setHypothesis(boolean hypothesis) { isHypothesis = hypothesis; }
    public String getSuggestedFix() { return suggestedFix; }
    public void setSuggestedFix(String suggestedFix) { this.suggestedFix = suggestedFix; }
    public String getReproducibility() { return reproducibility; }
    public void setReproducibility(String reproducibility) { this.reproducibility = reproducibility; }
    public String getGroupKey() { return groupKey; }
    public void setGroupKey(String groupKey) { this.groupKey = groupKey; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
