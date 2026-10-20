-- V1: Core schema for AutoQA Phase 1

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);

-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_type VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_user_id ON projects(user_id);

-- Repository sources
CREATE TABLE repository_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL, -- ZIP, GITHUB
    original_filename VARCHAR(500),
    storage_path VARCHAR(1000) NOT NULL,
    extracted_path VARCHAR(1000),
    file_size_bytes BIGINT,
    status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED',
    analysis_result JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_repo_sources_project ON repository_sources(project_id);

-- Feature specifications
CREATE TABLE feature_specifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    raw_content TEXT NOT NULL,
    parsed_content JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_feature_specs_project ON feature_specifications(project_id);

-- Features (parsed from specifications)
CREATE TABLE features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specification_id UUID NOT NULL REFERENCES feature_specifications(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    preconditions JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_features_project ON features(project_id);
CREATE INDEX idx_features_spec ON features(specification_id);

-- Test scenarios
CREATE TABLE test_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    scenario_type VARCHAR(50) NOT NULL DEFAULT 'POSITIVE', -- POSITIVE, NEGATIVE, BOUNDARY, etc.
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, EXCLUDED
    preconditions JSONB,
    actions JSONB NOT NULL,
    expected_outcomes JSONB NOT NULL,
    confidence VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- HIGH, MEDIUM, LOW
    source VARCHAR(50) NOT NULL DEFAULT 'PARSED', -- PARSED, AI_GENERATED, MANUAL
    test_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scenarios_feature ON test_scenarios(feature_id);
CREATE INDEX idx_scenarios_project ON test_scenarios(project_id);

-- Environment configuration
CREATE TABLE environment_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    startup_command VARCHAR(1000),
    install_command VARCHAR(1000),
    port INTEGER DEFAULT 3000,
    health_check_path VARCHAR(500) DEFAULT '/',
    environment_variables JSONB,
    working_directory VARCHAR(1000),
    startup_timeout_seconds INTEGER DEFAULT 120,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_env_config_project ON environment_configurations(project_id);

-- Test runs
CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    -- QUEUED, PREPARING, STARTING_APP, RUNNING, FINALIZING, COMPLETED, FAILED, CANCELLED
    total_scenarios INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    app_url VARCHAR(500),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    startup_log TEXT,
    duration_ms BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_test_runs_project ON test_runs(project_id);
CREATE INDEX idx_test_runs_status ON test_runs(status);

-- Test executions (one per scenario per run)
CREATE TABLE test_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    scenario_id UUID NOT NULL REFERENCES test_scenarios(id),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    -- PENDING, RUNNING, PASSED, FAILED, BLOCKED, ERROR, NEEDS_REVIEW, SKIPPED
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms BIGINT,
    error_message TEXT,
    actual_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_executions_run ON test_executions(test_run_id);
CREATE INDEX idx_executions_scenario ON test_executions(scenario_id);

-- Test step results
CREATE TABLE test_step_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_target VARCHAR(500),
    action_value TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    -- PENDING, PASSED, FAILED, ERROR, SKIPPED
    expected_value TEXT,
    actual_value TEXT,
    error_message TEXT,
    screenshot_path VARCHAR(1000),
    console_logs JSONB,
    network_errors JSONB,
    duration_ms BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_step_results_execution ON test_step_results(execution_id);

-- Bug findings
CREATE TABLE bug_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES test_executions(id),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- CRITICAL, HIGH, MEDIUM, LOW
    category VARCHAR(50) NOT NULL,
    -- ASSERTION_FAILURE, STARTUP_FAILURE, ENVIRONMENT_FAILURE, AUTOMATION_FAILURE,
    -- NETWORK_FAILURE, MISSING_TEST_DATA, AMBIGUOUS_REQUIREMENT, POTENTIAL_FLAKY
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    feature_name VARCHAR(500),
    scenario_name VARCHAR(500),
    failed_step TEXT,
    expected_behaviour TEXT,
    actual_behaviour TEXT,
    reproduction_steps JSONB,
    evidence_refs JSONB,
    console_errors JSONB,
    network_errors JSONB,
    root_cause_hypothesis TEXT,
    is_hypothesis BOOLEAN NOT NULL DEFAULT TRUE,
    suggested_fix TEXT,
    reproducibility VARCHAR(50) DEFAULT 'NOT_VERIFIED',
    group_key VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_findings_run ON bug_findings(test_run_id);
CREATE INDEX idx_findings_project ON bug_findings(project_id);
CREATE INDEX idx_findings_group ON bug_findings(group_key);

-- Artifacts (screenshots, traces, logs)
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES test_executions(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_type VARCHAR(50) NOT NULL, -- SCREENSHOT, TRACE, LOG, CONSOLE_LOG
    filename VARCHAR(500) NOT NULL,
    storage_path VARCHAR(1000) NOT NULL,
    content_type VARCHAR(100),
    file_size_bytes BIGINT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_artifacts_run ON artifacts(test_run_id);
CREATE INDEX idx_artifacts_execution ON artifacts(execution_id);
CREATE INDEX idx_artifacts_project ON artifacts(project_id);
