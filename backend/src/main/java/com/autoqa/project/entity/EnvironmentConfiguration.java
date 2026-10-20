package com.autoqa.project.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "environment_configurations")
public class EnvironmentConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "startup_command")
    private String startupCommand;

    @Column(name = "install_command")
    private String installCommand;

    private Integer port = 3000;

    @Column(name = "health_check_path")
    private String healthCheckPath = "/";

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "environment_variables", columnDefinition = "jsonb")
    private String environmentVariables;

    @Column(name = "working_directory")
    private String workingDirectory;

    @Column(name = "startup_timeout_seconds")
    private Integer startupTimeoutSeconds = 120;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = Instant.now(); updatedAt = Instant.now(); }

    @PreUpdate
    protected void onUpdate() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Project getProject() { return project; }
    public void setProject(Project project) { this.project = project; }
    public String getStartupCommand() { return startupCommand; }
    public void setStartupCommand(String cmd) { this.startupCommand = cmd; }
    public String getInstallCommand() { return installCommand; }
    public void setInstallCommand(String cmd) { this.installCommand = cmd; }
    public Integer getPort() { return port; }
    public void setPort(Integer port) { this.port = port; }
    public String getHealthCheckPath() { return healthCheckPath; }
    public void setHealthCheckPath(String path) { this.healthCheckPath = path; }
    public String getEnvironmentVariables() { return environmentVariables; }
    public void setEnvironmentVariables(String vars) { this.environmentVariables = vars; }
    public String getWorkingDirectory() { return workingDirectory; }
    public void setWorkingDirectory(String dir) { this.workingDirectory = dir; }
    public Integer getStartupTimeoutSeconds() { return startupTimeoutSeconds; }
    public void setStartupTimeoutSeconds(Integer timeout) { this.startupTimeoutSeconds = timeout; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
