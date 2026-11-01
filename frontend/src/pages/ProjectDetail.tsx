import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import {
  Project,
  FeatureSpecification,
  TestScenario,
  TestRun,
  ArchitectureAnalysis,
  ExecutionProfile,
} from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import {
  FolderGit2,
  Terminal,
  FileText,
  CheckCircle,
  Play,
  Upload,
  ArrowRight,
  Plus,
  ShieldCheck,
  AlertCircle,
  Cpu,
  Layers,
  Sparkles,
  X,
  Sliders,
  Check,
} from 'lucide-react';

export const ProjectDetail: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [specs, setSpecs] = useState<FeatureSpecification[]>([]);
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'specs' | 'scenarios' | 'runs'>('scenarios');

  const [loading, setLoading] = useState(true);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [generatingScenarios, setGeneratingScenarios] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Markdown upload/paste modal
  const [specContent, setSpecContent] = useState('');
  const [specFilename, setSpecFilename] = useState('features.md');
  const [uploadingSpec, setUploadingSpec] = useState(false);

  // Run Confirmation & Environment Edit Modal
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [showEditEnv, setShowEditEnv] = useState(false);
  const [envForm, setEnvForm] = useState({
    startupCommand: '',
    installCommand: '',
    port: 3000,
    healthCheckPath: '/',
    startupTimeoutSeconds: 60,
  });
  const [savingEnv, setSavingEnv] = useState(false);

  const loadData = async () => {
    if (!projectId) return;
    try {
      const [projData, specsData, scenariosData, runsData] = await Promise.all([
        api.getProject(projectId),
        api.getSpecifications(projectId).catch(() => []),
        api.getScenarios(projectId).catch(() => []),
        api.listTestRuns(projectId).catch(() => []),
      ]);

      setProject(projData);
      setSpecs(specsData);
      setScenarios(scenariosData);
      setRuns(runsData);

      const env = (projData as any).environment;
      setEnvForm({
        startupCommand: env?.startupCommand || projData.startupCommand || 'npm start',
        installCommand: env?.installCommand || projData.installCommand || '',
        port: env?.port || projData.port || 3000,
        healthCheckPath: env?.healthCheckPath || projData.healthCheckPath || '/',
        startupTimeoutSeconds: env?.startupTimeoutSeconds || 60,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  const architectureAnalysis: ArchitectureAnalysis | null = useMemo(() => {
    try {
      const repo = (project as any)?.repository;
      if (repo?.analysisResult) {
        const parsed = JSON.parse(repo.analysisResult);
        return parsed.architectureAnalysis || null;
      }
    } catch {}
    return null;
  }, [project]);

  const handleApplyProfile = async (prof: ExecutionProfile) => {
    if (!projectId) return;
    setSavingEnv(true);
    try {
      const updated = await api.updateEnvironment(projectId, {
        startupCommand: prof.startupCommand,
        installCommand: prof.installCommand || undefined,
        port: prof.port,
        healthCheckPath: prof.healthCheckPath,
        workingDirectory: prof.workingDirectory,
        startupTimeoutSeconds: 60,
      });
      setProject(updated);
      setEnvForm({
        startupCommand: prof.startupCommand,
        installCommand: prof.installCommand || '',
        port: prof.port,
        healthCheckPath: prof.healthCheckPath,
        startupTimeoutSeconds: 60,
      });
    } catch (err: any) {
      alert(`Failed to apply execution profile: ${err.message}`);
    } finally {
      setSavingEnv(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const openEditEnv = () => {
    const env = (project as any)?.environment;
    setEnvForm({
      startupCommand: env?.startupCommand || project?.startupCommand || 'npm start',
      installCommand: env?.installCommand || project?.installCommand || '',
      port: env?.port || project?.port || 3000,
      healthCheckPath: env?.healthCheckPath || project?.healthCheckPath || '/',
      startupTimeoutSeconds: env?.startupTimeoutSeconds || 60,
    });
    setShowEditEnv(true);
  };

  const handleApproveScenario = async (scenarioId: string) => {
    if (!projectId) return;
    try {
      await api.approveScenario(projectId, scenarioId);
      setScenarios((prev) =>
        prev.map((s) => (s.id === scenarioId ? { ...s, status: 'APPROVED' } : s))
      );
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleApproveAll = async () => {
    if (!projectId) return;
    try {
      await api.approveAllScenarios(projectId);
      setScenarios((prev) => prev.map((s) => ({ ...s, status: 'APPROVED' })));
    } catch (err: any) {
      alert(`Approve all failed: ${err.message}`);
    }
  };

  const handleAutoDetectScenarios = async () => {
    if (!projectId) return;
    setGeneratingScenarios(true);
    setError(null);
    try {
      const generated = await api.generateScenarios(projectId);
      setScenarios(generated);
      const updatedSpecs = await api.getSpecifications(projectId).catch(() => []);
      setSpecs(updatedSpecs);
    } catch (err: any) {
      setError(err.message || 'Failed to auto-detect scenarios from codebase');
    } finally {
      setGeneratingScenarios(false);
    }
  };

  const handleUploadSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !specContent.trim()) return;
    setUploadingSpec(true);
    setError(null);

    try {
      await api.uploadSpecification(projectId, specContent, specFilename || 'features.md');
      setSpecContent('');
      await loadData();
      setActiveTab('scenarios');
    } catch (err: any) {
      setError(err.message || 'Failed to parse feature specification');
    } finally {
      setUploadingSpec(false);
    }
  };

  const handleTriggerRun = async () => {
    if (!projectId) return;
    setTriggeringRun(true);
    setShowRunConfirm(false);
    setError(null);

    try {
      const newRun = await api.createTestRun(projectId);
      navigate(`/runs/${newRun.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to trigger test run');
      setTriggeringRun(false);
    }
  };

  const handleSaveEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSavingEnv(true);
    setError(null);
    try {
      const updated = await api.updateEnvironment(projectId, {
        startupCommand: envForm.startupCommand,
        installCommand: envForm.installCommand || undefined,
        port: Number(envForm.port),
        healthCheckPath: envForm.healthCheckPath,
        startupTimeoutSeconds: Number(envForm.startupTimeoutSeconds),
      });
      setProject(updated);
      setShowEditEnv(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update environment settings');
    } finally {
      setSavingEnv(false);
    }
  };

  const handleLoadSampleSpec = () => {
    setSpecContent(`# Feature: User Authentication

## Scenario: Successful login
- Open /
- Enter testuser into username
- Enter password123 into password
- Click Log in
- Expected: Welcome, testuser

## Scenario: Invalid credentials error
- Open /
- Enter wronguser into username
- Enter wrongpass into password
- Click Log in
- Expected: Invalid credentials

# Feature: Task Management

## Scenario: Add a new task
- Open /
- Enter Review pull request into task-input
- Click Add Task
- Expected: Review pull request

## Scenario: Toggle task completion
- Open /
- Click Complete
- Expected: Completed

# Feature: Discount Coupon System

## Scenario: Apply valid discount coupon
- Open /
- Enter SAVE20 into coupon-input
- Click Apply Coupon
- Expected: 20% discount applied!

## Scenario: Apply promotional discount code
- Open /
- Enter BUG50 into coupon-input
- Click Apply Coupon
- Expected: 50% promotional discount applied!
`);
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
        <span className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading project telemetry...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-white">Project not found</h2>
        <Link to="/projects" className="text-indigo-400 text-sm mt-3 inline-block">
          Return to projects
        </Link>
      </div>
    );
  }

  const approvedCount = scenarios.filter((s) => s.status === 'APPROVED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <FolderGit2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-white">{project.name}</h1>
                  <StatusBadge status={project.status} size="sm" />
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
                  {project.description || 'Target application under autonomous test coverage'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>{project.detectedFramework || 'Node.js'}</span>
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Port {project.port || 3000}</span>
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{approvedCount} / {scenarios.length} Scenarios Approved</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRunConfirm(true)}
              disabled={triggeringRun || scenarios.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2.5 transition-all disabled:opacity-50 group"
            >
              {triggeringRun ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
              )}
              <span>Trigger Test Run</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setActiveTab('scenarios')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'scenarios'
              ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Test Plan ({scenarios.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'runs'
              ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Test Runs ({runs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'specs'
              ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Feature Specs ({specs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Environment Config</span>
        </button>
      </div>

      {/* TAB 1: SCENARIOS / TEST PLAN */}
      {activeTab === 'scenarios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-base font-bold text-white">Generated Test Plan & Scenarios</h2>
              <p className="text-xs text-slate-400">
                Parsed from feature markdown with typed Playwright actions and explicit DOM assertions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoDetectScenarios}
                disabled={generatingScenarios}
                className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Scan codebase to re-detect project endpoints and generate fresh test scenarios"
              >
                <Sparkles className={`w-3.5 h-3.5 ${generatingScenarios ? 'animate-spin' : ''}`} />
                <span>{generatingScenarios ? 'Analyzing Code...' : 'Auto-Detect from Codebase'}</span>
              </button>
              {scenarios.length > 0 && (
                <button
                  onClick={handleApproveAll}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Approve All Scenarios</span>
                </button>
              )}
            </div>
          </div>

          {scenarios.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No Test Scenarios Yet</h3>
              <p className="text-slate-400 text-xs max-w-md mx-auto mt-1 mb-4">
                Auto-detect test scenarios directly from your codebase or upload a custom feature specification markdown.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleAutoDetectScenarios}
                  disabled={generatingScenarios}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${generatingScenarios ? 'animate-spin' : ''}`} />
                  <span>{generatingScenarios ? 'Analyzing Code...' : 'Auto-Detect from Codebase'}</span>
                </button>
                <button
                  onClick={() => setActiveTab('specs')}
                  className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-4 py-2 rounded-xl transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Feature Specification</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {scenarios.map((scenario) => {
                let parsedActions: any[] = [];
                try {
                  parsedActions = JSON.parse(scenario.actions);
                } catch {
                  parsedActions = [];
                }

                let parsedOutcomes: any[] = [];
                try {
                  parsedOutcomes = JSON.parse(scenario.expectedOutcomes);
                } catch {
                  parsedOutcomes = [];
                }

                return (
                  <div
                    key={scenario.id}
                    className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-lg transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-sm font-bold text-white">{scenario.name}</h3>
                          <StatusBadge status={scenario.status} size="sm" />
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                          <span className="font-semibold text-indigo-300">
                            Feature: {scenario.featureName || 'General'}
                          </span>
                          <span>•</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            Type: {scenario.scenarioType}
                          </span>
                          <span>•</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            Priority: {scenario.priority}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {scenario.status !== 'APPROVED' ? (
                          <button
                            onClick={() => handleApproveScenario(scenario.id)}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Approve Scenario</span>
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Ready for Execution</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Steps */}
                    <div className="mt-3 bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Execution Steps ({parsedActions.length})
                      </div>
                      <div className="space-y-1.5">
                        {parsedActions.map((act, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-xs font-mono text-slate-300"
                          >
                            <span className="text-slate-500 w-4">{idx + 1}.</span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                              {act.type}
                            </span>
                            <span className="text-slate-400">
                              {act.target && `target: "${act.target}"`}
                              {act.value && ` value: "${act.value}"`}
                              {act.description && act.description}
                            </span>
                          </div>
                        ))}
                      </div>

                      {parsedOutcomes.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-2 text-xs">
                          <span className="text-slate-500 text-[11px] font-semibold">Assertion:</span>
                          <span className="text-emerald-300 font-mono text-[11px]">
                            {parsedOutcomes.map((o) => o.description).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEST RUNS */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-base font-bold text-white">Execution History</h2>
              <p className="text-xs text-slate-400">
                Browse detailed test logs, screenshots, and discovered defects
              </p>
            </div>
            <button
              onClick={handleTriggerRun}
              disabled={triggeringRun || scenarios.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Trigger Run Now</span>
            </button>
          </div>

          {runs.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8">
              <Play className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No Runs Executed Yet</h3>
              <p className="text-slate-400 text-xs max-w-md mx-auto mt-1 mb-4">
                Execute your test scenarios in the background worker and observe real-time browser telemetry.
              </p>
              <button
                onClick={handleTriggerRun}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Execute First Run</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 pl-2">Status</th>
                    <th className="pb-3">Scenarios</th>
                    <th className="pb-3">Pass Rate</th>
                    <th className="pb-3">Target App</th>
                    <th className="pb-3">Started</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {runs.map((run) => {
                    const passPercent =
                      run.totalScenarios > 0
                        ? Math.round((run.passedCount / run.totalScenarios) * 100)
                        : 0;
                    return (
                      <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 pl-2">
                          <StatusBadge status={run.status} size="sm" />
                        </td>
                        <td className="py-3.5 text-slate-300">
                          <span className="text-emerald-400 font-bold">{run.passedCount}</span>
                          <span className="mx-1">/</span>
                          <span>{run.totalScenarios}</span>
                          {run.failedCount > 0 && (
                            <span className="ml-2 text-rose-400 text-xs font-semibold">
                              ({run.failedCount} failed)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`font-semibold text-xs ${
                              passPercent === 100
                                ? 'text-emerald-400'
                                : passPercent > 50
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {passPercent}%
                          </span>
                        </td>
                        <td className="py-3.5 font-mono text-xs text-slate-400">
                          {run.appUrl || 'http://localhost:3000'}
                        </td>
                        <td className="py-3.5 text-xs text-slate-400">
                          {new Date(run.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          <Link
                            to={`/runs/${run.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-semibold transition-colors"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FEATURE SPECS */}
      {activeTab === 'specs' && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Upload / Edit Feature Specification</h3>
                <p className="text-xs text-slate-400">
                  Write or paste Markdown format (Gherkin or action-style) to trigger autonomous parsing
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSampleSpec}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample Spec</span>
              </button>
            </div>

            <form onSubmit={handleUploadSpec} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Specification Filename
                </label>
                <input
                  type="text"
                  required
                  value={specFilename}
                  onChange={(e) => setSpecFilename(e.target.value)}
                  placeholder="features.md"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Markdown Content
                </label>
                <textarea
                  rows={12}
                  required
                  value={specContent}
                  onChange={(e) => setSpecContent(e.target.value)}
                  placeholder={`# Feature: Authentication\n## Scenario: Successful login\n- Open /\n- Enter testuser into username\n- Enter password123 into password\n- Click Log in\n- Expected: Welcome, testuser`}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={uploadingSpec || !specContent.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {uploadingSpec ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Parse & Generate Test Scenarios</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Uploaded Specs list */}
          {specs.length > 0 && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white mb-3">Specification Files</h3>
              <div className="space-y-3">
                {specs.map((spec) => (
                  <div
                    key={spec.id}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-indigo-400" />
                      <div>
                        <div className="text-sm font-bold text-white">{spec.filename}</div>
                        <div className="text-xs text-slate-500">
                          Uploaded {new Date(spec.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={spec.status} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ENVIRONMENT CONFIG */}
      {activeTab === 'overview' && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl max-w-3xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Environment Startup Settings</h3>
              <p className="text-xs text-slate-400">
                Commands and networking used by the worker to spin up and health-check the application fixture
              </p>
            </div>
            <button
              type="button"
              onClick={openEditEnv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit Configuration</span>
            </button>
          </div>

          {/* Deep Architecture & Multi-Service Discovery Banner */}
          {architectureAnalysis && (
            <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
                    Detected Architecture: {architectureAnalysis.architecture}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {architectureAnalysis.confidence} CONFIDENCE
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {architectureAnalysis.description}
              </p>

              {/* Detected Services */}
              {architectureAnalysis.services && architectureAnalysis.services.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-indigo-500/20">
                  {architectureAnalysis.services.map((svc, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-slate-200">
                        <span>{svc.name}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">Port {svc.port}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        {svc.startupCommand}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Execution Profile Switcher */}
              {architectureAnalysis.availableProfiles && architectureAnalysis.availableProfiles.length > 1 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">Switch Execution Profile:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {architectureAnalysis.availableProfiles.map((prof) => {
                      const env = (project as any)?.environment;
                      const isCurrent = env?.startupCommand === prof.startupCommand && env?.port === prof.port;
                      return (
                        <button
                          key={prof.id}
                          type="button"
                          onClick={() => handleApplyProfile(prof)}
                          disabled={savingEnv}
                          className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                            isCurrent
                              ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                              : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="truncate">{prof.name}</span>
                            {prof.isRecommended && (
                              <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded">REC</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">Port {prof.port}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <span className="text-xs text-slate-500 block uppercase font-semibold">Startup Command</span>
              <code className="text-sm font-mono text-cyan-300 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 block mt-1 break-all">
                {(project as any)?.environment?.startupCommand || project.startupCommand || 'npm start'}
              </code>
            </div>

            {((project as any)?.environment?.installCommand || project.installCommand) && (
              <div>
                <span className="text-xs text-slate-500 block uppercase font-semibold">Install Command</span>
                <code className="text-sm font-mono text-slate-300 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 block mt-1 break-all">
                  {(project as any)?.environment?.installCommand || project.installCommand}
                </code>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-500 block uppercase font-semibold">Port</span>
                <code className="text-sm font-mono text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 block mt-1">
                  {(project as any)?.environment?.port || project.port || 3000}
                </code>
              </div>
              <div>
                <span className="text-xs text-slate-500 block uppercase font-semibold">Health Path</span>
                <code className="text-sm font-mono text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 block mt-1">
                  {(project as any)?.environment?.healthCheckPath || project.healthCheckPath || '/'}
                </code>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-500 block uppercase font-semibold">Target Application URL</span>
              <code className="text-xs font-mono text-indigo-400 bg-indigo-950/30 px-3 py-2 rounded-lg border border-indigo-500/20 block mt-1">
                http://localhost:{(project as any)?.environment?.port || project.port || 3000}{(project as any)?.environment?.healthCheckPath || project.healthCheckPath || '/'}
              </code>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE LAUNCHING TEST RUN */}
      {showRunConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                <span>Confirm & Launch Autonomous Run</span>
              </div>
              <button
                onClick={() => setShowRunConfirm(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              AutoQA will execute <strong className="text-white">{approvedCount} approved test scenarios</strong> against your application with the following runtime profile:
            </p>

            {/* Profile Quick Select in Modal */}
            {architectureAnalysis?.availableProfiles && architectureAnalysis.availableProfiles.length > 1 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Select Profile:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {architectureAnalysis.availableProfiles.map((prof) => {
                    const env = (project as any)?.environment;
                    const isCurrent = env?.startupCommand === prof.startupCommand && env?.port === prof.port;
                    return (
                      <button
                        key={prof.id}
                        type="button"
                        onClick={() => handleApplyProfile(prof)}
                        disabled={savingEnv}
                        className={`text-left p-2 rounded-lg border text-[11px] transition-all ${
                          isCurrent
                            ? 'bg-indigo-600/40 border-indigo-400 text-white font-bold'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="truncate">{prof.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Port {prof.port}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Target URL:</span>
                <span className="text-cyan-300 font-bold">
                  http://localhost:{(project as any)?.environment?.port || project.port || 3000}{(project as any)?.environment?.healthCheckPath || project.healthCheckPath || '/'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Port:</span>
                <span className="text-slate-200">{(project as any)?.environment?.port || project.port || 3000}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Health Check:</span>
                <span className="text-slate-200">{(project as any)?.environment?.healthCheckPath || project.healthCheckPath || '/'}</span>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-500 block mb-1">Startup Command:</span>
                <div className="text-indigo-300 bg-slate-900 p-2 rounded truncate">
                  {(project as any)?.environment?.startupCommand || project.startupCommand || 'npm start'}
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowRunConfirm(false);
                  openEditEnv();
                }}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Change Settings</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRunConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTriggerRun}
                  disabled={triggeringRun}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 text-xs transition-all disabled:opacity-50"
                >
                  {triggeringRun ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Launch Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ENVIRONMENT MODAL */}
      {showEditEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Edit Environment Configuration</span>
              </div>
              <button
                onClick={() => setShowEditEnv(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEnv} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Startup Command
                </label>
                <input
                  type="text"
                  required
                  value={envForm.startupCommand}
                  onChange={(e) => setEnvForm({ ...envForm, startupCommand: e.target.value })}
                  placeholder="e.g. npm start or node server.js"
                  className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Install Command (Optional)
                </label>
                <input
                  type="text"
                  value={envForm.installCommand}
                  onChange={(e) => setEnvForm({ ...envForm, installCommand: e.target.value })}
                  placeholder="e.g. npm install"
                  className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    required
                    value={envForm.port}
                    onChange={(e) => setEnvForm({ ...envForm, port: parseInt(e.target.value, 10) })}
                    className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Health Path
                  </label>
                  <input
                    type="text"
                    required
                    value={envForm.healthCheckPath}
                    onChange={(e) => setEnvForm({ ...envForm, healthCheckPath: e.target.value })}
                    placeholder="/"
                    className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditEnv(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEnv}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 text-xs transition-all disabled:opacity-50"
                >
                  {savingEnv ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
