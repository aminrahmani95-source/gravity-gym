# Phase 13 — Production Infrastructure, CI & Reliability Audit

**Date**: September 30, 2026  
**Auditor**: Lead Systems Architect & Production Operations Engineer  
**Target**: Gravity Multi-Gym Fitness Platform (Architecture, CI, Infrastructure, Reliability)  
**Status**: Initial Pre-Remediation Infrastructure Audit

---

## 1. Current Infrastructure

The Gravity platform is structured as an npm workspaces monorepo containing:
- `packages/shared-types`: Canonical TypeScript interfaces, DTOs, domain models, and enums.
- `apps/api`: NestJS 11 modular monolith exposing RESTful APIs under `/api/v1`.
- `apps/web`: Next.js 16.3.6 (Turbopack) frontend providing responsive Persian RTL interfaces.
- `infra/`: Docker compose and PostgreSQL initialization SQL scripts.

### Host Platform Limitations
- Host OS: Windows workstation.
- Docker engine is **not installed** locally.
- PostgreSQL and Redis daemons are **not running** as Windows services.
- Local execution relies on the application's in-memory relational engine (with ACID transaction emulation) and in-memory Redis/Redlock emulator.
- While development and unit tests function seamlessly, `npm run test:integration` currently skips because live PostgreSQL is unavailable on `localhost:5432`.

---

## 2. Existing CI Configuration

- **Current State**: `.github/workflows/` does not exist in the repository.
- **Deficiency**: There is currently no automated Continuous Integration pipeline executing pull requests or commits.
- **Risk**: Regressions in TypeScript compilation, unit test suites, integration tests, or production container builds could be committed unnoticed.

---

## 3. Test Architecture

The testing framework uses Vitest (v3.2.7) across `apps/api`:
- **Unit & Domain Specification Suites**: 15 test suites, 144 tests covering authentication, economics, check-in pipeline, payment idempotency, gender scheduling, and rollover lifecycle. All pass 100% green against in-memory engines.
- **Integration Test Suite** (`real-infra.integration.spec.ts`): 16 tests designed specifically to run against live PostgreSQL 18 and Redis (testing ACID rollbacks, concurrent Redlock mutexes, and unique database constraints). Currently skipped on local environments lacking PostgreSQL.
- **E2E Validation Scripts**:
  - `validate-e2e.mjs`: Node.js script testing HTTP flows (Auth $\rightarrow$ Checkout $\rightarrow$ Payment Verification $\rightarrow$ Dynamic QR $\rightarrow$ Receptionist Scan $\rightarrow$ Replay Defense $\rightarrow$ Admin Dashboard).
  - `audit-negative-tests.mjs`: Adversarial attack testing (malformed QR, tampered HMAC, expired tokens, IDOR, and role escalations).
  - `auth-regression.test.mjs`: Headless browser testing of client auth states.
  - `browser-e2e.test.mjs`: Full end-to-end browser journey using Chromium/Edge.

---

## 4. Environment Handling

- Configuration is managed via `apps/api/src/common/config/app-config.service.ts` and `dotenv`.
- In `NODE_ENV = 'production'`, the service strictly validates:
  - `JWT_SECRET`: Mandatory, length $\ge 32$, non-fallback.
  - `QR_SIGNING_SECRET`: Mandatory, length $\ge 32$, non-fallback.
  - `WEB_ORIGIN`: Mandatory, no wildcard `*` allowed with credentials.
- Deficiencies:
  - Missing fine-grained validation for database URLs and Redis URLs when switching to production.
  - Lack of structured schema validation (e.g. Zod or class-validator) for all environment variables at process boot.

---

## 5. Database Setup

- PostgreSQL 18 is the target production engine.
- DDL schema in `infra/init-db/01-init.sql`:
  - 16 relational tables with strict foreign keys, checks, and unique indexes.
  - Dual append-only ledgers: `credit_ledger` (athlete balance) and `gym_payable_ledger` (b2b liability).
  - Seed script `infra/init-db/02-seed.sql` populates system configs, facilities, default plans, and demo venues.
