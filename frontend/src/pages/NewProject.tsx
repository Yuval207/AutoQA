import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as api from '../api/client';
import { Project, ArchitectureAnalysis, ExecutionProfile } from '../api/types';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Server,
  Globe,
  Layers,
  Sliders,
  Check,
  AlertTriangle,
} from 'lucide-react';

export const NewProject: React.FC = () => {
  const navigate = useNavigate();

  // Wizard State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  // Step 2: Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Step 3: Environment Configuration & Architecture Discovery
  const [analysis, setAnalysis] = useState<ArchitectureAnalysis | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('fullstack');
  const [workingDirectory, setWorkingDirectory] = useState('.');
  const [installCommand, setInstallCommand] = useState('');
  const [startupCommand, setStartupCommand] = useState('');
  const [port, setPort] = useState(3000);
  const [healthCheckPath, setHealthCheckPath] = useState('/');
  const [startupTimeout, setStartupTimeout] = useState(60);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const applyProfile = (prof: ExecutionProfile) => {
    setSelectedProfileId(prof.id);
    setWorkingDirectory(prof.workingDirectory || '.');
    setInstallCommand(prof.installCommand || '');
    setStartupCommand(prof.startupCommand || '');
    setPort(prof.port || 3000);
    setHealthCheckPath(prof.healthCheckPath || '/');
  };

  const applyPreset = (preset: {
    name: string;
    install: string;
    startup: string;
    port: number;
    health: string;
    cwd: string;
  }) => {
    setSelectedProfileId('custom');
    setWorkingDirectory(preset.cwd);
    setInstallCommand(preset.install);
    setStartupCommand(preset.startup);
    setPort(preset.port);
    setHealthCheckPath(preset.health);
    setShowCustomizer(true);
  };

  // Step 1 Submit: Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const proj = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setCreatedProject(proj);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize project');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 Submit: Upload Zip
  const handleUploadZip = async () => {
    if (!createdProject || !selectedFile) return;
    setError(null);
    setLoading(true);

    try {
      const updated = await api.uploadRepository(createdProject.id, selectedFile);
      setCreatedProject(updated);

      // Parse Deep Architecture Analysis
      let arch: ArchitectureAnalysis | null = null;
      try {
        const repo = (updated as any).repository;
        if (repo?.analysisResult) {
          const raw = JSON.parse(repo.analysisResult);
          arch = raw.architectureAnalysis || null;
        }
      } catch {}

      setAnalysis(arch);

      if (arch?.recommendedProfile) {
        applyProfile(arch.recommendedProfile);
      } else {
        const env = (updated as any).environment;
        setInstallCommand(env?.installCommand || updated.installCommand || 'npm install');
        setStartupCommand(env?.startupCommand || updated.startupCommand || 'npm start');
        setPort(env?.port || updated.port || 3000);
        setHealthCheckPath(env?.healthCheckPath || updated.healthCheckPath || '/');
        setWorkingDirectory('.');
      }

      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to upload and analyze repository archive');
    } finally {
      setLoading(false);
    }
  };

  // Helper: Use demo fixture directly
  const handleUseDemoFixture = async () => {
    if (!createdProject) return;
    setError(null);
    setLoading(true);

    try {
      // Create empty mock or fetch demo-app.zip if available from server or fetch fixture
      const response = await fetch('/demo-app.zip');
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'demo-app.zip', { type: 'application/zip' });
        const updated = await api.uploadRepository(createdProject.id, file);
        setCreatedProject(updated);

        let arch: ArchitectureAnalysis | null = null;
        try {
          const repo = (updated as any).repository;
          if (repo?.analysisResult) {
            const raw = JSON.parse(repo.analysisResult);
            arch = raw.architectureAnalysis || null;
          }
        } catch {}
        setAnalysis(arch);

        if (arch?.recommendedProfile) {
          applyProfile(arch.recommendedProfile);
        } else {
          setInstallCommand(updated.installCommand || '');
          setStartupCommand(updated.startupCommand || 'node server.js');
          setPort(updated.port || 3000);
          setHealthCheckPath(updated.healthCheckPath || '/health');
        }
        setStep(3);
      } else {
        // Fallback: configure environment directly
        await api.updateEnvironment(createdProject.id, {
          startupCommand: 'node server.js',
          port: 3000,
          healthCheckPath: '/health',
          startupTimeoutSeconds: 60,
        });
        navigate(`/projects/${createdProject.id}`);
      }
    } catch (err: any) {
      await api.updateEnvironment(createdProject.id, {
        startupCommand: 'node server.js',
        port: 3000,
        healthCheckPath: '/health',
        startupTimeoutSeconds: 60,
      });
      navigate(`/projects/${createdProject.id}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 3 Submit: Save Environment
  const handleSaveEnvironment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!createdProject) return;
    setError(null);
    setLoading(true);

    try {
      await api.updateEnvironment(createdProject.id, {
        workingDirectory: workingDirectory.trim() || undefined,
        installCommand: installCommand.trim() || undefined,
        startupCommand: startupCommand.trim() || undefined,
        port: Number(port) || 3000,
        healthCheckPath: healthCheckPath.trim() || '/',
        startupTimeoutSeconds: Number(startupTimeout) || 60,
      });

      navigate(`/projects/${createdProject.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update environment settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Breadcrumb / Back Link */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Projects</span>
      </Link>

      {/* Progress Steps Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'
            }`}
          >
            1
          </div>
          <span className={`text-sm font-semibold ${step >= 1 ? 'text-white' : 'text-slate-500'}`}>
            Project Info
          </span>
        </div>
        <div className="h-0.5 w-12 bg-slate-800" />
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'
            }`}
          >
            2
          </div>
          <span className={`text-sm font-semibold ${step >= 2 ? 'text-white' : 'text-slate-500'}`}>
            Upload Archive
          </span>
        </div>
        <div className="h-0.5 w-12 bg-slate-800" />
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 3 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'
            }`}
          >
            3
          </div>
          <span className={`text-sm font-semibold ${step >= 3 ? 'text-white' : 'text-slate-500'}`}>
            Environment
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Name & Description */}
      {step === 1 && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Create New Test Target</h2>
            <p className="text-slate-400 text-sm mt-1">
              Define the name and scope for this application testing suite
            </p>
          </div>

          <form onSubmit={handleCreateProject} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. E-Commerce Checkout App"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Description (Optional)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of target functionality and expected behavior..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Next: Repository Archive</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: Upload Archive */}
      {step === 2 && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Upload Repository Archive</h2>
            <p className="text-slate-400 text-sm mt-1">
              Upload a .zip file containing your application source code for automatic framework detection
            </p>
          </div>

          <div className="space-y-6">
            {/* Drop Zone */}
            <label className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-950/40 hover:bg-slate-900/40 transition-all group">
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform mb-4">
                <Upload className="w-7 h-7" />
              </div>
              <span className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                {selectedFile ? selectedFile.name : 'Click to select a ZIP archive'}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                {selectedFile
                  ? `${(selectedFile.size / 1024).toFixed(1)} KB selected`
                  : 'Supports standard Node, React, Next, Express, or Static HTML zip repositories'}
              </span>
            </label>

            {/* Quick Demo Option */}
            <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Don't have a zip ready?</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Use our bundled demo application fixture with ready-made working and buggy test scenarios.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUseDemoFixture}
                disabled={loading}
                className="shrink-0 bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 text-xs font-semibold py-2 px-3.5 rounded-lg transition-all"
              >
                Use Built-in Demo Fixture
              </button>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleUploadZip}
                disabled={loading || !selectedFile}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Upload & Analyze</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Environment Settings & Architecture Confirmation */}
      {step === 3 && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">Project Architecture & Runtime</span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    analysis?.architecture === 'FULLSTACK_SPLIT'
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                      : analysis?.architecture === 'FRONTEND_ONLY'
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      : analysis?.architecture === 'BACKEND_ONLY'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : analysis?.architecture === 'MONOLITH'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  {analysis?.architecture === 'FULLSTACK_SPLIT'
                    ? 'Fullstack (Split)'
                    : analysis?.architecture === 'FRONTEND_ONLY'
                    ? 'Frontend Web App'
                    : analysis?.architecture === 'BACKEND_ONLY'
                    ? 'Backend API'
                    : analysis?.architecture === 'MONOLITH'
                    ? 'Monolith'
                    : 'Unidentified'}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-1">
                AutoQA automatically scanned the workspace structure and detected how to build, run, and verify this application.
              </p>
            </div>
          </div>

          {/* 1. DISCOVERED SERVICES BREAKDOWN */}
          {analysis?.services && analysis.services.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Detected Components ({analysis.services.length})</span>
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.services.map((svc, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {svc.type === 'FRONTEND' ? (
                            <Globe className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Server className="w-4 h-4 text-emerald-400" />
                          )}
                          <span className="text-sm font-bold text-white">{svc.name}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          Port {svc.port}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <div>
                          <span className="text-slate-500">Directory: </span>
                          <code className="text-indigo-300 font-mono">{svc.directory}/</code>
                        </div>
                        <div>
                          <span className="text-slate-500">Framework: </span>
                          <span className="text-slate-200">{svc.framework}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                        Start Command
                      </span>
                      <code className="text-[11px] font-mono text-cyan-300 truncate block">
                        {svc.startupCommand}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. EXECUTION PROFILE SELECTOR */}
          {analysis?.availableProfiles && analysis.availableProfiles.length > 1 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Choose How To Run Application</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {analysis.availableProfiles.map((prof) => {
                  const isSelected = selectedProfileId === prof.id;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => applyProfile(prof)}
                      className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-300'}`}>
                            {prof.name}
                          </span>
                          {prof.isRecommended && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                          {prof.description}
                        </p>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between pt-2 border-t border-slate-800/60">
                        <span>Port {prof.port}</span>
                        <span>{prof.workingDirectory === '.' ? 'Root' : prof.workingDirectory}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. FALLBACK PRESETS IF UNKNOWN */}
          {(!analysis || analysis.architecture === 'UNKNOWN' || analysis.confidence === 'LOW') && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
              <div className="flex items-center gap-2 font-bold text-xs mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Could not automatically detect project type</span>
              </div>
              <p className="text-xs text-amber-300/80 mb-3">
                Select a framework preset below or enter your custom startup commands:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    applyPreset({
                      name: 'Vite React',
                      cwd: '.',
                      install: 'npm install',
                      startup: 'npm run dev -- --host 0.0.0.0',
                      port: 5173,
                      health: '/',
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors"
                >
                  ⚡ React / Vite (5173)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset({
                      name: 'Next.js',
                      cwd: '.',
                      install: 'npm install',
                      startup: 'npm run dev',
                      port: 3000,
                      health: '/',
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors"
                >
                  ▲ Next.js (3000)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset({
                      name: 'Node Express',
                      cwd: '.',
                      install: 'npm install',
                      startup: 'node server.js',
                      port: 4000,
                      health: '/health',
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors"
                >
                  🟢 Node Express (4000)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset({
                      name: 'Spring Boot',
                      cwd: '.',
                      install: 'mvn clean install -DskipTests',
                      startup: 'mvn spring-boot:run',
                      port: 8080,
                      health: '/actuator/health',
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors"
                >
                  ☕ Spring Boot (8080)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset({
                      name: 'Python Web',
                      cwd: '.',
                      install: 'pip install -r requirements.txt',
                      startup: 'python app.py',
                      port: 8000,
                      health: '/',
                    })
                  }
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors"
                >
                  🐍 Python App (8000)
                </button>
              </div>
            </div>
          )}

          {/* 4. CONFIRMATION CARD (USER ASKED FOR EXPLICIT CONFIRMATION) */}
          <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-1">
                  Active Execution Plan
                </span>
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Target:</span>
                  <code className="text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded text-xs font-mono">
                    http://localhost:{port}{healthCheckPath}
                  </code>
                  <span className="text-slate-400 text-xs">(CWD: {workingDirectory})</span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1 truncate max-w-xl">
                  <span className="text-slate-500">Run: </span>
                  <code>{startupCommand}</code>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCustomizer(!showCustomizer)}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>{showCustomizer ? 'Hide Details' : 'Customize Commands'}</span>
              </button>
            </div>

            {/* Collapsible customizer fields */}
            {showCustomizer && (
              <div className="mt-4 pt-4 border-t border-indigo-500/20 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Working Directory
                    </label>
                    <input
                      type="text"
                      value={workingDirectory}
                      onChange={(e) => setWorkingDirectory(e.target.value)}
                      placeholder="e.g. . or Client or server"
                      className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Install Command
                    </label>
                    <input
                      type="text"
                      value={installCommand}
                      onChange={(e) => setInstallCommand(e.target.value)}
                      placeholder="e.g. npm install"
                      className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Startup Command
                  </label>
                  <input
                    type="text"
                    required
                    value={startupCommand}
                    onChange={(e) => setStartupCommand(e.target.value)}
                    placeholder="e.g. npm start or node server.js"
                    className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      required
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value, 10))}
                      className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Health Check Path
                    </label>
                    <input
                      type="text"
                      required
                      value={healthCheckPath}
                      onChange={(e) => setHealthCheckPath(e.target.value)}
                      placeholder="/"
                      className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Timeout (seconds)
                    </label>
                    <input
                      type="number"
                      required
                      value={startupTimeout}
                      onChange={(e) => setStartupTimeout(parseInt(e.target.value, 10))}
                      className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-800">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveEnvironment()}
              disabled={loading || !startupCommand}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-6 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm Configuration & Open Project</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
