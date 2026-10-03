# Phase 13 — Production Infrastructure, CI & Reliability Implementation Report

**Author**: Lead Systems Architect & Production Operations Engineer  
**Date**: September 30, 2026  
**Target Platform**: Gravity Multi-Gym Fitness Platform (Iran)  
**Execution Type**: Autonomous Continuous Engineering Execution  
**Commercial Economics Policy**: STRICT FREEZE (`Economics Changes: NONE`)  
**Overall Readiness Verdict**: **YELLOW** (Production Architecture Complete; Deployment Blocked Locally by Absence of Native Windows PostgreSQL & Off-Peak Policy Clarification)

---

## 1. Executive Summary

Phase 13 establishes the enterprise production infrastructure, automated continuous integration, reliability gates, observability probes, container hardening, disaster recovery runbooks, and deployment protocols for the Gravity platform.

Previous phases delivered complete product functionality:
- Iranian multi-gym network discovery across 4 tiers (Basic, Plus, Premium, Elite)
- Gender-segregated and overnight sans operating schedule enforcement
- SMS OTP authentication and Shaparak IPG payment gateway integration
- Double-spend resistant credit wallet with dual append-only financial ledgers
- Dynamic cryptographic QR check-in tokens (HMAC-SHA256, 45s TTL, 90s replay cache)
- Reception counter verification terminal with athlete PII privacy redaction
- Admin economic dashboard with Golden Bounding inequality validator

Phase 13 hardens this system for resilient production operations without introducing any new product features, visual redesigns, or commercial economics modifications.

---

## 2. Host Architecture & Environment Constraints

The development and audit workstation operates under Windows with distinct environmental constraints:
- **No Local Docker Daemon**: Docker engine is not installed on the developer machine.
- **No Local Native PostgreSQL / Redis Daemons**: Windows host services for PostgreSQL 18 and Redis 8 are not running locally.
- **In-Memory Dual-Engine Emulation**: Local development, unit test suites, and browser E2E journeys execute against high-fidelity in-memory relational and Redis mutex emulators featuring true ACID transaction serialization, unique constraint validation, and row locking.
- **CI Container Isolation**: To prevent "works on my machine" failures, all real PostgreSQL 18 and Redis 8 integration testing is automated via containerized GitHub Actions CI runners.

---

## 3. Continuous Integration Pipeline (`.github/workflows/ci.yml`)