- Deficiencies:
  - No explicit migration toolchain (e.g. Prisma or custom versioned SQL runner) to apply incremental changes safely without dropping tables.

---

## 6. Redis Setup

- Target: Redis 8 (Alpine) with AOF persistence (`appendonly yes`).
- Roles:
  - Distributed mutual exclusion via Redlock (`checkin:${userId}`).
  - Replay prevention nonces (`nonce:qr:${nonce}`).
  - SMS OTP attempt tracking and cooldowns (`otp_cooldown:${phone}`).
  - Cross-venue impossible velocity detection.
- Deficiencies:
  - In production mode, Redis fail-closed posture is enforced, but readiness endpoints do not report Redis ping latency or connection pool state.

---

## 7. Health Checks

- Current status in `HealthController` (`apps/api/src/health.controller.ts`):
  - Returns a static `{ status: 'ok' }` without checking backend database or Redis availability.
  - No separation between Liveness (`/health/live`) and Readiness (`/health/ready`).
  - Container orchestrators (Kubernetes / Docker Compose) could route traffic to an unready pod that cannot connect to the database.

---

## 8. Logging

- Uses NestJS built-in `Logger`.
- Phone numbers are masked (`0912***1234`) in notification logs.
- Deficiencies:
  - No global request correlation ID (`X-Request-ID`) attached to logs.
  - Output is human-readable prose rather than structured JSON suitable for Datadog / Elastic / Loki.
  - Durations and HTTP response status codes are not consistently logged for incoming requests.

---

## 9. Deployment Artifacts

- Root `docker-compose.yml` configures 4 services: `postgres`, `redis`, `api`, `web`.
- `apps/api/Dockerfile`: Multi-stage Dockerfile based on `node:22-alpine`.
  - **Defect Found**: `CMD ["node", "dist/main"]` fails because NestJS outputs to `dist/src/main.js`.
- `apps/web/Dockerfile`: Multi-stage Dockerfile based on `node:22-alpine`.
  - **Defect Found**: `public/` directory is not copied to the runner stage, causing static assets to 404 in production.

---

## 10. Missing Production Controls

1. **GitHub Actions CI Workflow**: No automated test execution on commit.
2. **Dedicated Health Probes**: Lack of `/health/live` and `/health/ready`.
3. **Graceful Shutdown Hooks**: `app.enableShutdownHooks()` not enabled in `main.ts`.
4. **HTTP Security Headers**: Next.js lacks HSTS, X-Content-Type-Options, Referrer-Policy, and frame protection headers.
5. **Operational Metrics**: No lightweight telemetry endpoint to inspect throughput, error rates, or dependency health.
6. **Incident Runbooks & Backup Procedures**: No written recovery protocols for outages or database disaster recovery.

---

## 11. Recommended Changes for Phase 13

1. **Implement GitHub Actions Workflow (`.github/workflows/ci.yml`)**:
   - Provide containerized PostgreSQL 18 and Redis services in CI.
   - Run typecheck, unit tests, integration tests (`real-infra.integration.spec.ts`), API build, Web build, and E2E journeys.
2. **Fix Dockerfiles**:
   - Update `apps/api/Dockerfile` command to `node dist/src/main.js`.
   - Update `apps/web/Dockerfile` to copy `apps/web/public` directory.
3. **Upgrade Health Controller**:
   - Separate `/health/live` (process alive) and `/health/ready` (verifies PostgreSQL `SELECT 1` and Redis `PING`).
4. **Enable Graceful Shutdown**:
   - Call `app.enableShutdownHooks()` in NestJS bootstrap.
5. **Add HTTP Security Headers**:
   - Configure security headers in `apps/web/next.config.ts`.
6. **Create Operational Documentation**:
   - `docs/BACKUP-RESTORE-RUNBOOK.md`
   - `docs/INCIDENT-RUNBOOK.md`
   - `docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md`
   - `docs/PHASE-13-IMPLEMENTATION.md`
