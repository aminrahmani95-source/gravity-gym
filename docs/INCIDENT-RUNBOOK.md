# Gravity Platform — Production Incident & Outage Runbook

**Version**: 1.0.0  
**Effective Date**: September 30, 2026  
**Audience**: On-Call Engineers, Site Reliability Engineering (SRE), Technical Support  
**Scope**: All 9 Major System Outages & Operational Failure Modes

---

## Incident Severity Definitions

- **SEV-1 (Critical Outage)**: System-wide failure preventing athlete check-ins, payment processing, or database write availability. Immediate 24/7 engagement; 15-minute response SLA.
- **SEV-2 (Major Degradation)**: Partial service disruption (e.g. SMS provider degraded, single gym reception counter impaired, admin analytics latency). 30-minute response SLA.
- **SEV-3 (Minor Defect)**: Isolated anomaly, non-blocking UI glitch, or non-critical background task delay. Business hours SLA.

---

## Outage Procedures

### 1. PostgreSQL Connection Pool Exhaustion / Unreachable Database (SEV-1)

**Symptoms**:
- API readiness probe `/api/v1/health/ready` returns HTTP 503 (`dependencies.database.ok: false`).
- Log entries show: `remaining connection slots are reserved for non-replication superuser connections` or `connection timeout`.

**Remediation Steps**:
1. Check active database connections:
   ```sql
   SELECT count(*), state, wait_event_type, wait_event 
   FROM pg_stat_activity 
   GROUP BY state, wait_event_type, wait_event;
   ```
2. Identify and terminate long-running idle or blocked queries (> 30s):
   ```sql
   SELECT pg_terminate_backend(pid), query, query_start 
   FROM pg_stat_activity 
   WHERE state <> 'idle' 
     AND now() - query_start > interval '30 seconds' 
     AND pid <> pg_backend_pid();
   ```
3. If PgBouncer or connection pooler is saturated:
   - Restart or scale PgBouncer connection pooler.
   - Adjust `max_connections` in `postgresql.conf` if physical RAM allows (each backend consumes ~10MB).
4. Verify API recovery via readiness probe:
   ```bash
   curl -i http://localhost:4000/api/v1/health/ready
   ```

---

### 2. Redis Cluster / Instance Outage (SEV-1)

**Symptoms**:
- Dynamic QR counter scans fail with HTTP 500 or fail-closed error.
- Check-in attempts report distributed lock failure.
- `/api/v1/health/ready` returns HTTP 503 (`dependencies.redis.ok: false`).

**Remediation Steps**:
1. Confirm Redis container/process status:
   ```bash
   docker compose ps redis
   redis-cli ping
   ```
2. Check Redis log for memory limits or OOM:
   ```bash
   docker compose logs --tail=100 redis
   ```
3. If Redis crashed due to memory exhaustion (`OOM command not allowed`):
   - Increase `maxmemory` limit in `redis.conf` or set eviction policy:
     ```conf
     maxmemory 2gb
     maxmemory-policy allkeys-lru
     ```
4. Restart Redis:
   ```bash
   docker compose restart redis
   ```
5. Note: In production mode, Redis operates **fail-closed** to prevent replay attacks and double-spend concurrency. Do NOT bypass Redis locks manually in production.

---

### 3. Downstream SMS OTP Gateway Outage / High Latency (SEV-2)

**Symptoms**:
- Athletes cannot log in; OTP delivery delayed > 60 seconds or failing.
- Error logs show: `Downstream SMS Gateway Timeout (504 Gateway Timeout)` or `Provider Connection Refused`.

**Remediation Steps**:
1. Inspect OTP gateway error rates in notifications service logs:
   ```bash
   grep "MockSmsProvider\|NotificationsService" /var/log/gravity/api.log
   ```
2. Activate Secondary SMS Provider Fallback:
   - Gravity supports dual-vendor routing (Kavenegar $\leftrightarrow$ FarazSMS).
   - In environment or configuration dashboard, toggle:
     ```bash
     SMS_PRIMARY_PROVIDER=farazsms
     ```
   - Restart or trigger hot-reload on API instances.
3. Temporary Emergency Relief:
   - For athletes stranded at physical gym turnstiles who cannot log in, Gym Receptionists can use Reception Emergency Counter Verification with National Code and Manager override.

---

### 4. Shaparak IPG Payment Gateway Outage / Callback Reconciliation Failure (SEV-1)

**Symptoms**:
- Users complete payment at bank IPG, but redirect to Gravity fails or times out.
- User bank account debited, but membership credits (+30) not added to wallet.

**Remediation Steps**:
1. Identify unverified transactions pending reconciliation:
   ```sql
   SELECT id, user_id, plan_id, amount_tomans, authority, created_at 
   FROM payment_transactions 
   WHERE status = 'PENDING' 
     AND created_at < NOW() - INTERVAL '15 minutes'
     AND created_at > NOW() - INTERVAL '24 hours';
   ```
2. Run Automated Shaparak Reconciliation Worker:
   ```bash
   npm run --workspace=@gym-app/api reconcile:payments
   ```
3. The reconciliation worker queries Shaparak Inquiry API (`InquiryTransaction`) with the `authority`.
   - If payment succeeded: worker marks status `COMPLETED`, adds RRN, and invokes `ledgerService.recordCreditPurchase()` inside an ACID transaction.
   - If payment failed: worker marks status `FAILED`.
4. Idempotency guarantees (`uq_payment_transactions_authority`) prevent duplicate credit issuance even if user retries or callback arrives twice.

---

