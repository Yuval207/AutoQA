import { chromium, Browser } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as net from 'net';
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

try {
  fs.writeFileSync(workerLogPath, '');
  fs.writeFileSync(appLogPath, '');
} catch {}

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

function isPortInUse(port: number): Promise<boolean> {
  const probe = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host });
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean));
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function isViteProject(dir: string): boolean {
  if (['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'].some((f) => fs.existsSync(path.join(dir, f)))) {
    return true;
  }
  try {
    return fs.readFileSync(path.join(dir, 'package.json'), 'utf8').includes('"vite"');
  } catch {
    return false;
  }
}

// Static servers (serve, http-server, python -m http.server...) take the port as a CLI arg and ignore PORT,
// so when the configured port is reassigned the hard-coded value in the command must follow
function remapCommandPort(command: string, fromPort: number, toPort: number): string {
  if (fromPort === toPort) return command;
  return command.replace(new RegExp(`(?<![\\d.])${fromPort}(?!\\d)`, 'g'), String(toPort));
}

// Turns raw startup logs into a specific reason instead of a generic "did not start" message
function describeStartupFailure(rawLogs: string, expectedPort: number, healthUrl: string, stillRunning: boolean): string {
  const logs = rawLogs.replace(/\x1b\[[0-9;]*m/g, '');
  const firstMatch = (re: RegExp) => logs.match(re)?.[0]?.trim().slice(0, 200);

  const listenedPorts = [...logs.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]):(\d{2,5})/g)]
    .map((m) => Number(m[1]))
    .filter((p) => p !== expectedPort);
  if (listenedPorts.length > 0 && !logs.includes(`:${expectedPort}`)) {
    return `App started on port ${listenedPorts[0]}, but AutoQA was waiting on port ${expectedPort} (${healthUrl}). ` +
      `The startup command hard-codes its port or ignores the PORT env variable; make it listen on $PORT / the project's configured port.`;
  }

  const addrInUse = firstMatch(/EADDRINUSE[^\n]*/);
  if (addrInUse) return `App could not bind its port: ${addrInUse}`;

  const missingModule = firstMatch(/(?:Cannot find module|Cannot find package|ERR_MODULE_NOT_FOUND)[^\n]*/);
  if (missingModule) return `App crashed on startup: ${missingModule}. Dependencies are missing or the install command did not run.`;

  const notRecognized = firstMatch(/'[^']+' is not recognized as an internal or external command|command not found[^\n]*/);
  if (notRecognized) return `Startup command failed: ${notRecognized}`;

  const exitMatch = logs.match(/\[Process Exited\][^\n]*code=(\d+)/);
  if (!stillRunning || exitMatch) {
    const errorLine = firstMatch(/^.*(?:Error|error|ERR!)[^\n]*/m);
    return `App process exited before becoming healthy${exitMatch ? ` (exit code ${exitMatch[1]})` : ''}${errorLine ? `: ${errorLine}` : ''}.`;
  }

  if (!logs.trim()) {
    return `App produced no output and never responded on ${healthUrl} within the startup timeout.`;
  }
  return `App is running but never responded on ${healthUrl} within the startup timeout. Check the health check path and port.`;
}

