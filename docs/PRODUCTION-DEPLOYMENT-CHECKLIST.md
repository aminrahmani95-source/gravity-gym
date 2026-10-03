# Gravity Platform — Production Deployment Checklist

**Version**: 1.0.0  
**Effective Date**: September 30, 2026  
**Audience**: Release Engineers, Lead Architects, SREs, Product Operations  
**Scope**: Zero-Downtime Deployment & Verification Protocol

---

## 1. Pre-Deployment Verification (Gate 1)

All items in this section MUST be confirmed prior to initiating production deployment:

### 1.1 Secrets & Environment Configuration
- [ ] `NODE_ENV=production` is set across all containers.
- [ ] `JWT_SECRET` is generated using a secure cryptographic CSPRNG, minimum 32 characters, and is NOT one of the development fallback strings.
- [ ] `QR_SIGNING_SECRET` is generated using a secure cryptographic CSPRNG, minimum 32 characters, and is NOT one of the development fallback strings.
- [ ] `WEB_ORIGIN` is configured to the exact production domain (e.g. `https://gravitysport.ir`), with NO wildcard `*`.
- [ ] `NEXT_PUBLIC_ENABLE_DEMO_LOGIN="false"` is strictly enforced in web build args and container environment.
- [ ] `DATABASE_URL` connects to managed PostgreSQL 18 instance with SSL mode enabled (`sslmode=require`).
- [ ] `REDIS_URL` connects to managed Redis 8 instance with authentication and TLS enabled.

### 1.2 Continuous Integration & Automated Tests
- [ ] GitHub Actions CI pipeline passes 100% green on `main` branch.
- [ ] `npm run typecheck` passes with zero errors across all workspaces.
- [ ] Full unit test suite (`npm test`) passes all 144 tests.
- [ ] Real infrastructure integration test suite (`npm run test:integration`) passes against live PostgreSQL 18 & Redis 8.
- [ ] Production builds (`npm run build`) complete successfully for `@gym-app/shared-types`, `@gym-app/api`, and `@gym-app/web`.

### 1.3 Economics & Business Rules Invariant Check
- [ ] Confirm no unauthorized changes have been made to commercial economics:
  - Starter 15: 550,000 Toman / 15 Credits (Max rollover: 2)
  - Standard 30: 1,000,000 Toman / 30 Credits (Max rollover: 5)
  - Pro 60: 1,900,000 Toman / 60 Credits (Max rollover: 10)
  - Golden Bounding ratio: $\lambda \le 31,000$ Toman/Credit
- [ ] Economics Verification: `Economics Changes: NONE`.

---

## 2. Infrastructure & Network Configuration (Gate 2)

### 2.1 TLS & Reverse Proxy (Nginx / Cloudflare)
- [ ] Valid TLS 1.3 certificate installed (Let's Encrypt / DigiCert).
- [ ] Automatic HTTP $\rightarrow$ HTTPS redirection enabled (301 Permanent).
- [ ] HSTS enabled: `max-age=31536000; includeSubDomains`.
- [ ] Web application security headers verified:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- [ ] API rate limiting enabled at reverse proxy layer (e.g. 100 req/min per IP, 5 req/min for `/auth/send-otp`).

### 2.2 Database Readiness
- [ ] Automated pre-deployment database backup created (`pg_dump -Fc`).
- [ ] Schema DDL migration verified using idempotent statements (`IF NOT EXISTS`).
- [ ] System configurations verified in `system_configs` table.

---

## 3. Deployment Execution (Gate 3 — Rolling Protocol)

Gravity employs a **Zero-Downtime Rolling Update** strategy:

1. **Deploy New API Container Instances**:
   - Spin up new API pods with target image tag.
   - Container liveness probe `/api/v1/health/live` ensures process startup.
   - Container readiness probe `/api/v1/health/ready` ensures database and Redis connectivity before receiving ingress traffic.

2. **Drain Old API Instances**:
   - Kubernetes / Docker initiates graceful termination (SIGTERM).
   - `app.enableShutdownHooks()` triggers:
     - In-flight HTTP requests complete.
     - Database pool connections drain cleanly.
     - Redis connections close cleanly.
     - Default termination grace period: 30 seconds.

3. **Deploy Web Container Instances**:
   - Spin up Next.js runner containers.
   - Static assets served with cache headers; dynamic routes server-rendered.
   - Readiness probe `/` returns HTTP 200 before routing traffic.

---

## 4. Post-Deployment Verification & Smoke Tests (Gate 4)

Immediately following deployment, execute these production verification steps:

- [ ] **Liveness Probe**:
  ```bash
  curl -fsS https://api.gravitysport.ir/api/v1/health/live
  ```
  Expected: HTTP 200 `{ status: "ok" }`.

- [ ] **Readiness Probe**:
  ```bash
  curl -fsS https://api.gravitysport.ir/api/v1/health/ready
  ```
  Expected: HTTP 200 `{ status: "ok", dependencies: { database: { ok: true }, redis: { ok: true } } }`.

- [ ] **Telemetry Probe**:
  ```bash
  curl -fsS https://api.gravitysport.ir/api/v1/health/metrics
  ```
  Expected: HTTP 200 with valid memory and query statistics.

- [ ] **End-to-End User Journeys**:
  - [ ] Member Discovery: Browse gym catalog and verify tier badges and photos.
  - [ ] Reception Counter: Verify `/reception` loads without errors and staff can authenticate.
  - [ ] Admin Dashboard: Verify `/admin` displays live metrics and Golden Bounding controls.
  - [ ] Dynamic QR Generation: Generate a test QR code and verify 45-second countdown timer.

---

## 5. Rollback Protocol & Criteria

### 5.1 Automatic Rollback Triggers
Initiate immediate rollback if ANY of the following conditions persist for $> 2$ minutes:
- API readiness probe `/api/v1/health/ready` failure rate $> 5\%$.
- HTTP 5xx error rate exceeds $1\%$ of total production traffic.
- P95 latency exceeds 1,500ms on core check-in or checkout endpoints.
- Database connection pool saturation $> 90\%$.

### 5.2 Rollback Procedure
1. Revert container image tag to previous stable release tag:
   ```bash
   kubectl rollout undo deployment/gravity-api
   kubectl rollout undo deployment/gravity-web
   ```
2. If database schema was modified:
   - Check if backward compatibility was preserved.
   - If rollback migration is required, restore from pre-deployment snapshot following [BACKUP-RESTORE-RUNBOOK.md](file:///c:/Users/P30/Desktop/Gravity/gym%20app/docs/BACKUP-RESTORE-RUNBOOK.md).
3. Notify engineering and operations channels of rollback completion.
4. Convene post-incident review within 24 hours.
