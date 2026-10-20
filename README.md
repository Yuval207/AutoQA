# AutoQA — Autonomous End-to-End Application Testing Platform

AutoQA is an autonomous software testing platform that accepts a source-code repository and a feature specification, launches the application in an isolated environment, generates and executes end-to-end tests, detects failures, collects visual & diagnostic evidence, and produces actionable bug reports.

![AutoQA Dashboard Preview](https://img.shields.io/badge/AutoQA-v0.1.0-6366f1)
![Spring Boot](https://img.shields.io/badge/Backend-Spring%20Boot%203.2-brightgreen)
![Playwright](https://img.shields.io/badge/Runner-Playwright%20TypeScript-blue)
![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61dafb)

---

## Key Capabilities

1. **Repository Ingestion & Safe Extraction**
   - Upload any web application source code as a `.zip` archive.
   - Guarded by Zip Slip protection, directory traversal mitigation, and disk quota enforcement.
   - Automatically detects framework (React, Next.js, Vite, Vue, Angular, Express, Node, etc.), package manager (`npm`, `yarn`, `pnpm`), and recommended startup scripts.

2. **Feature Specification Parsing & Test Plan Generation**
   - Ingests markdown feature specifications (`# Feature: ...`, `## Scenario: ...`, `- Open /`, `- Enter ...`, `- Click ...`, `- Expected: ...`).
   - Translates human-readable test steps into typed Playwright browser actions (`NAVIGATE`, `CLICK`, `FILL`, `SELECT`, `ASSERT_TEXT`, `ASSERT_VISIBLE`).
   - Categorizes scenarios (Positive, Negative, Boundary) with confidence and priority ratings.
   - Human-in-the-loop scenario review and approval workflow.

3. **Autonomous Execution & Environment Management**
   - Provisions an isolated child process running the target application server.
   - Performs proactive HTTP health checks (`/health` or `/`) with configurable startup timeouts.
   - Dispatches headless Playwright browser workers with viewport management, console error capture, and network monitoring.

4. **Real-time Telemetry & Evidence-backed Bug Reports**
   - Live execution progress stream via Server-Sent Events (SSE).
   - Step-by-step trace showing action status, execution latency, and full-resolution screenshot captures.
   - Automatic defect identification when DOM assertions fail or unhandled client-side exceptions occur.
   - Generates actionable Bug Finding reports including:
     - Failure severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and category.
     - Side-by-side Expected vs Actual behavior.
     - Reproducible step sequence.
     - Captured evidence screenshot preview.
     - Console error logs and failed network request traces.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │             React Frontend             │
                      │   (Dashboard, Test Plan, Telemetry)    │
                      └───────────────────▲────────────────────┘
                                          │ REST & SSE
                                          ▼
                      ┌────────────────────────────────────────┐
                      │        Spring Boot Backend API         │
                      │  - JWT Auth & Project Management       │
                      │  - Repo Analysis & Zip Decompression   │
                      │  - Feature Parsing & Plan Generator    │
                      │  - Run Orchestration & SSE Broadcaster │
                      └───────▲────────────────────────▲───────┘
                              │                        │
                   PostgreSQL │                        │ Poll & Report
                              ▼                        ▼
                      ┌───────────────┐        ┌───────────────────────┐
                      │  PostgreSQL   │        │   Playwright Worker   │
                      │  Persistence  │        │   (Node TypeScript)   │
                      └───────────────┘        └───────────┬───────────┘
                                                           │ Drives Headless Browser
                                                           ▼
                                               ┌───────────────────────┐
                                               │   Target Demo App     │
                                               │  (Isolated Sandbox)   │
                                               └───────────────────────┘
```

---

## Quickstart Guide

### Prerequisites
- Docker & Docker Compose
- Java 17+ & Maven
- Node.js 18+ & npm

### 1. Start PostgreSQL
```bash
docker-compose up -d postgres
```

### 2. Run Spring Boot Backend
```bash
cd backend
mvn spring-boot:run
```
Backend runs on `http://localhost:8080` (API documentation at `http://localhost:8080/swagger-ui.html`).

### 3. Run Playwright Test Worker
```bash
cd worker
npm install
npx playwright install chromium
npm run dev
```
Worker starts and continuously polls the backend for pending test execution jobs.

### 4. Run React Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

---

## Verifying with Demo Fixture

A pre-packaged demo app with working and broken features is included in `demo-app/`.

1. Open `http://localhost:5173`.
2. Click **"Sign In with Demo Account"** (or register a new user).
3. On the Dashboard, click **"Launch Demo Fixture"**.
4. The system automatically creates a project, configures the environment, and uploads `features.md`.
5. Review the parsed scenarios:
   - *Successful login* (Positive)
   - *Invalid credentials error* (Negative)
   - *Add a new task* (Positive)
   - *Toggle task completion* (Positive)
   - *Apply valid discount coupon* (Positive)
   - *Apply promotional discount code* (Broken feature that triggers client exception and assertion failure!)
6. Click **"Trigger Test Run"** and watch the live telemetry stream!
7. Once finished, inspect the discovered defect report with screenshot evidence and root-cause diagnostic.