// Vite ignores PORT and silently shifts to another port when busy, so pin it explicitly
function pinVitePort(command: string, cwd: string, port: number): string {
  const addFlags = (cmd: string) =>
    /--port\b/.test(cmd) ? cmd : cmd.replace(/npm run dev(\s+--(?=\s|$))?/, `npm run dev -- --port ${port} --strictPort`);

  if (/\(\s*cd\s/.test(command)) {
    return command.replace(
      /\(\s*cd\s+("[^"]+"|[^\s&()]+)\s*&&\s*([^()]*?)\s*\)/g,
      (m, dir, rest) => (isViteProject(path.resolve(cwd, dir.replace(/"/g, ''))) ? `(cd ${dir} && ${addFlags(rest)})` : m)
    );
  }
  return isViteProject(cwd) ? addFlags(command) : command;
}

// cmd.exe parentheses don't scope `cd`, so "(cd a && x) && (cd b && y)" breaks on Windows
function toPlatformCommand(command: string): string {
  if (process.platform !== 'win32') return command;
  // cmd.exe doesn't support POSIX inline env assignments like "PORT=4000 npm start"
  command = command.replace(/(^|&&\s*|\(\s*)([A-Za-z_][A-Za-z0-9_]*)=(\S+)\s+/g, (_m, pre, key, val) => `${pre}set "${key}=${val}" && `);
  return command.replace(
    /\(\s*cd\s+("[^"]+"|[^\s&()]+)\s*&&\s*([^()]*?)\s*\)/g,
    (_m, dir, rest) => `(pushd ${dir} && ${rest} && popd)`
  );
}

async function runCommand(command: string, cwd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(toPlatformCommand(command), {
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
): { processes: ChildProcess[]; getLog: () => string; isAlive: () => boolean } {
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
  const compatPath = candidateCompats.find((p) => fs.existsSync(p))?.replace(/\\/g, '/');
  let nodeOptions = process.env.NODE_OPTIONS || '';
  if (compatPath && !nodeOptions.includes(compatPath)) {
    // NODE_OPTIONS treats backslashes as escapes, so forward slashes are required on Windows
    nodeOptions = `${nodeOptions} -r "${compatPath}"`.trim();
    console.log(`[Worker] Preloading compatibility polyfill: ${compatPath}`);
  }

  const startBanner = `\n--- [${new Date().toISOString()}] Starting Application: ${effectiveCommand} (cwd: ${cwd}) ---\n`;
  try {
    fs.appendFileSync(appLogPath, startBanner);
  } catch {}

  const appendLog = (text: string) => {
    logBuffer += text;
    if (logBuffer.length > 50000) {
      logBuffer = logBuffer.substring(logBuffer.length - 50000);
    }
    try {
      fs.appendFileSync(appLogPath, text);
    } catch {}
  };

  // cmd.exe runs "a & b" sequentially, so long-running services must be spawned separately
  const parts = process.platform === 'win32' ? splitTopLevelAmpersand(effectiveCommand) : [effectiveCommand];
  let running = parts.length;

  const children = parts.map((part) => {
    const child = spawn(toPlatformCommand(part), {
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

    child.on('exit', (code, signal) => {
      running--;
      appendLog(`\n[Process Exited] (${part}) code=${code}, signal=${signal}\n`);
    });

    child.on('error', (err) => {
      console.error(`[Worker] App process error: ${err.message}`);
      appendLog(`\n[Process Error] ${err.message}\n`);
    });

    child.stdout?.on('data', (data) => appendLog(data.toString()));
    child.stderr?.on('data', (data) => appendLog(data.toString()));
    return child;
  });

  return {
    processes: children,
    getLog: () => logBuffer,
    isAlive: () => running > 0,
  };
}

function splitTopLevelAmpersand(command: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = '';
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === '(') depth++;
    else if (!inQuote && ch === ')') depth--;
    if (!inQuote && depth === 0 && ch === '&' && command[i - 1] !== '&' && command[i + 1] !== '&') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

function killProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || !child.pid) {
      resolve();
      return;
    }

    // shell:true on Windows wraps the app in cmd.exe; kill the whole tree so ports are released
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']).on('close', () => resolve()).on('error', () => resolve());
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

function hasFreshNodeModules(dir: string): boolean {
  const modules = path.join(dir, 'node_modules');
  const pkg = path.join(dir, 'package.json');
  if (!fs.existsSync(modules) || !fs.existsSync(pkg)) return false;
  // npm writes this marker on every successful install; reinstall only if package.json changed since
  const marker = path.join(modules, '.package-lock.json');
  if (!fs.existsSync(marker)) return false;
  return fs.statSync(marker).mtimeMs >= fs.statSync(pkg).mtimeMs;
}

// Drops npm install segments whose dependencies are already installed, and adds faster npm flags
function optimizeInstallCommand(command: string, cwd: string): string | null {
  const fastNpm = (cmd: string) =>
    cmd.replace(/\bnpm (install|i)\b(?![^&)]*--no-audit)/g, 'npm install --no-audit --no-fund --prefer-offline');

  const segmentRe = /\(\s*cd\s+("[^"]+"|[^\s&()]+)\s*&&\s*([^()]*?)\s*\)/g;
  const onlySegments = command.replace(segmentRe, '').replace(/&&/g, '').trim() === '';
  if (onlySegments) {
    const kept: string[] = [];
    for (const m of command.matchAll(segmentRe)) {
      const dir = path.resolve(cwd, m[1].replace(/"/g, ''));
      if (/\bnpm (install|i|ci)\b/.test(m[2]) && hasFreshNodeModules(dir)) {
        console.log(`[Worker] Dependencies already installed in '${m[1]}', skipping install`);
        continue;
      }
      kept.push(fastNpm(m[0]));
    }
    return kept.length > 0 ? kept.join(' && ') : null;
  }

  if (/^\s*npm (install|i|ci)\b/.test(command) && hasFreshNodeModules(cwd)) {
    console.log('[Worker] Dependencies already installed, skipping install');
    return null;
  }
  return fastNpm(command);
}

async function processJob(job: WorkerJob): Promise<void> {
  console.log(`[Worker] Starting job for run ${job.runId}`);
  let appProcesses: ChildProcess[] = [];
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
      installCmd = optimizeInstallCommand(installCmd, workDir);
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
    let appPort = job.port;
    if (job.startupCommand && (await isPortInUse(appPort))) {
      const freePort = await getFreePort();
      console.warn(`[Worker] Port ${appPort} is already in use by another process (e.g. AutoQA itself). Running app under test on port ${freePort} instead.`);
      appPort = freePort;
    }
    let appUrl = `http://localhost:${appPort}`;
    let effectiveStartupCommand = job.startupCommand;
    if (job.startupCommand) {
      const startupCommand = pinVitePort(remapCommandPort(job.startupCommand, job.port, appPort), workDir, appPort);
      effectiveStartupCommand = startupCommand;
      console.log(`[Worker] Starting application with command: ${startupCommand}`);
      await updateRunStatus(job.runId, 'STARTING_ENVIRONMENT', undefined, 'Starting application server...');

      let envVars: Record<string, string> = { PORT: String(appPort) };
      if (job.environmentVariables) {
        try {
          envVars = { ...envVars, ...JSON.parse(job.environmentVariables) };
        } catch {
          // Ignored
        }
      }
      if (appPort !== job.port) envVars.PORT = String(appPort);

      const started = startApplication(startupCommand, workDir, envVars);
      appProcesses = started.processes;
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
          describeStartupFailure(logs, appPort, healthUrl, started.isAlive()),
          logs.substring(0, 5000)
        );
        return;
      }
    }

    await updateAppUrl(job.runId, appUrl);
    await updateRunStatus(job.runId, 'RUNNING_TESTS');
    console.log(`[Worker] Application ready at ${appUrl}. Launching Playwright browser...`);

    // Fullstack profiles start the backend with an inline PORT=xxxx; API scenarios must hit that, not the UI
    const backendPortMatch = effectiveStartupCommand?.match(/\bPORT=(\d+)/);
    const apiBaseUrl = backendPortMatch && Number(backendPortMatch[1]) !== appPort
      ? `http://localhost:${backendPortMatch[1]}`
      : appUrl;
    console.log(`[Worker] API requests will target ${apiBaseUrl}`);

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

      const executor = new ActionExecutor(page, appUrl, job.artifactsPath, job.runId, apiBaseUrl);
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

      // Older generated plans encode backend endpoints as browser navigation; run them as real HTTP calls
      let expectedOutcomesJson = testCase.expectedOutcomes;
      const endpointMatch = testCase.scenarioName.match(/^Verify (GET|POST|PUT|PATCH|DELETE) (\S+) endpoint$/i);
      if (endpointMatch && !actions.some((a) => a.type === 'API_REQUEST')) {
        actions = [{ type: 'API_REQUEST', value: endpointMatch[1].toUpperCase(), target: endpointMatch[2] }];
        expectedOutcomesJson = JSON.stringify([{ description: 'status < 500', source: 'AI_INFERRED' }]);
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
      if (testPassed && expectedOutcomesJson) {
        let expectedOutcomes: Array<{ description: string; source: string }> = [];
        try {
          expectedOutcomes = JSON.parse(expectedOutcomesJson);
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

        const isApi = failedAction.type === 'API_REQUEST';
        const failedStep = stepResults.find((s) => s.stepIndex === failedStepIndex);
        const bugFinding: BugFinding = {
          executionId: testCase.executionId,
          title: isApi
            ? `${failedAction.value} ${failedAction.target} returned a server error`
            : `Failure in ${testCase.scenarioName}: ${failedAction.type} failed`,
          description: failureErrorMessage || `Step ${failedStepIndex} (${failedAction.type}) failed during execution`,
          severity: failedAction.type === 'NAVIGATE' ? 'CRITICAL' : 'HIGH',
          category: isApi ? 'API_ERROR' : failedAction.type.startsWith('ASSERT') ? 'FUNCTIONAL_REGRESSION' : 'UI_INTERACTION',
          featureName: testCase.featureName,
          scenarioName: testCase.scenarioName,
          failedStep: `Step ${failedStepIndex}: ${failedAction.type} on "${failedAction.target || ''}"`,
          expectedBehaviour: failedStep?.expectedValue || failedAction.value || failedAction.description || 'Action should succeed and assertions should pass',
          actualBehaviour: failedStep?.actualValue || failureErrorMessage || 'Step failed or timed out',
          reproductionSteps: actions
            .slice(0, failedStepIndex)
            .map((a, idx) =>
              a.type === 'API_REQUEST'
                ? `${idx + 1}. ${a.value} ${apiBaseUrl}${a.target}`
                : `${idx + 1}. ${a.type} ${a.target || ''} ${a.value ? `"${a.value}"` : ''}`.trim()
            )
            .join('\n'),
          evidenceRefs: `${testCase.executionId}_step_${failedStepIndex}.png`,
          consoleErrors: !isApi && consoleLogs.length > 0 ? JSON.stringify(consoleLogs) : null,
          networkErrors: networkErrors.length > 0 ? JSON.stringify(networkErrors) : null,
          rootCauseHypothesis: await executor.diagnoseFailure(failureErrorMessage),
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
    if (appProcesses.length > 0) {
      console.log('[Worker] Stopping application process...');
      await Promise.all(appProcesses.map(killProcess));
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
