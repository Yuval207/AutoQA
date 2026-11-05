import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api/client';
import {
  TestRunDetailResponse,
} from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Camera,
  Terminal,
  Bug,
  ChevronDown,
  ChevronRight,
  Activity,
  Maximize2,
  X,
} from 'lucide-react';

export const TestRunDetail: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();

  const [detail, setDetail] = useState<TestRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [expandedExecutions, setExpandedExecutions] = useState<Record<string, boolean>>({});

  const parseEvidenceRefs = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
      if (typeof parsed === 'string') {
        return [parsed.trim()];
      }
    } catch {}
    const cleaned = raw.replace(/[\[\]"']/g, '').trim();
    if (cleaned.includes(',')) {
      return cleaned.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return cleaned ? [cleaned] : [];
  };

  const parseList = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
      if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean);
    } catch {}
    return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  };

  const stepLabel = (ref: string) => {
    const m = ref.match(/_step_(\d+)\./);
    return m ? `Step ${m[1]}` : 'Screenshot';
  };

  const openScreenshot = (url: string) => {
    setImageError(false);
    setSelectedScreenshot(url);
  };

  const loadData = async (silent = false) => {
    if (!runId) return;
    if (!silent) setRefreshing(true);

    try {
      const data = await api.getTestRunDetail(runId);
      setDetail(data);

      // Expand failed executions by default so the user immediately sees the root cause
      const newExpanded: Record<string, boolean> = {};
      data.executions.forEach((ex) => {
        if (ex.status === 'FAILED' || ex.status === 'RUNNING') {
          newExpanded[ex.id] = true;
        }
      });
      setExpandedExecutions((prev) => ({ ...newExpanded, ...prev }));
    } catch (err) {
      console.error('Failed to load run details:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to SSE events if available, or poll while run is active
    let interval: any = null;
    const isRunning =
      detail?.run.status === 'QUEUED' ||
      detail?.run.status === 'PREPARING' ||
      detail?.run.status === 'STARTING_ENVIRONMENT' ||
      detail?.run.status === 'RUNNING_TESTS';

    if (isRunning || !detail) {
      interval = setInterval(() => {
        loadData(true);
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runId, detail?.run.status]);

  const toggleExecution = (id: string) => {
    setExpandedExecutions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
        <span className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Connecting to execution stream...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-white">Test Run not found</h2>
        <Link to="/projects" className="text-indigo-400 text-sm mt-3 inline-block">
          Return to projects
        </Link>
      </div>
    );
  }

  const { run, executions, findings } = detail;
  const isLive =
    run.status === 'QUEUED' ||
    run.status === 'PREPARING' ||
    run.status === 'STARTING_ENVIRONMENT' ||
    run.status === 'RUNNING_TESTS';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          to={`/projects/${run.projectId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Project Test Plan</span>
        </Link>

        <div className="flex items-center gap-3">
          {isLive && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-medium animate-pulse">
              <Activity className="w-3.5 h-3.5" />
              <span>Streaming Browser Telemetry...</span>
            </div>
          )}

          <button
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh state"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Run Banner */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 ${
            run.status === 'COMPLETED'
              ? 'bg-emerald-500'
              : run.status === 'FAILED'
              ? 'bg-rose-500'
              : 'bg-amber-500 animate-pulse'
          }`}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-white">Execution Telemetry</h1>
              <StatusBadge status={run.status} size="lg" />
            </div>
            <div className="mt-2 text-xs font-mono text-slate-400 flex items-center gap-2">
              <span>Run ID: {run.id}</span>
              <span>•</span>
              <span>Triggered: {new Date(run.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-6 text-sm">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-slate-400 uppercase font-semibold">Total Scenarios</div>
              <div className="text-xl font-extrabold text-white mt-0.5">{run.totalScenarios}</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-emerald-400 uppercase font-semibold">Passed</div>
              <div className="text-xl font-extrabold text-emerald-400 mt-0.5">{run.passedCount}</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-rose-400 uppercase font-semibold">Failed</div>
              <div className="text-xl font-extrabold text-rose-400 mt-0.5">{run.failedCount}</div>
            </div>
          </div>
        </div>

        {run.status === 'QUEUED' && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>
              Job is waiting in queue. Start the Worker engine in a terminal tab:{" "}
              <code className="bg-slate-950 px-2 py-1 rounded font-mono text-cyan-300 border border-slate-800">
                cd worker && npm run dev
              </code>
            </span>
          </div>
        )}

        {/* Target App Connection */}
        {run.appUrl && (
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Isolated Environment Live at:</span>
            </span>
            <a
              href={run.appUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1.5 underline decoration-cyan-500/40"
            >
              <span>{run.appUrl}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Error or Startup logs */}
        {run.errorMessage && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            <div className="font-bold mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Execution Error</span>
            </div>
            <div className="font-mono text-rose-300/90">{run.errorMessage}</div>
            <p className="mt-2 text-[11px] text-slate-400">
              Note: When the application environment fails to initialize or encounters a setup error, test scenarios are not executed, so individual browser step screenshots are not captured. Inspect the service logs in <code className="text-slate-300">logs/worker.log</code> or <code className="text-slate-300">logs/app-under-test.log</code> for full startup diagnostics.
            </p>
          </div>
        )}
      </div>

      {/* DISCOVERED BUG FINDINGS & ACTIONABLE REPORTS */}
      {findings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Bug className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Bugs Found ({findings.length})</h2>
            </div>
          </div>

          <div className="space-y-4">
            {findings.map((bug) => {
              const steps = parseList(bug.reproductionSteps).map((s) => s.replace(/^\d+\.\s*/, ''));
              const evidence = parseEvidenceRefs(bug.evidenceRefs);
              const consoleLines = parseList(bug.consoleErrors);
              const consoleErrorCount = consoleLines.filter((l) => /^\[(error|pageerror)\]/i.test(l)).length;

              return (
                <div
                  key={bug.id}
                  className="bg-slate-900/60 border border-slate-800 border-l-4 border-l-rose-500 rounded-xl p-5"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white">{bug.title}</h3>
                      <div className="text-xs text-slate-400 mt-1">
                        {bug.featureName} <span className="text-slate-600">›</span> {bug.scenarioName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800">
                        {bug.category}
                      </span>
                      <StatusBadge status={bug.severity} size="sm" />
                    </div>
                  </div>

                  {/* Expected vs actual */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Expected
                      </div>
                      <p className="font-mono text-slate-200 break-words">
                        {bug.expectedBehaviour || 'Assertion should pass'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-3">
                      <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1">
                        <XCircle className="w-3.5 h-3.5" /> Actual
                      </div>
                      <p className="font-mono text-slate-200 break-words">
                        {bug.actualBehaviour || bug.description}
                      </p>
                    </div>
                  </div>

                  {/* Steps + evidence */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {steps.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          Steps to reproduce
                        </div>
                        <ol className="space-y-1.5 text-xs">
                          {steps.map((s, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="w-5 h-5 shrink-0 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center">
                                {i + 1}
                              </span>
                              <span className="font-mono text-slate-300 pt-0.5 break-all">{s}</span>
                            </li>
                          ))}
                        </ol>
                        {bug.rootCauseHypothesis && (
                          <p className="mt-3 text-xs text-slate-400">
                            <span className="text-indigo-300 font-semibold">Likely cause: </span>
                            {bug.rootCauseHypothesis}
                          </p>
                        )}
                      </div>
                    )}

                    {evidence.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          Screenshot
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {evidence.map((ref) => (
                            <button
                              key={ref}
                              onClick={() => openScreenshot(api.getArtifactUrl(run.id, ref))}
                              className="group relative w-48 aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-indigo-500 bg-slate-950"
                              title={ref}
                            >
                              <img
                                src={api.getArtifactUrl(run.id, ref)}
                                alt={stepLabel(ref)}
                                loading="lazy"
                                className="w-full h-full object-cover object-top"
                                onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                              />
                              <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/70 text-[10px] text-slate-200 flex items-center justify-between">
                                <span>{stepLabel(ref)}</span>
                                <Maximize2 className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {steps.length === 0 && bug.rootCauseHypothesis && (
                    <p className="mt-3 text-xs text-slate-400">
                      <span className="text-indigo-300 font-semibold">Likely cause: </span>
                      {bug.rootCauseHypothesis}
                    </p>
                  )}

                  {/* Console output (collapsed) */}
                  {consoleLines.length > 0 && (
                    <details className="mt-4 group">
                      <summary className="cursor-pointer select-none text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        <span>
                          Browser console ({consoleLines.length} {consoleLines.length === 1 ? 'entry' : 'entries'}
                          {consoleErrorCount > 0 ? `, ${consoleErrorCount} errors` : ''})
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-1 bg-black/40 rounded-lg p-3 border border-slate-800 font-mono text-[11px] max-h-60 overflow-auto">
                        {consoleLines.map((line, i) => {
                          const isError = /^\[(error|pageerror)\]/i.test(line);
                          return (
                            <li
                              key={i}
                              className={`whitespace-pre-wrap break-words ${isError ? 'text-rose-300' : 'text-amber-200/80'}`}
                            >
                              {line}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DETAILED SCENARIO EXECUTIONS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Scenario Executions ({executions.length})</h2>
          <span className="text-xs text-slate-400">Click scenario to expand step trace</span>
        </div>

        <div className="space-y-3">
          {executions.map((ex) => {
            const isExpanded = !!expandedExecutions[ex.id];

            return (
              <div
                key={ex.id}
                className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg transition-all"
              >
                {/* Header item */}
                <button
                  onClick={() => toggleExecution(ex.id)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-slate-400">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold text-white">{ex.scenarioName}</span>
                        <StatusBadge status={ex.status} size="sm" />
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span>Feature: {ex.featureName}</span>
                        <span>•</span>
                        <span>Type: {ex.scenarioType}</span>
                        {ex.durationMs && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{ex.durationMs}ms</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    {ex.status === 'PASSED' && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    )}
                    {ex.status === 'FAILED' && <XCircle className="w-5 h-5 text-rose-400" />}
                    {ex.status === 'RUNNING' && (
                      <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </button>

                {/* Expanded Steps Table */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-slate-950/70 border-t border-slate-800/80 space-y-4">
                    {ex.steps.length === 0 ? (
                      <div className="text-xs text-slate-500 py-3 text-center">
                        No steps recorded yet or scenario is pending execution...
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                              <th className="pb-2 pl-1">#</th>
                              <th className="pb-2">Action</th>
                              <th className="pb-2">Target</th>
                              <th className="pb-2">Value</th>
                              <th className="pb-2">Status</th>
                              <th className="pb-2">Duration</th>
                              <th className="pb-2 text-right pr-1">Evidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {ex.steps.map((st) => (
                              <tr key={st.id} className="hover:bg-slate-900/40">
                                <td className="py-2.5 pl-1 text-slate-500">{st.stepIndex}</td>
                                <td className="py-2.5">
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-bold">
                                    {st.actionType}
                                  </span>
                                </td>
                                <td className="py-2.5 text-slate-300 max-w-xs truncate">
                                  {st.actionTarget || '-'}
                                </td>
                                <td className="py-2.5 text-slate-400 max-w-xs truncate">
                                  {st.actionValue || '-'}
                                </td>
                                <td className="py-2.5">
                                  <StatusBadge status={st.status} size="sm" />
                                </td>
                                <td className="py-2.5 text-slate-400">{st.durationMs}ms</td>
                                <td className="py-2.5 text-right pr-1">
                                  {st.screenshotPath ? (
                                    <button
                                      onClick={() => openScreenshot(api.getArtifactUrl(run.id, st.screenshotPath!))}
                                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline"
                                    >
                                      <Camera className="w-3 h-3" />
                                      <span>View</span>
                                    </button>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Screenshot Preview Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div
            className="relative max-w-5xl w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>{stepLabel(selectedScreenshot)}</span>
              </span>
              <div className="flex items-center gap-1">
                <a
                  href={selectedScreenshot}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setSelectedScreenshot(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 max-h-[80vh] min-h-[200px] overflow-auto flex flex-col items-center justify-center bg-black/50">
              {imageError ? (
                <div className="text-center p-6 max-w-md">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-white">Screenshot not found</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    This image is missing from storage. Re-run the test to capture it again.
                  </p>
                </div>
              ) : (
                <img
                  src={selectedScreenshot}
                  alt="Test Evidence Screenshot"
                  className="rounded-lg shadow-lg max-w-full h-auto border border-slate-800"
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
