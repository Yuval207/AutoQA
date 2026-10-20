import {
  AuthResponse,
  Project,
  CreateProjectRequest,
  UpdateEnvironmentRequest,
  FeatureSpecification,
  Feature,
  TestScenario,
  TestRun,
  TestRunDetailResponse,
  DashboardStats,
  User,
} from './types';

const TOKEN_KEY = 'autoqa_token';
const USER_KEY = 'autoqa_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  try {
    const data = localStorage.getItem(USER_KEY);
    if (!data || data === 'undefined' || data === 'null') return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveAuthSession(auth: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, auth.token);
  const user: User = auth.user || {
    id: auth.userId,
    email: auth.email,
    fullName: auth.fullName,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearAuthSession();
    if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    let errorMsg = `Request failed: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.message) errorMsg = errJson.message;
    } catch {
      // Ignored
    }
    throw new Error(errorMsg);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

// Authentication
export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveAuthSession(res);
  return res;
}

export async function register(email: string, password: string, fullName: string): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, fullName }),
  });
  saveAuthSession(res);
  return res;
}

export async function getMe(): Promise<User> {
  return await apiFetch<User>('/api/auth/me');
}

// Projects
export async function listProjects(): Promise<Project[]> {
  return await apiFetch<Project[]>('/api/projects');
}

export async function getProject(projectId: string): Promise<Project> {
  return await apiFetch<Project>(`/api/projects/${projectId}`);
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  return await apiFetch<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function uploadRepository(projectId: string, file: File): Promise<Project> {
  const formData = new FormData();
  formData.append('file', file);
  return await apiFetch<Project>(`/api/projects/${projectId}/repository`, {
    method: 'POST',
    body: formData,
  });
}

export async function updateEnvironment(
  projectId: string,
  data: UpdateEnvironmentRequest
): Promise<Project> {
  return await apiFetch<Project>(`/api/projects/${projectId}/environment`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Feature Specifications & Scenarios
export async function uploadSpecification(
  projectId: string,
  content: string,
  filename: string
): Promise<FeatureSpecification> {
  return await apiFetch<FeatureSpecification>(`/api/projects/${projectId}/specifications`, {
    method: 'POST',
    body: JSON.stringify({ content, filename }),
  });
}

export async function getSpecifications(projectId: string): Promise<FeatureSpecification[]> {
  return await apiFetch<FeatureSpecification[]>(`/api/projects/${projectId}/specifications`);
}

export async function getFeatures(projectId: string): Promise<Feature[]> {
  return await apiFetch<Feature[]>(`/api/projects/${projectId}/features`);
}

export async function getScenarios(projectId: string): Promise<TestScenario[]> {
  return await apiFetch<TestScenario[]>(`/api/projects/${projectId}/scenarios`);
}

export async function approveScenario(projectId: string, scenarioId: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${projectId}/scenarios/${scenarioId}/approve`, {
    method: 'PUT',
  });
}

export async function approveAllScenarios(projectId: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${projectId}/scenarios/approve-all`, {
    method: 'POST',
  });
}

// Test Runs
export async function createTestRun(projectId: string): Promise<TestRun> {
  return await apiFetch<TestRun>(`/api/projects/${projectId}/runs`, {
    method: 'POST',
  });
}

export async function listTestRuns(projectId: string): Promise<TestRun[]> {
  return await apiFetch<TestRun[]>(`/api/projects/${projectId}/runs`);
}

export async function getTestRunDetail(runId: string): Promise<TestRunDetailResponse> {
  return await apiFetch<TestRunDetailResponse>(`/api/runs/${runId}`);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return await apiFetch<DashboardStats>('/api/dashboard/stats');
}

export function getArtifactUrl(runId: string, filename: string): string {
  return `/api/artifacts/${runId}/${filename}`;
}

export function subscribeToRunEvents(
  runId: string,
  onEvent: (event: any) => void,
  onError?: (err: any) => void
): () => void {
  const eventSource = new EventSource(`/api/runs/${runId}/events`);
  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent(data);
    } catch {
      onEvent(e.data);
    }
  };
  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };
  return () => {
    eventSource.close();
  };
}