### 5. Reception Scanner Token Replay Attack Wave (SEV-2)

**Symptoms**:
- Spikes in reception 400 errors: `این بارکد قبلاً استفاده شده است (حمله تکرار/Replay Attack)`.
- Multiple gyms or multiple terminals attempting to scan the same athlete's QR token within seconds.

**Remediation Steps**:
1. Inspect audit logs for attacker user ID or compromised gym terminal:
   ```sql
   SELECT user_id, gym_id, qr_nonce, created_at 
   FROM checkins 
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY user_id, gym_id, qr_nonce, created_at 
   HAVING count(*) > 1;
   ```
2. Verify Redis nonce retention:
   - Ensure `qr_nonce_retention_seconds` is configured to at least 90 seconds (double the 45s QR token TTL).
3. If a specific athlete account is compromised or sharing screenshots via social messaging apps:
   - Temporarily suspend user account in Admin Dashboard (`status = 'SUSPENDED'`).
   - Advise the athlete that Dynamic QR codes auto-refresh every 45s and static screenshots are cryptographically rejected.

---

### 6. Member Dynamic QR Expiration / Clock Drift (SEV-3)

**Symptoms**:
- Legitimate athletes report check-in failures: `بارکد منقضی شده است. لطفاً بارکد را نوسازی فرمایید.`
- High volume of rejections occurring within 10–20 seconds of QR generation.

**Remediation Steps**:
1. Check NTP synchronization on API and Web servers:
   ```bash
   timedatectl status
   chronyc tracking
   ```
2. If host clock has drifted $> 2$ seconds, restart chrony/systemd-timesyncd:
   ```bash
   sudo systemctl restart chrony
   ```
3. Check athlete client device clock drift:
   - If athlete phone clock is manually set incorrectly, advise user to enable "Set Time Automatically" in mobile settings.
   - Gravity API allows a 5-second leeway buffer in JWT verification (`clockTolerance: 5`) to mitigate minor network latency.

---

### 7. Impossible Velocity Detection Triggered (SEV-2)

**Symptoms**:
- Athlete flagged with `FRAUD_ALERT_IMPOSSIBLE_VELOCITY`.
- Second check-in blocked because calculated travel speed between gym A and gym B exceeds 70 km/h.

**Remediation Steps**:
1. Inspect the checkin coordinates and timestamps:
   ```sql
   SELECT c.id, c.user_id, c.gym_id, g.name_fa, c.created_at, g.latitude, g.longitude
   FROM checkins c
   JOIN gyms g ON c.gym_id = g.id
   WHERE c.user_id = '<FLAGGED_USER_ID>'
   ORDER BY c.created_at DESC
   LIMIT 2;
   ```
2. If verified as credential/QR sharing between two different individuals in different parts of the city:
   - Maintain block. Issue warning notification to athlete.
3. If false positive due to inaccurate gym geofence coordinates in database:
   - Super Admin can update gym latitude/longitude in `/admin` gym management.
   - Reset athlete session cooldown if appropriate.

---

### 8. Node.js OOM / High Memory Consumption (SEV-1)

**Symptoms**:
- Node.js API or Next.js Web process restarts repeatedly.
- Memory telemetry `/api/v1/health/metrics` shows `heapUsedBytes` approaching container limit (e.g. 1.8GB / 2.0GB).
- Process exit code `137` (SIGKILL by Linux kernel OOM killer).

**Remediation Steps**:
1. Capture heap profile:
   ```bash
   kill -USR2 <NODE_PID> # or trigger Node.js heap snapshot
   ```
2. Temporary Relief:
   - Scale horizontal replicas to distribute memory load:
     ```bash
     kubectl scale deployment gravity-api --replicas=4
     ```
   - Increase container memory limit to 4GiB in deployment manifest.
3. Check for unbounded query loading:
   - Confirm all database queries use explicit `LIMIT` and pagination.
   - Confirm no large unindexed `SELECT * FROM credit_ledger` without user filter.

---

### 9. B2B Gym Payable Ledger Discrepancy / Settlement Failure (SEV-2)

**Symptoms**:
- Monthly or bi-weekly settlement batch creation fails or produces negative balance.
- Partner gym complains that payable amount does not match physical check-in count.

**Remediation Steps**:
1. Execute reconciliation audit query for target gym:
   ```sql
   SELECT 
     g.name_fa,
     count(c.id) AS total_checkins,
     sum(c.credits_spent) AS total_credits_debited,
     sum(c.monetary_payout_tomans) AS calculated_payout_tomans,
     (SELECT coalesce(sum(amount_tomans), 0) 
      FROM gym_payable_ledger 
      WHERE gym_id = g.id AND entry_type = 'CHECKIN_EARNING') AS ledger_earnings_tomans,
     (SELECT coalesce(sum(amount_tomans), 0) 
      FROM gym_payable_ledger 
      WHERE gym_id = g.id AND entry_type = 'SETTLEMENT_PAYOUT') AS ledger_settled_tomans
   FROM gyms g
   LEFT JOIN checkins c ON g.id = c.gym_id AND c.status = 'APPROVED'
   WHERE g.id = '<GYM_ID>'
   GROUP BY g.id, g.name_fa;
   ```
2. Verify that `calculated_payout_tomans` strictly equals `ledger_earnings_tomans`.
3. If a check-in was approved but payable ledger entry failed (which should be impossible under ACID transactions):
   - Review PostgreSQL deadlock or serialization error logs.
   - If manual corrective ledger adjustment is required, use `entry_type = 'ADJUSTMENT'` with required admin explanation; NEVER update existing ledger rows directly.
