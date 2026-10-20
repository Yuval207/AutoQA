# AutoQA Architecture & Design Specification

## System Overview

AutoQA is constructed as a decoupled, multi-tier system composed of four primary subsystems:

1. **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS with dark-mode aesthetic, SSE live event subscription, and evidence viewer.
2. **Backend**: Spring Boot 3.2 (Java 17) REST API with JWT security, JPA/Hibernate, Flyway database migrations, and SSE broadcasting.
3. **Execution Worker**: Playwright + TypeScript runner that polls the backend, manages child application processes, drives headless browser sessions, and collects visual evidence.
4. **Target Sandbox**: The application under test, isolated in local workspace storage and executed on assigned network ports.

---

## Detailed Component Architecture

### 1. Repository Ingestion & Analysis Engine
- **Zip Decompression Guard**: Enforces Zip Slip prevention by validating canonical paths against target directory root.
- **Repository Analyzer**: Inspects `package.json`, `pom.xml`, `requirements.txt`, and file hierarchies to automatically identify:
  - Framework: React, Next.js, Vite, Vue, Angular, Express, Node.
  - Package manager: `npm`, `yarn`, `pnpm`.
  - Startup commands: `npm run dev`, `npm start`, `node server.js`.
  - Recommended ports & health check paths.

### 2. Feature Parser & Test Plan Generator
- Converts Gherkin/Markdown feature files into structured `Feature` and `TestScenario` records.
- Transforms natural language action lines into strongly-typed action objects:
  - `NAVIGATE`: Target URL resolution.
  - `CLICK`: Text, button role, and selector resolution.
  - `FILL`: Input label, placeholder, and attribute locators.
  - `SELECT`, `CHECK`, `UNCHECK`, `SUBMIT`: Form control interactions.
  - `ASSERT_TEXT`, `ASSERT_VISIBLE`: Explicit DOM verification.
- Enforces scenario approval before test execution.

### 3. Execution Orchestrator & Worker Protocol
- Test run state transitions:
  - `QUEUED` ➔ `PREPARING` ➔ `STARTING_ENVIRONMENT` ➔ `RUNNING_TESTS` ➔ `COMPLETED` / `FAILED`.
- Communication Protocol:
  - Worker issues `GET /api/worker/poll`.
  - On receiving a job, worker marks status `STARTING_ENVIRONMENT`, spawns the app process, and polls the health check URL.
  - Worker marks status `RUNNING_TESTS`, launches Playwright Chromium, and runs scenario test cases.
  - For each step, executor collects step duration, screenshots on key actions and failures, console logs, and network errors.
  - Failed steps automatically generate a `BugFindingReport` containing reproduction steps, hypothesis, and evidence references.
  - Worker invokes `POST /api/worker/runs/{runId}/finalize`.

### 4. Telemetry Streaming (SSE)
- Spring Boot `SseEmitter` maintains persistent client connections to `/api/runs/{runId}/events`.
- Emits real-time state change events, step completion notifications, and newly discovered bug alerts.
- Frontend smoothly updates without requiring full-page reloads.

### 5. Artifact Storage
- Screenshots and execution logs are stored with SHA-256 / UUID filenames in isolated directory trees.
- Served through `/api/artifacts/{runId}/{filename}` with path normalization and traversal prevention.
