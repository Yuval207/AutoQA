import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as api from '../api/client';
import { Project } from '../api/types';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Terminal,
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

  // Step 3: Environment Configuration
  const [installCommand, setInstallCommand] = useState('');
  const [startupCommand, setStartupCommand] = useState('');
  const [port, setPort] = useState(3000);
  const [healthCheckPath, setHealthCheckPath] = useState('/health');
  const [startupTimeout, setStartupTimeout] = useState(60);

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
      setInstallCommand(updated.installCommand || '');
      setStartupCommand(updated.startupCommand || 'node server.js');
      setPort(updated.port || 3000);
      setHealthCheckPath(updated.healthCheckPath || '/health');
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
        setInstallCommand(updated.installCommand || '');
        setStartupCommand(updated.startupCommand || 'node server.js');
        setPort(updated.port || 3000);
        setHealthCheckPath(updated.healthCheckPath || '/health');
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
      // In case /demo-app.zip isn't in public dir, configure environment directly
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
  const handleSaveEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdProject) return;
    setError(null);
    setLoading(true);

    try {
      await api.updateEnvironment(createdProject.id, {
        installCommand: installCommand.trim() || undefined,
        startupCommand: startupCommand.trim() || undefined,
        port: Number(port) || 3000,
        healthCheckPath: healthCheckPath.trim() || '/',
        startupTimeoutSeconds: Number(startupTimeout) || 60,
      });

      // Also seed a default feature spec if none exists
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
      await api.uploadSpecification(createdProject.id, defaultFeatures, 'features.md').catch(() => {});

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

      {/* STEP 3: Environment Settings */}
      {step === 3 && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Configure Environment Execution</h2>
            <p className="text-slate-400 text-sm mt-1">
              Verify detected startup scripts and health checks before launching autonomous tests
            </p>
          </div>

          {/* Analysis Card */}
          <div className="mb-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Detected Framework</div>
                <div className="text-sm font-bold text-white">
                  {createdProject?.detectedFramework || 'Node.js'} (
                  {createdProject?.detectedPackageManager || 'npm'})
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-300">
                Port {port}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveEnvironment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>Install Command (Optional)</span>
              </label>
              <input
                type="text"
                value={installCommand}
                onChange={(e) => setInstallCommand(e.target.value)}
                placeholder="e.g. npm install"
                className="w-full font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Startup Command</span>
              </label>
              <input
                type="text"
                required
                value={startupCommand}
                onChange={(e) => setStartupCommand(e.target.value)}
                placeholder="e.g. node server.js or npm start"
                className="w-full font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Port
                </label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value, 10))}
                  className="w-full font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Health Path
                </label>
                <input
                  type="text"
                  required
                  value={healthCheckPath}
                  onChange={(e) => setHealthCheckPath(e.target.value)}
                  placeholder="/health"
                  className="w-full font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Timeout (sec)
                </label>
                <input
                  type="number"
                  required
                  value={startupTimeout}
                  onChange={(e) => setStartupTimeout(parseInt(e.target.value, 10))}
                  className="w-full font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-6 flex items-center justify-between border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-6 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Complete & Open Project</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
