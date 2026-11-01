import { chromium, Browser } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  pollForJob,
  updateRunStatus,
  updateAppUrl,
  reportExecutionResult,
  reportBugFinding,
  finalizeRun,
} from './api-client.js';
import { WorkerJob, TestCase, TestAction, StepResult, ExecutionResult, BugFinding } from './types.js';
import { ActionExecutor } from './actions/executor.js';

// Setup file logging to logs/worker.log
const logsDir = [
  path.resolve(process.cwd(), 'logs'),
  path.resolve(process.cwd(), '../logs'),
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), '../logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const workerLogPath = path.join(logsDir, 'worker.log');
const appLogPath = path.join(logsDir, 'app-under-test.log');

function logToWorkerFile(msg: string) {
  try {
    fs.appendFileSync(workerLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
  originalConsoleLog(...args);
  logToWorkerFile(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

console.error = (...args: any[]) => {
  originalConsoleError(...args);
  logToWorkerFile(`[ERROR] ` + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

console.warn = (...args: any[]) => {
  originalConsoleWarn(...args);
  logToWorkerFile(`[WARN] ` + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

const POLL_INTERVAL_MS = 2000;
let isShuttingDown = false;

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Worker received SIGINT, shutting down...');
  isShuttingDown = true;
});

process.on('SIGTERM', () => {
  console.log('Worker received SIGTERM, shutting down...');
  isShuttingDown = true;
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthCheck(
  url: string,
  timeoutSeconds: number,
  isAlive?: () => boolean
): Promise<boolean> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    if (isShuttingDown) return false;

    // Fast-fail if the application process has already exited after brief grace period
    if (isAlive && !isAlive() && (Date.now() - startTime > 1500)) {
      console.warn(`[Worker] Target application process terminated unexpectedly before passing health check.`);
      return false;
    }

    try {
      const isHealthy = await new Promise<boolean>((resolve) => {
        const req = http.get(url, (res) => {
          // Accept any HTTP status code < 500 as proof of life (200, 301, 302, 304, 404 all indicate a running server)
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (isHealthy) {
        return true;
      }
    } catch {
      // Retry
    }
    await sleep(500);
  }
  return false;
}

async function runCommand(command: string, cwd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, CI: 'true', BROWSER: 'none' },
    });

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, output });
    });

    child.on('error', (err) => {
      output += `\nError: ${err.message}`;
      resolve({ success: false, output });
    });
  });
}

function startApplication(
  startupCommand: string,
  cwd: string,
  envVars: Record<string, string>
): { process: ChildProcess; getLog: () => string; isAlive: () => boolean } {
  let logBuffer = '';

  let effectiveCommand = startupCommand;
  const nodeMatch = startupCommand.match(/^node\s+([^\s]+)/);
  if (nodeMatch) {
    const targetFile = nodeMatch[1];
    const targetPath = path.resolve(cwd, targetFile);
    if (!fs.existsSync(targetPath)) {
      const pkgPath = path.resolve(cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts && pkg.scripts.start) {
            console.log(`[Worker] '${targetFile}' not found at root, using 'npm start' from package.json`);
            effectiveCommand = 'npm start';
          } else if (pkg.main && fs.existsSync(path.resolve(cwd, pkg.main))) {
            console.log(`[Worker] '${targetFile}' not found, using main entrypoint 'node ${pkg.main}'`);
            effectiveCommand = `node ${pkg.main}`;
          }
        } catch {}
      }
      if (effectiveCommand === startupCommand && fs.existsSync(path.resolve(cwd, 'src', targetFile))) {
        console.log(`[Worker] '${targetFile}' found in src/, using 'node src/${targetFile}'`);
        effectiveCommand = `node src/${targetFile}`;
      }
    }
  }

  // If command is simple (e.g. "npm start" or "node server.js") but cwd has no package.json,
  // find candidate subfolder (server, backend, etc.) and run there
  const isCompoundOrSubdir = effectiveCommand.includes('cd ') || effectiveCommand.includes('--prefix');
  if (!isCompoundOrSubdir && !fs.existsSync(path.resolve(cwd, 'package.json'))) {
    const candidates = ['server', 'backend', 'api', 'app', 'Client', 'client', 'frontend'];
    for (const sub of candidates) {
      const subDir = path.resolve(cwd, sub);
      const subPkg = path.resolve(subDir, 'package.json');
      if (fs.existsSync(subPkg)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(subPkg, 'utf8'));
          if (effectiveCommand.startsWith('npm start') && pkg.scripts?.start) {
            console.log(`[Worker] '${effectiveCommand}' requested in ${cwd} (no root package.json), redirecting to sub-directory '${sub}'`);
            effectiveCommand = `(cd "${sub}" && ${effectiveCommand})`;
            break;
          } else if (effectiveCommand.startsWith('node ') && (fs.existsSync(path.resolve(subDir, 'server.js')) || fs.existsSync(path.resolve(subDir, 'index.js')))) {
            console.log(`[Worker] '${effectiveCommand}' requested in ${cwd} (no root package.json), redirecting to sub-directory '${sub}'`);
            effectiveCommand = `(cd "${sub}" && ${effectiveCommand})`;
            break;
          }
        } catch {}
      }
    }
  }

  // Preload compatibility polyfill for Node 22/25+ (SlowBuffer, etc.)
  const candidateCompats = [
    path.resolve(process.cwd(), 'compat.cjs'),
    path.resolve(process.cwd(), '../compat.cjs'),
    path.resolve(__dirname, 'compat.cjs'),
    path.resolve(__dirname, '../compat.cjs')
  ];
  const compatPath = candidateCompats.find((p) => fs.existsSync(p));
  let nodeOptions = process.env.NODE_OPTIONS || '';
  if (compatPath && !nodeOptions.includes(compatPath)) {
    nodeOptions = `${nodeOptions} -r "${compatPath}"`.trim();
    console.log(`[Worker] Preloading compatibility polyfill: ${compatPath}`);
  }

  const startBanner = `\n--- [${new Date().toISOString()}] Starting Application: ${effectiveCommand} (cwd: ${cwd}) ---\n`;
  try {
    fs.appendFileSync(appLogPath, startBanner);
  } catch {}

  const child = spawn(effectiveCommand, {
    cwd,
    shell: true,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      ...envVars,
      CI: 'true',
      BROWSER: 'none',
      PORT: envVars.PORT || '3000',
      NODE_OPTIONS: nodeOptions,
    },
  });

  let processExited = false;
  child.on('exit', (code, signal) => {
    processExited = true;
    const text = `\n[Process Exited] code=${code}, signal=${signal}\n`;
    logBuffer += text;
    try {
      fs.appendFileSync(appLogPath, text);
    } catch {}
  });

  child.on('error', (err) => {
    const text = `\n[Process Error] ${err.message}\n`;
    logBuffer += text;
    console.error(`[Worker] App process error: ${err.message}`);
    try {
      fs.appendFileSync(appLogPath, text);
    } catch {}
  });

  child.stdout?.on('data', (data) => {
    const text = data.toString();
    logBuffer += text;
    if (logBuffer.length > 50000) {
      logBuffer = logBuffer.substring(logBuffer.length - 50000);
    }
    try {
      fs.appendFileSync(appLogPath, text);
    } catch {}
  });

  child.stderr?.on('data', (data) => {
    const text = data.toString();
    logBuffer += text;
    if (logBuffer.length > 50000) {
      logBuffer = logBuffer.substring(logBuffer.length - 50000);
    }
    try {
      fs.appendFileSync(appLogPath, text);
    } catch {}
  });

  return {
    process: child,
    getLog: () => logBuffer,
    isAlive: () => !processExited,
  };
}

function killProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    try {
      if (child.pid) {
        process.kill(-child.pid, 'SIGTERM');
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      child.kill('SIGTERM');
    }

    const timer = setTimeout(() => {
      try {
        if (child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // Ignored
      }
      resolve();
    }, 2000);

    child.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function processJob(job: WorkerJob): Promise<void> {
  console.log(`[Worker] Starting job for run ${job.runId}`);
  let appProcess: ChildProcess | null = null;
  let getStartupLog = () => '';
  let browser: Browser | null = null;

  try {
    let basePath = job.extractedPath;
    if (!path.isAbsolute(basePath)) {
      const candidateBackend = path.resolve(process.cwd(), '../backend', basePath);
      const candidateCwd = path.resolve(process.cwd(), basePath);
      if (fs.existsSync(candidateBackend)) {
        basePath = candidateBackend;
      } else {
        basePath = candidateCwd;
      }
    }

    let workDir = basePath;
    if (job.workingDirectory && job.workingDirectory !== '.' && job.workingDirectory !== './') {
      if (path.isAbsolute(job.workingDirectory) && fs.existsSync(job.workingDirectory)) {
        workDir = job.workingDirectory;
      } else if (!basePath.endsWith(job.workingDirectory)) {
        const joined = path.join(basePath, job.workingDirectory);
        if (fs.existsSync(joined)) {
          workDir = joined;
        }
      }
    }

    // Auto-detect project sub-directory if root has no package.json/pom.xml (monorepo / multi-folder repos)
    // ONLY do this if commands do NOT already handle sub-directories (like "(cd server ...)" or "--prefix")
    const commandsUseSubdirs =
      Boolean((job.installCommand && (job.installCommand.includes('cd ') || job.installCommand.includes('--prefix'))) ||
      (job.startupCommand && (job.startupCommand.includes('cd ') || job.startupCommand.includes('--prefix'))));

    if (!commandsUseSubdirs && (!job.workingDirectory || job.workingDirectory === '.' || job.workingDirectory === './')) {
      if (!fs.existsSync(path.resolve(workDir, 'package.json')) && !fs.existsSync(path.resolve(workDir, 'pom.xml'))) {
        const candidates = ['server', 'backend', 'api', 'app', 'service', 'client', 'Client', 'frontend'];
        for (const candidate of candidates) {
          const candidateDir = path.resolve(workDir, candidate);
          if (fs.existsSync(path.resolve(candidateDir, 'package.json')) || fs.existsSync(path.resolve(candidateDir, 'pom.xml'))) {
            console.log(`[Worker] Detected project sub-directory: '${candidate}', updating working directory to: ${candidateDir}`);
            workDir = candidateDir;
            break;
          }
        }
      }
    }

    if (!fs.existsSync(workDir)) {
      console.error(`[Worker] Target workspace directory not found: ${workDir}`);
      await updateRunStatus(
        job.runId,
        'FAILED',
        `Workspace directory not found: ${workDir}`,
        `Workspace directory does not exist: ${workDir}`
      );
      return;
    }

    // 1. Install dependencies if installCommand is provided, or auto-install if package.json exists without node_modules
    let installCmd = job.installCommand;
    if (!installCmd) {
      if (fs.existsSync(path.resolve(workDir, 'package.json')) && !fs.existsSync(path.resolve(workDir, 'node_modules'))) {
        console.log(`[Worker] node_modules missing for root package.json, auto-running 'npm install'...`);
        installCmd = 'npm install';
      } else {
        // Check subdirectories
        const subdirs = ['server', 'backend', 'Client', 'client', 'frontend', 'ui', 'api'];
        const missingInstalls: string[] = [];
        for (const sub of subdirs) {
          const subPkg = path.resolve(workDir, sub, 'package.json');
          const subModules = path.resolve(workDir, sub, 'node_modules');
          if (fs.existsSync(subPkg) && !fs.existsSync(subModules)) {
            missingInstalls.push(`(cd "${sub}" && npm install)`);
          }
        }
        if (missingInstalls.length > 0) {
          installCmd = missingInstalls.join(' && ');
          console.log(`[Worker] Auto-detected missing dependencies in sub-directories, running: ${installCmd}`);
        }
      }
    }

    if (installCmd) {
      const isCompound = installCmd.includes('&&') || installCmd.includes('(') || installCmd.includes('cd ') || installCmd.includes('--prefix');
      if (!isCompound && installCmd.startsWith('npm') && !fs.existsSync(path.resolve(workDir, 'package.json'))) {
        console.log(`[Worker] Skipping simple '${installCmd}' because no root package.json found in ${workDir}`);
      } else {
        console.log(`[Worker] Running install command: ${installCmd}`);
        await updateRunStatus(job.runId, 'STARTING_ENVIRONMENT', undefined, 'Installing dependencies...');
        const installResult = await runCommand(installCmd, workDir);
        if (!installResult.success) {
          console.error(`[Worker] Install command failed:\n${installResult.output}`);
          await updateRunStatus(
            job.runId,
            'FAILED',
            'Failed to install dependencies',
            installResult.output.substring(0, 5000)
          );
          return;
        }
      }
    }

    // 2. Start application if startupCommand is provided
    let appUrl = `http://localhost:${job.port}`;
    if (job.startupCommand) {
      console.log(`[Worker] Starting application with command: ${job.startupCommand}`);
      await updateRunStatus(job.runId, 'STARTING_ENVIRONMENT', undefined, 'Starting application server...');

      let envVars: Record<string, string> = { PORT: String(job.port) };
      if (job.environmentVariables) {
        try {
          envVars = { ...envVars, ...JSON.parse(job.environmentVariables) };
        } catch {
          // Ignored
        }
      }

      const started = startApplication(job.startupCommand, workDir, envVars);
      appProcess = started.process;
      getStartupLog = started.getLog;

      // 3. Health check
      const healthUrl = `${appUrl}${job.healthCheckPath.startsWith('/') ? job.healthCheckPath : '/' + job.healthCheckPath}`;
      console.log(`[Worker] Waiting for health check at: ${healthUrl}`);
      const isHealthy = await waitForHealthCheck(healthUrl, job.startupTimeoutSeconds || 60, started.isAlive);

      if (!isHealthy) {
        const logs = getStartupLog();
        console.error(`[Worker] Application failed health check within timeout. Startup logs:\n${logs}`);
        await updateRunStatus(
          job.runId,
          'FAILED',
          'Application did not start within the expected timeout',
          logs.substring(0, 5000)
        );
        return;
      }
    }

    await updateAppUrl(job.runId, appUrl);
    await updateRunStatus(job.runId, 'RUNNING_TESTS');
    console.log(`[Worker] Application ready at ${appUrl}. Launching Playwright browser...`);

    // 4. Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // 5. Execute test cases
    for (const testCase of job.testCases) {
      if (isShuttingDown) break;

      console.log(`[Worker] Executing test case: ${testCase.scenarioName} (${testCase.featureName})`);
      const executionStartTime = new Date().toISOString();
      const testStartTime = Date.now();

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'AutoQA-Automated-Test-Worker/1.0',
      });
      const page = await context.newPage();

      const executor = new ActionExecutor(page, appUrl, job.artifactsPath, job.runId);
      const stepResults: StepResult[] = [];
      let testPassed = true;
      let failureErrorMessage: string | null = null;
      let failedAction: TestAction | null = null;
      let failedStepIndex = -1;

      // Parse actions
      let actions: TestAction[] = [];
      try {
        actions = JSON.parse(testCase.actions);
      } catch {
        actions = [];
      }

      // Execute steps
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        console.log(`[Worker] Step ${i + 1}/${actions.length}: ${action.type} -> ${action.target || ''} ${action.value || ''}`);

        const stepResult = await executor.executeAction(action, i + 1, testCase.executionId);
        stepResults.push(stepResult);

        if (stepResult.status === 'FAILED' || stepResult.status === 'ERROR') {
          testPassed = false;
          failureErrorMessage = stepResult.errorMessage;
          failedAction = action;
          failedStepIndex = i + 1;
          console.warn(`[Worker] Step ${i + 1} failed: ${stepResult.errorMessage}`);
          break; // Stop remaining steps in this scenario
        }
      }

      // Execute assertions if all action steps succeeded
      if (testPassed && testCase.expectedOutcomes) {
        let expectedOutcomes: Array<{ description: string; source: string }> = [];
        try {
          expectedOutcomes = JSON.parse(testCase.expectedOutcomes);
        } catch {
          expectedOutcomes = [];
        }

        if (expectedOutcomes.length > 0) {
          console.log(`[Worker] Running ${expectedOutcomes.length} assertion(s) for ${testCase.scenarioName}...`);
          const assertionResults = await executor.executeAssertions(
            expectedOutcomes,
            actions.length + 1,
            testCase.executionId
          );
          stepResults.push(...assertionResults);

          for (let k = 0; k < assertionResults.length; k++) {
            const ar = assertionResults[k];
            if (ar.status === "FAILED" || ar.status === "ERROR") {
              testPassed = false;
              failureErrorMessage = ar.errorMessage || "Expected outcome assertion failed";
              failedAction = {
                type: "ASSERT_TEXT",
                target: ar.actionTarget || undefined,
                value: ar.expectedValue || undefined,
                description: `Verify expected outcome: ${ar.expectedValue || ar.actionTarget || ""}`
              };
              failedStepIndex = actions.length + 1 + k;
              console.warn(`[Worker] Assertion ${k + 1} failed: ${ar.errorMessage}`);
              break;
            }
          }
        }
      }

      const executionEndTime = new Date().toISOString();
      const totalDuration = Date.now() - testStartTime;

      const result: ExecutionResult = {
        status: testPassed ? 'PASSED' : 'FAILED',
        startedAt: executionStartTime,
        completedAt: executionEndTime,
        durationMs: totalDuration,
        errorMessage: failureErrorMessage,
        actualResult: testPassed ? 'All scenario steps completed and verified successfully' : failureErrorMessage,
        steps: stepResults,
      };

      await reportExecutionResult(testCase.executionId, result);

      // If test failed, file a BugFinding
      if (!testPassed && failedAction) {
        const consoleLogs = executor.getConsoleLogs();
        const networkErrors = executor.getNetworkErrors();

        const bugFinding: BugFinding = {
          executionId: testCase.executionId,
          title: `Failure in ${testCase.scenarioName}: ${failedAction.type} failed`,
          description: failureErrorMessage || `Step ${failedStepIndex} (${failedAction.type}) failed during execution`,
          severity: failedAction.type === 'NAVIGATE' ? 'CRITICAL' : 'HIGH',
          category: failedAction.type.startsWith('ASSERT') ? 'FUNCTIONAL_REGRESSION' : 'UI_INTERACTION',
          featureName: testCase.featureName,
          scenarioName: testCase.scenarioName,
          failedStep: `Step ${failedStepIndex}: ${failedAction.type} on "${failedAction.target || ''}"`,
          expectedBehaviour: failedAction.value || failedAction.description || 'Action should succeed and assertions should pass',
          actualBehaviour: failureErrorMessage || 'Step failed or timed out',
          reproductionSteps: actions
            .slice(0, failedStepIndex)
            .map((a, idx) => `${idx + 1}. ${a.type} ${a.target || ''} ${a.value ? `"${a.value}"` : ''}`.trim())
            .join('\n'),
          evidenceRefs: `${testCase.executionId}_step_${failedStepIndex}.png`,
          consoleErrors: consoleLogs.length > 0 ? JSON.stringify(consoleLogs) : null,
          networkErrors: networkErrors.length > 0 ? JSON.stringify(networkErrors) : null,
          rootCauseHypothesis: failureErrorMessage?.includes('Timeout')
            ? 'Element not found or page took longer than expected to render'
            : 'Assertion value did not match expected application state',
          groupKey: `${testCase.featureName}:${failedAction.type}:${failedAction.target || ''}`,
        };

        await reportBugFinding(job.runId, bugFinding);
      }

      await context.close().catch(() => {});
    }

    // 6. Finalize run
    console.log(`[Worker] Test run ${job.runId} completed. Finalizing...`);
    await finalizeRun(job.runId);
  } catch (error: any) {
    console.error(`[Worker] Unhandled error during job processing:`, error);
    await updateRunStatus(
      job.runId,
      'FAILED',
      error.message || 'Worker encountered an unexpected error during execution'
    ).catch(() => {});
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (appProcess) {
      console.log('[Worker] Stopping application process...');
      await killProcess(appProcess);
    }
  }
}

async function startWorker(): Promise<void> {
  console.log('====================================');
  console.log('  AutoQA Playwright Test Worker     ');
  console.log('====================================');
  console.log(`API URL: ${process.env.AUTOQA_API_URL || 'http://localhost:8081'}`);
  console.log('Waiting for test jobs...');

  while (!isShuttingDown) {
    try {
      const job = await pollForJob();
      if (job) {
        await processJob(job);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error('[Worker] Polling loop error:', error);
      await sleep(5000);
    }
  }

  console.log('[Worker] Worker terminated cleanly.');
}

startWorker();
