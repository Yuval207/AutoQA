import { WorkerJob, ExecutionResult, BugFinding } from './types.js';

const API_URL = process.env.AUTOQA_API_URL || 'http://localhost:8081';

async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  return response;
}

export async function pollForJob(): Promise<WorkerJob | null> {
  try {
    const response = await apiRequest('/api/worker/poll');
    if (response.status === 204) return null;
    if (!response.ok) {
      console.error(`Poll failed: ${response.status}`);
      return null;
    }
    return await response.json() as WorkerJob;
  } catch (error) {
    console.error('Poll error:', error);
    return null;
  }
}

export async function updateRunStatus(
  runId: string,
  status: string,
  errorMessage?: string,
  startupLog?: string
): Promise<void> {
  await apiRequest(`/api/worker/runs/${runId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, errorMessage, startupLog }),
  });
}

export async function updateAppUrl(runId: string, appUrl: string): Promise<void> {
  await apiRequest(`/api/worker/runs/${runId}/app-url`, {
    method: 'POST',
    body: JSON.stringify({ appUrl }),
  });
}

export async function reportExecutionResult(
  executionId: string,
  result: ExecutionResult
): Promise<void> {
  await apiRequest(`/api/worker/executions/${executionId}/result`, {
    method: 'POST',
    body: JSON.stringify(result),
  });
}

export async function reportBugFinding(
  runId: string,
  finding: BugFinding
): Promise<void> {
  await apiRequest(`/api/worker/runs/${runId}/findings`, {
    method: 'POST',
    body: JSON.stringify(finding),
  });
}

export async function finalizeRun(runId: string): Promise<void> {
  await apiRequest(`/api/worker/runs/${runId}/finalize`, {
    method: 'POST',
  });
}
