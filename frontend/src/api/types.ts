export interface User {
  id: string;
  email: string;
  fullName: string;
  role?: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  email: string;
  fullName: string;
  user?: User;
}

export interface DetectedService {
  name: string;
  type: 'FRONTEND' | 'BACKEND' | 'STANDALONE';
  directory: string;
  framework: string;
  packageManager: string;
  installCommand: string;
  startupCommand: string;
  port: number;
  healthCheckPath: string;
}

export interface ExecutionProfile {
  id: string;
  name: string;
  description: string;
  workingDirectory: string;
  installCommand: string;
  startupCommand: string;
  port: number;
  healthCheckPath: string;
  isRecommended: boolean;
}

export interface ArchitectureAnalysis {
  architecture: 'FULLSTACK_SPLIT' | 'FRONTEND_ONLY' | 'BACKEND_ONLY' | 'MONOLITH' | 'UNKNOWN';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  requiresConfirmation: boolean;
  services: DetectedService[];
  recommendedProfile?: ExecutionProfile;
  availableProfiles: ExecutionProfile[];
  detectionNotes: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repositoryType?: string;
  projectType?: string;
  status: string;
  detectedFramework?: string | null;
  detectedPackageManager?: string | null;
  installCommand?: string | null;
  startupCommand?: string | null;
  port?: number;
  healthCheckPath?: string;
  repository?: {
    id: string;
    sourceType: string;
    originalFilename: string;
    status: string;
    analysisResult?: string;
  };
  environment?: {
    id: string;
    startupCommand: string;
    installCommand?: string;
    port: number;
    healthCheckPath: string;
    startupTimeoutSeconds?: number;
    workingDirectory?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateEnvironmentRequest {
  installCommand?: string;
  startupCommand?: string;
  port?: number;
  healthCheckPath?: string;
  startupTimeoutSeconds?: number;
  workingDirectory?: string;
  environmentVariables?: string;
}

export interface FeatureSpecification {
  id: string;
  filename: string;
  status: string;
  rawContent: string;
  parsedContent: string | null;
  createdAt: string;
}

export interface Feature {
  id: string;
  name: string;
  description: string | null;
  preconditions: string | null;
  createdAt: string;
}

export interface TestScenario {
  id: string;
  featureId: string;
  featureName?: string;
  name: string;
  description: string | null;
  scenarioType: 'POSITIVE' | 'NEGATIVE' | 'BOUNDARY';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actions: string; // JSON string of TestAction[]
  expectedOutcomes: string; // JSON string
  preconditions: string | null;
  createdAt: string;
}

export interface TestRun {
  id: string;
  projectId: string;
  status: 'QUEUED' | 'PREPARING' | 'STARTING_ENVIRONMENT' | 'RUNNING_TESTS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  skippedCount: number;
  errorMessage: string | null;
  startupLog: string | null;
  appUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface StepResultDetail {
  id: string;
  stepIndex: number;
  actionType: string;
  actionTarget: string | null;
  actionValue: string | null;
  status: 'PASSED' | 'FAILED' | 'ERROR' | 'SKIPPED';
  expectedValue: string | null;
  actualValue: string | null;
  errorMessage: string | null;
  screenshotPath: string | null;
  consoleLogs: string | null;
  networkErrors: string | null;
  durationMs: number;
}

export interface TestExecutionDetail {
  id: string;
  scenarioId: string;
  scenarioName: string;
  featureName: string;
  scenarioType: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR' | 'SKIPPED';
  errorMessage: string | null;
  actualResult: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: StepResultDetail[];
}

export interface BugFindingDetail {
  id: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  status: string;
  featureName: string;
  scenarioName: string;
  failedStep: string | null;
  expectedBehaviour: string | null;
  actualBehaviour: string | null;
  reproductionSteps: string | null;
  evidenceRefs: string | null;
  consoleErrors: string | null;
  networkErrors: string | null;
  rootCauseHypothesis: string | null;
  groupKey: string;
  createdAt: string;
}

export interface TestRunDetailResponse {
  run: TestRun;
  executions: TestExecutionDetail[];
  findings: BugFindingDetail[];
}

export interface DashboardStats {
  totalProjects: number;
  totalRuns: number;
  latestRunStatus: string | null;
  passRate: number;
  totalPassed: number;
  totalFailed: number;
}
