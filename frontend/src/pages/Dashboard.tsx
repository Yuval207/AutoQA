import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import { DashboardStats, Project, TestRun } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import {
  Layers,
  Play,
  CheckCircle,
  XCircle,
  TrendingUp,
  Plus,
  ArrowRight,
  RefreshCw,
  FolderGit2,
  Activity,
  Sparkles,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentRuns, setRecentRuns] = useState<Array<{ run: TestRun; projectName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [statsData, projectsData] = await Promise.all([
        api.getDashboardStats().catch(() => null),
        api.listProjects().catch(() => []),
      ]);

      setStats(statsData);
      setProjects(projectsData || []);

      // Fetch recent runs across projects
      if (projectsData && projectsData.length > 0) {
        const runsPromises = projectsData.slice(0, 5).map(async (p) => {
          try {
            const runs = await api.listTestRuns(p.id);
            return runs.map((r) => ({ run: r, projectName: p.name }));
          } catch {
            return [];
          }
        });

        const allRunsNested = await Promise.all(runsPromises);
        const flattened = allRunsNested.flat();
        flattened.sort(
          (a, b) => new Date(b.run.createdAt).getTime() - new Date(a.run.createdAt).getTime()
        );
        setRecentRuns(flattened.slice(0, 8));
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh stats every 15s
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleQuickDemoProject = async () => {
    try {
      // Create demo project
      const proj = await api.createProject({
        name: 'AutoQA Demo Fixture',
        description: 'Pre-configured test fixture with working authentication, task flows, and intentional discount bug',
      });

      // Upload default demo-app.zip or preconfigure environment
      await api.updateEnvironment(proj.id, {
        startupCommand: 'node server.js',
        port: 3000,
        healthCheckPath: '/health',
        startupTimeoutSeconds: 60,
      });

      // Upload default features.md
      const defaultFeatures = `# Feature: User Authentication

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
`;
      await api.uploadSpecification(proj.id, defaultFeatures, 'features.md');

      navigate(`/projects/${proj.id}`);
    } catch (err: any) {
      alert(`Error initializing demo project: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Testing Command Center
            </h1>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Real-time telemetry, automated test suite execution, and evidence-backed defect findings
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <button
            onClick={handleQuickDemoProject}
            className="bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Launch Demo Fixture</span>
          </button>

          <Link
            to="/projects/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Projects</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {loading ? '-' : stats?.totalProjects || projects.length}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <FolderGit2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Active code repositories</span>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Executed Runs</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Play className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {loading ? '-' : stats?.totalRuns ?? recentRuns.length}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span>Browser automation sweeps</span>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Global Pass Rate</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white flex items-baseline gap-1">
            <span>{loading ? '-' : Math.round(stats?.passRate || 0)}</span>
            <span className="text-lg text-slate-400 font-normal">%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, stats?.passRate || 0)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Scenarios Passed / Failed</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-2xl">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{loading ? '-' : stats?.totalPassed ?? 0}</span>
            </div>
            <span className="text-slate-600 font-bold text-xl">/</span>
            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-2xl">
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{loading ? '-' : stats?.totalFailed ?? 0}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Verified with explicit DOM assertions
          </div>
        </div>
      </div>

      {/* Main Sections: Recent Runs & Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Runs Table */}
        <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-white">Recent Test Runs</h2>
              <p className="text-xs text-slate-400 mt-0.5">Live execution telemetry & historical results</p>
            </div>
            <Link
              to="/projects"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <span>View all projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading test runs...</span>
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-400 text-sm">No test runs have been executed yet.</p>
              <button
                onClick={handleQuickDemoProject}
                className="mt-3 text-xs font-semibold text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Launch the Demo fixture to trigger your first run</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 pl-1">Status</th>
                    <th className="pb-3">Project</th>
                    <th className="pb-3">Scenarios</th>
                    <th className="pb-3">Pass Rate</th>
                    <th className="pb-3">Executed</th>
                    <th className="pb-3 text-right pr-1">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentRuns.map(({ run, projectName }) => {
                    const passPercent =
                      run.totalScenarios > 0
                        ? Math.round((run.passedCount / run.totalScenarios) * 100)
                        : 0;
                    return (
                      <tr key={run.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="py-3 pl-1">
                          <StatusBadge status={run.status} size="sm" />
                        </td>
                        <td className="py-3 font-semibold text-slate-200">
                          {projectName}
                        </td>
                        <td className="py-3 text-slate-400">
                          <span className="text-emerald-400 font-semibold">{run.passedCount}</span>
                          <span className="mx-1">/</span>
                          <span>{run.totalScenarios}</span>
                          {run.failedCount > 0 && (
                            <span className="ml-2 text-rose-400 text-xs font-medium">
                              ({run.failedCount} failed)
                            </span>
                          )}
                        </td>
                        <td className="py-3">
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
                        <td className="py-3 text-xs text-slate-400">
                          {new Date(run.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 text-right pr-1">
                          <Link
                            to={`/runs/${run.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 text-xs font-semibold transition-colors"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3 h-3" />
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

        {/* Projects Overview Sidebar */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Active Projects</h2>
              <Link
                to="/projects/new"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </Link>
            </div>

            {loading ? (
              <div className="py-8 flex justify-center">
                <span className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-400 text-xs">No projects configured yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="block p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-indigo-500/40 hover:bg-slate-800/40 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-200 group-hover:text-indigo-300 transition-colors">
                        {p.name}
                      </span>
                      <StatusBadge status={p.status} size="sm" />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>Framework: {p.detectedFramework || 'Auto-detect'}</span>
                      <span>•</span>
                      <span>Port {p.port || 3000}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <div className="rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/20 p-4">
              <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">
                E2E Test Architecture
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                AutoQA provisions isolated child processes, verifies server health, and dispatches Playwright workers that capture DOM state, screenshots, console logs, and failure traces.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
