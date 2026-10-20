export interface WorkerJob {
  runId: string;
  projectId: string;
  extractedPath: string;
  installCommand: string | null;
  startupCommand: string | null;
  port: number;
  healthCheckPath: string;
  startupTimeoutSeconds: number;
  workingDirectory: string | null;
  environmentVariables: string | null;
  testCases: TestCase[];
  artifactsPath: string;
}

export interface TestCase {
  executionId: string;
  scenarioId: string;
  scenarioName: string;
  featureName: string;
  actions: string; // JSON string
  expectedOutcomes: string; // JSON string
  preconditions: string | null;
}

export interface TestAction {
  type: 'NAVIGATE' | 'CLICK' | 'FILL' | 'SELECT' | 'CHECK' | 'UNCHECK' | 'SUBMIT' | 'ASSERT_TEXT' | 'ASSERT_VISIBLE' | 'ASSERT_URL' | 'SCREENSHOT' | 'CUSTOM';
  target?: string;
  value?: string;
  description?: string;
}

export interface ExpectedOutcome {
  description: string;
  source: string; // USER_SPECIFIED or AI_INFERRED
}

export interface StepResult {
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

export interface ExecutionResult {
  status: 'PASSED' | 'FAILED' | 'BLOCKED' | 'ERROR' | 'NEEDS_REVIEW' | 'SKIPPED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorMessage: string | null;
  actualResult: string | null;
  steps: StepResult[];
}

export interface BugFinding {
  executionId: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
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
}