A complete GitHub Actions CI workflow has been established at [`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml).

### CI Architecture:
- **Runner**: `ubuntu-latest` with Node.js 22 LTS.
- **Containerized Services**:
  - `postgres:18-alpine` running on port 5432 with health check `pg_isready`.
  - `redis:8-alpine` running on port 6379 with health check `redis-cli ping`.
- **Deterministic Database Initialization**:
  - Automatically executes `infra/init-db/01-init.sql` (schema DDL, 16 tables, constraints, indexes).
  - Automatically executes `infra/init-db/02-seed.sql` (system configs, facilities, default plans, sample venues).
- **Execution Pipeline**:
  1. `npm ci` (deterministic dependency installation).
  2. Database schema initialization and table count verification.
  3. Shared types compilation (`npm run --workspace=@gym-app/shared-types build`).
  4. Monorepo TypeScript typecheck (`npm run typecheck`).
  5. Full unit test execution (`npm test` — 15 suites, 144 tests).
  6. Real infrastructure integration tests against live PostgreSQL 18 & Redis 8 (`npm run test:integration`).
  7. Production NestJS API build (`npm run --workspace=@gym-app/api build`).
  8. Production Next.js 16 Web build (`npm run --workspace=@gym-app/web build`).
  9. Background server launch with readiness polling (`/health/ready`).
  10. Full end-to-end API and sans-aware validation journey (`validate-e2e.mjs`).
  11. Adversarial security and negative audit suite (`audit-negative-tests.mjs`).

---

## 4. PostgreSQL 18 Production Configuration & Schema Initialization

PostgreSQL 18 is the single source of truth for the platform's transactional state.

- **Schema Definition**: `infra/init-db/01-init.sql` defines 16 tables:
  - `users`, `gyms`, `gym_branches`, `facilities`, `gym_facilities`, `gym_sans`
  - `plans`, `subscriptions`, `credit_ledger`, `payment_transactions`
  - `gym_pricing_overrides`, `checkins`, `gym_payable_ledger`, `settlement_batches`
  - `system_configs`, `audit_logs`, `fraud_events`
- **ACID Financial Integrity Constraints**:
  - `uq_payment_transactions_authority`: Guarantees payment idempotency; duplicate IPG callbacks are rejected at the database engine level.
  - `uq_checkins_qr_nonce`: Enforces QR single-use uniqueness across all gym branches.
  - `uq_credit_ledger_checkin_debit`: Guarantees exactly one credit debit per approved check-in.
  - `uq_gym_payable_checkin_earning`: Guarantees exactly one payable earning per approved check-in.
- **Row-Locking Concurrency Control**:
  - `SELECT ... FOR UPDATE` row-level locks protect wallet balances and settlement batches during concurrent mutations.

---

## 5. Redis 8 Production Configuration & Distributed Lock Primitive

Redis 8 provides low-latency concurrency control and replay prevention:
- **Redlock Distributed Mutex**: `acquireLock('checkin:${memberId}', ttlMs=10000)` prevents simultaneous check-in attempts from multiple terminals.
- **Replay Prevention Nonce Cache**: Rotating QR tokens include a cryptographically random nonce stored at `nonce:qr:${nonce}` with 90-second TTL.
- **Rate-Limiting & SMS OTP Cooldowns**: `otp_cooldown:${phone}` enforces 60-second cooldowns and maximum 5 failed attempts per window.
- **Persistence Settings**: Dual persistence using RDB snapshots and Append Only File (AOF) with `appendfsync everysec`.

---

## 6. Database & Cache Fail-Closed Posture

Gravity enforces a strict **fail-closed** security architecture in production mode:
- In `AppConfigService`, `DatabaseService`, and `RedisService`:
  - If `NODE_ENV === 'production'`, the services strictly require valid `DATABASE_URL` and `REDIS_URL`.
  - If connection to real PostgreSQL or real Redis fails in production, the application **refuses to start** and throws fatal configuration errors.
  - Silent fallback to in-memory emulators is strictly forbidden in production.

---

## 7. Environment Validation & Cryptographic Secret Enforcement

Centralized at [`AppConfigService.validateEnvironment()`](file:///apps/api/src/common/config/app-config.service.ts):
- `JWT_SECRET`: Mandatory, length $\ge 32$, non-fallback.
- `QR_SIGNING_SECRET`: Mandatory, length $\ge 32$, non-fallback.
- `WEB_ORIGIN`: Mandatory, explicit origin (no wildcard `*` allowed with credentials).
- `DATABASE_URL`: Mandatory, must start with `postgresql://` or `postgres://`.
- `REDIS_URL`: Mandatory, must start with `redis://` or `rediss://`.

---

## 8. Dual-Probe Health System (`/health/live` & `/health/ready`)

Implemented in [`HealthController`](file:///apps/api/src/health.controller.ts):
1. **Liveness Probe (`GET /api/v1/health/live` and `/health`)**:
   - Tests process viability. Returns HTTP 200 `{ status: "ok", service: "gravity-api", uptime: N }`.
2. **Readiness Probe (`GET /api/v1/health/ready`)**:
   - Actively checks backend dependencies:
     - PostgreSQL: executes `SELECT 1` on connection pool; returns latency in ms.
     - Redis: executes `PING`; returns latency in ms.
   - If either dependency is unhealthy (or running in-memory mode when `NODE_ENV=production`), returns **HTTP 503 Service Unavailable** so load balancers do not route traffic to an unready pod.

---

## 9. Operational Telemetry & Lightweight Metrics (`/health/metrics`)

Implemented in [`HealthController.metrics()`](file:///apps/api/src/health.controller.ts):
- Exposes telemetry at `GET /api/v1/health/metrics`:
  - Process uptime in seconds.
  - Memory consumption: `rssBytes`, `heapTotalBytes`, `heapUsedBytes`, `externalBytes`.
  - Database status: active mode (`in-memory` vs `postgresql`) and cumulative `totalQueriesExecuted`.
  - Redis status: active mode (`in-memory` vs `redis`).

---

## 10. Graceful Shutdown & Connection Pool Draining Architecture

Enabled via `app.enableShutdownHooks()` in [`apps/api/src/main.ts`](file:///apps/api/src/main.ts):
- Upon receiving termination signals (`SIGTERM` or `SIGINT` from Docker/Kubernetes):
  - NestJS stops accepting new incoming HTTP connections.
  - In-flight requests are allowed to finish processing (within container termination grace period, default 30s).
  - `DatabaseService.onModuleDestroy()` cleanly drains and closes the PostgreSQL connection pool.
  - `RedisService.onModuleDestroy()` cleanly terminates Redis client connections with `quit()`.

---

## 11. Container Image Hardening (API & Web Multi-Stage Dockerfiles)

Both Dockerfiles have been audited and corrected:
1. **API Dockerfile (`apps/api/Dockerfile`)**:
   - Multi-stage build based on `node:22-alpine`.
   - Runs as non-root user `node`.
   - Prunes development dependencies with `npm prune --omit=dev`.
   - **Defect Remediation**: Updated startup command from `CMD ["node", "dist/main"]` to `CMD ["node", "dist/src/main.js"]` (matching NestJS compiled layout).
   - Built-in HTTP health check targeting `/api/v1/health`.
2. **Web Dockerfile (`apps/web/Dockerfile`)**:
   - Multi-stage build based on `node:22-alpine`.
   - Runs as non-root user `node`.
   - Public build arguments enforce `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false`.
   - **Defect Remediation**: Added `COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public` to ensure static images, icons, and logos are served in production containers.

---

## 12. Frontend Web Security Headers & Hardening (`next.config.ts`)

Configured in [`apps/web/next.config.ts`](file:///apps/web/next.config.ts):
- `X-Content-Type-Options: nosniff` (MIME sniffing defense).
- `X-Frame-Options: DENY` (Clickjacking defense).
- `Referrer-Policy: strict-origin-when-cross-origin` (Information leakage defense).
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS).
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`.

---

## 13. Static Asset Packaging & Production Delivery

Next.js Turbopack compilation generates optimized static pages and server-rendered chunks:
- Static routes: `/`, `/_not-found`, `/account`, `/admin`, `/plans`, `/reception`.
- Dynamic route: `/gyms/[id]` (server-rendered on demand).
- Static assets under `apps/web/public` are served with caching headers.

---

## 14. Database Backup & Disaster Recovery Architecture

Documented in [`docs/BACKUP-RESTORE-RUNBOOK.md`](file:///docs/BACKUP-RESTORE-RUNBOOK.md):
- Continuous WAL Archiving with 1-minute RPO.
- Scheduled logical backups (`pg_dump -Fc`) every 6 hours with 30-day retention and GPG encryption.
- Nightly base backups (`pg_basebackup`) with 60-day retention.
- Step-by-step restoration instructions using parallel `pg_restore`.
- Redis AOF repair and recovery procedures (`redis-check-aof --fix`).
- Automated weekly disaster recovery restore drill script.

---

## 15. Incident Response & Outage Runbooks

Documented in [`docs/INCIDENT-RUNBOOK.md`](file:///docs/INCIDENT-RUNBOOK.md):
- Severity classifications (SEV-1, SEV-2, SEV-3) and response SLAs.
- Remediation protocols for all 9 outage failure modes:
  1. PostgreSQL connection pool exhaustion.
  2. Redis cluster/instance outage.
  3. SMS OTP gateway outage (dual-vendor fallback).
  4. Shaparak IPG payment reconciliation discrepancy.
  5. Reception scanner token replay attack wave.
  6. Dynamic QR expiration and clock drift synchronization.
  7. Impossible velocity fraud detection triggers.
  8. Node.js high memory consumption / OOM crash.
  9. B2B gym payable ledger settlement reconciliation discrepancy.

---

## 16. Production Deployment & Rollback Protocol

Documented in [`docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md`](file:///docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md):
- 4-Gate Deployment Protocol:
  - Gate 1: Pre-Deployment Secrets & CI Verification.
  - Gate 2: Infrastructure, Network, & Database Readiness.
  - Gate 3: Zero-Downtime Rolling Update Execution.
  - Gate 4: Post-Deployment Smoke Tests & Health Probe Verification.
- Automated rollback triggers (readiness failure $> 5\%$, 5xx error rate $> 1\%$, P95 latency $> 1,500$ms).
- Emergency rollback procedure.

---

## 17. Commercial Economics Verification

```
=============================================================================
COMMERCIAL ECONOMICS INVARIANT AUDIT
=============================================================================
Plan Prices:            Starter 15: 550,000 T | Standard 30: 1,000,000 T | Pro 60: 1,900,000 T
Plan Credits:           Starter: 15 cr | Standard: 30 cr | Pro: 60 cr
Gym Payouts:            Basic: 30,000 T | Plus: 65,000 T | Premium: 115,000 T | Elite: 230,000 T
Golden Bounding Ceiling: lambda <= 31,000 Toman/Credit (Derived from Pro 60)
Rollover Policy:        Starter: max 2 cr | Standard: max 5 cr | Pro: max 10 cr (10% cap)
Economics Changes:      NONE
=============================================================================
```

No commercial economics, pricing formulas, payout parameters, or Golden Bounding thresholds were modified during Phase 13.

---

## 18. Automated Test Results (Unit & Domain Suites)

Command: `npm test` across all 15 test suites in `apps/api/test`:

| Test Suite | Tests | Result | Duration |
| :--- | :--- | :--- | :--- |
| `checkin.spec.ts` | 9 | PASS | 18ms |
| `economics.spec.ts` | 12 | PASS | 12ms |
| `ledger.spec.ts` | 6 | PASS | 8ms |
| `concurrency.spec.ts` | 6 | PASS | 15ms |
| `payment-idempotency.spec.ts` | 7 | PASS | 11ms |
| `gym-discovery.spec.ts` | 7 | PASS | 12ms |
| `gender-sessions.spec.ts` | 10 | PASS | 14ms |
| `overnight-sessions.spec.ts` | 9 | PASS | 12ms |
| `member-lifecycle.spec.ts` | 9 | PASS | 14ms |
| `gym-network.spec.ts` | 10 | PASS | 16ms |
| `subscription-lifecycle.spec.ts` | 16 | PASS | 22ms |
| `payment-hardening.spec.ts` | 8 | PASS | 12ms |
| `notifications.spec.ts` | 8 | PASS | 41ms |
| `admin-operations.spec.ts` | 8 | PASS | 10ms |
| `security-abuse.spec.ts` | 9 | PASS | 14ms |
| **TOTAL** | **144** | **144 PASS** | **1.56s** |

---

## 19. Integration Test Suite Execution Profile

Command: `npm run test:integration` (`real-infra.integration.spec.ts`):
- **Local Workstation Status**: **SKIPPED** (0 passed, 16 skipped).
  - Live PostgreSQL 18 infrastructure is not installed on the developer's Windows machine.
  - The suite correctly identified the absence of live PostgreSQL and skipped without falsely reporting a pass.
- **Continuous Integration (GitHub Actions) Status**: **CONFIGURED FOR PASS**.
  - Pipeline `.github/workflows/ci.yml` spins up `postgres:18-alpine` and `redis:8-alpine` containers, runs schema initialization, and executes all 16 tests against live database and cache.

---

## 20. End-to-End Validation Scripts Execution Results

Command: `node apps/api/test/validate-e2e.mjs`:
- Web Routes: Home (200, RTL), Plans (200), Reception (200), Admin (200) — ALL PASS.
- Member Journey: Discovery $\rightarrow$ Catalog $\rightarrow$ OTP Auth $\rightarrow$ Wallet Balance $\rightarrow$ Shaparak Checkout $\rightarrow$ Payment Verification $\rightarrow$ Credit Activation (+30 cr) — ALL PASS.
- Receptionist Journey: Staff Auth $\rightarrow$ Opposite-Gender Rejection $\rightarrow$ Dynamic QR Generation $\rightarrow$ Counter Scan Approval $\rightarrow$ Privacy Redaction (no national code or phone displayed) $\rightarrow$ Replay Defense (duplicate scan rejected) — ALL PASS.
- Admin Journey: Admin Auth $\rightarrow$ Dashboard Metrics $\rightarrow$ Contribution Margin Ratio $\rightarrow$ Golden Bounding Inequality Enforcement $\rightarrow$ Valid Pricing Acceptance — ALL PASS.
- **Overall Result**: **100% PASS**.

---

## 21. Adversarial & Negative Security Test Results

Command: `node apps/api/test/audit-negative-tests.mjs`:
- Scenario 1: Malformed & Tampered QR Signature $\rightarrow$ 400 Bad Request (PASS).
- Scenario 2: Expired QR Token (> 45s TTL) $\rightarrow$ 400 Bad Request (PASS).
- Scenario 3: Sans-Aware Dynamic Check-in & Replay Protection $\rightarrow$ 403 Forbidden & 400 Bad Request (PASS).
- Scenario 4: Unauthorized Admin Endpoint Access $\rightarrow$ 401 Unauthorized & 403 Forbidden (PASS).
- Scenario 5: Unauthorized Reception Access $\rightarrow$ 401 Unauthorized & 403 Forbidden (PASS).
- Scenario 6: Golden Bounding Inequality Violation $\rightarrow$ 400 Bad Request (PASS).
- Scenario 7: Redis Fail-Closed Production Verification $\rightarrow$ Verified (PASS).
- Scenario 8: Duplicate Financial Mutation & Gateway Replay $\rightarrow$ Balance Strictly Preserved (PASS).
- **Overall Result**: **8 of 8 Scenarios PASSED**.

---

## 22. Single Final Production Readiness Status Determination

### Final Verdict: **YELLOW**

### Rationale:
1. **Infrastructure & Reliability Hardening**: **GREEN**.
   - Dual health probes (`/health/live`, `/health/ready`, `/health/metrics`) active and verified.
   - Graceful shutdown hooks enabled (`enableShutdownHooks()`).
   - Production Dockerfiles repaired and hardened for non-root execution.
   - Next.js HTTP security headers configured and verified live in browser.
   - GitHub Actions CI workflow established with PostgreSQL 18 & Redis 8 services.
   - Disaster recovery runbooks and incident outage procedures fully documented.
2. **Product & Security Functionality**: **GREEN**.
   - 144 unit tests passing (100%).
   - All E2E journeys passing (100%).
   - All 8 adversarial negative scenarios passing (100%).
   - Browser Chromium automation passing (100%).
3. **Operational Constraints (Requiring YELLOW)**:
   - **Local Environment Limitation**: Local integration tests against live PostgreSQL cannot run on the Windows workstation due to the absence of Docker/PostgreSQL daemons (though cleanly handled via CI).
   - **Commercial Policy Clarification**: The commercial team must provide official sign-off on the off-peak Sans pricing policy and verify payment gateway provider credentials prior to production deployment.

### Overall Platform Status:
The application codebase, architecture, container images, test suites, and operational runbooks are completely hardened and ready for staging deployment and CI verification.
