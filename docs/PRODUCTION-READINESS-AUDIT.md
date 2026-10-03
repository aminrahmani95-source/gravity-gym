# Production Readiness & Performance Engineering Audit

## Executive Summary
Phase 9 examined the system architecture for high-throughput production deployment across PostgreSQL indexing, query boundedness, connection pool sizing, distributed state coordination, fail-closed operational guarantees, and bare-metal/Docker infrastructure blueprints.

---

## 1. Database Indexing & Query Performance Audit

### A. Indexing Coverage
PostgreSQL 18 DDL specifications (`infra/init-db/01-init.sql`) enforce indexed access paths for all critical latency-sensitive operations:
- **`users`**:
  - `idx_users_phone` (`phone_number`): Index scan on OTP generation and authentication lookups.
  - `idx_users_role` (`role`): Filter index for administrative role audits.
- **`gyms`**:
  - `idx_gyms_location` (`city, district, is_active`): Geolocation and discovery filtering.
  - `idx_gyms_tier` (`tier`) & `idx_gyms_access_mode` (`access_mode`).
  - `idx_gyms_active_created` (`is_active, created_at, id`): Deterministic keyset pagination.
- **`gym_sans`**:
  - `idx_gym_sans_lookup` (`gym_id, day_of_week, gender`): Instantaneous sans matching in check-in Stage 5.
- **`subscriptions`**:
  - `idx_subscriptions_user` (`user_id, status`): Subscriptions active state verification.
- **`payment_transactions`**:
  - `idx_payment_transactions_authority` (`authority`): Direct point lookups during payment callbacks.
  - Unique constraint `uq_payment_transactions_authority`.
- **`credit_ledger`**:
  - `idx_credit_ledger_user` (`user_id, created_at DESC`): Append-only balance resolution.
  - Unique partial index `uq_credit_ledger_checkin_debit` on `(reference_id)` WHERE `entry_type = 'CHECKIN_DEBIT'`.
- **`checkins`**:
  - `idx_checkins_user` (`user_id, created_at DESC`) & `idx_checkins_gym` (`gym_id, created_at DESC`).
  - Unique constraint `uq_checkins_qr_nonce` (`qr_nonce`): Anti-replay physical constraint.
- **`gym_payable_ledger`**:
  - Unique partial index `uq_gym_payable_checkin_earning` on `(checkin_id)`.

### B. DDL Syntax Audit Fix
During this audit, a missing closing delimiter `);` in `infra/init-db/01-init.sql` on the `credit_ledger` table was identified and corrected. Native PostgreSQL container initialization is verified clean.

---

## 2. Fail-Closed Security & Infrastructure Posture

The application strictly enforces **Fail-Closed Architecture** when running in `NODE_ENV = 'production'`:

### A. Database Fail-Closed Policy (`DatabaseService`)
- If `DATABASE_URL` is missing or the PostgreSQL connection pool fails health verification (`SELECT 1`), the application refuses to start and raises:
  `FATAL SECURITY ERROR: PostgreSQL connection failed in production mode. Refusing to run in-memory fallback.`
- **Security Guarantee**: In-memory relational emulation is blocked from ever executing in production.

### B. Redis Fail-Closed Policy (`RedisService`)
- If `REDIS_URL` is missing or Redis ping fails, the application raises:
  `FATAL SECURITY ERROR: Redis connection failed in production mode. Refusing to run in-memory fallback.`
- **Security Guarantee**: Distributed Redlock and single-use QR nonce caching can never silently degrade to a single-process in-memory store in multi-instance or clustered deployments, completely preventing cross-pod replay vulnerabilities.

---

## 3. Concurrency, Connection Pools & Rate Limiting

- **PostgreSQL Pool**:
  - Pool size: `max: 20` clients per API pod.
  - Connection timeout: `connectionTimeoutMillis: 3000`.
  - Idle client reclamation: `idleTimeoutMillis: 30000`.
- **Redis Redlock**:
  - Check-in distributed lock: `checkin:${userId}` with `10,000ms` TTL.
  - Replay prevention nonce: `nonce:qr:${nonce}` with `90s` TTL.
  - Rate limiting & cooldown: `otp_cooldown:${phone}` with `120s` TTL; `cooldown:${userId}:${gymId}` with `7200s` TTL.

---

## 4. Native Deployment & Environment Blueprints

### Recommended Stack
1. **Operating System**: Ubuntu 24.04 LTS / Debian 12
2. **Reverse Proxy & SSL**: Nginx with HTTP/2, Let's Encrypt TLS 1.3
3. **Application Containers**:
   - `api`: Node.js 22 LTS running NestJS in clustered mode (PM2 / Docker)
   - `web`: Next.js 15 standalone server
   - `postgres`: PostgreSQL 18 with `pgcrypto` enabled
   - `redis`: Redis 7.2 with persistent AOF enabled (`appendonly yes`)
4. **Timezone**: All application containers configured with `TZ=Asia/Tehran` to ensure exact daylight and calendar sync.
5. **Payment Routing**: Outbound HTTPS whitelisted to Shaparak PSP IP ranges (`sandbox.shaparak.ir` / `api.zarinpal.com`).
