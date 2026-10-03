# Gravity Platform — Database Backup & Disaster Recovery Runbook

**Version**: 1.0.0  
**Effective Date**: September 30, 2026  
**Audience**: DevOps, SRE, Site Reliability Engineers, Database Administrators  
**Systems**: PostgreSQL 18 (Alpine/Debian), Redis 8 (Alpine)

---

## 1. Overview & Objectives

Gravity's financial integrity depends on two append-only ledgers:
1. `credit_ledger`: User credit balances, subscriptions, check-in debits, rollover sweeps.
2. `gym_payable_ledger`: B2B gym partner liabilities, check-in earnings, settlement disbursements.

Loss or corruption of these tables constitutes a critical business failure. This runbook details operational procedures for automated scheduled backups, point-in-time recovery (PITR), off-site replication, and verification restoration drills.

### Recovery Point Objective (RPO) & Recovery Time Objective (RTO)
- **RPO (Ledgers & Transactions)**: $\le 1$ minute (via Continuous WAL Archiving).
- **RPO (Catalog & Metadata)**: $\le 6$ hours.
- **RTO (Total Recovery Time)**: $\le 15$ minutes.

---

## 2. PostgreSQL 18 Backup Architecture

### 2.1 Backup Strategy Matrix

| Backup Type | Tool | Frequency | Retention | Storage Destination |
| :--- | :--- | :--- | :--- | :--- |
| **Continuous WAL** | `pg_receivewal` / WAL-G | Continuous (streaming) | 14 days | Encrypted S3-compatible Object Storage |
| **Full Logical Dump** | `pg_dump` (custom format `-Fc`) | Every 6 hours | 30 days | S3 Coldline Storage (AES-256) |
| **Nightly Base Backup** | `pg_basebackup` | Daily at 02:00 Tehran Time | 60 days | Dedicated Backup Volume + Off-site Mirror |

### 2.2 Automated Full Logical Backup Command

Run this command as a scheduled cron task or container job:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DATE=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_DIR="/var/backups/gravity/postgres"
BACKUP_FILE="${BACKUP_DIR}/gravity_pg18_${BACKUP_DATE}.dump"
LOG_FILE="/var/log/gravity/backup.log"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting logical backup of gym_platform_db..." >> "${LOG_FILE}"

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  --host="${DB_HOST:-localhost}" \
  --port="${DB_PORT:-5432}" \
  --username="${DB_USER:-postgres}" \
  --format=custom \
  --compress=9 \
  --blobs \
  --verbose \
  --file="${BACKUP_FILE}" \
  "${DB_NAME:-gym_platform_db}" >> "${LOG_FILE}" 2>&1

# Compute SHA-256 checksum
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

# Encrypt backup with GPG
gpg --batch --yes --encrypt --recipient "${BACKUP_GPG_RECIPIENT}" "${BACKUP_FILE}"
rm -f "${BACKUP_FILE}"

echo "[$(date -Iseconds)] Backup complete and encrypted: ${BACKUP_FILE}.gpg" >> "${LOG_FILE}"
```

### 2.3 Continuous WAL Archiving Configuration (`postgresql.conf`)

Ensure the following parameters are active in production:

```ini
# Replication & WAL Settings
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /mnt/wal_archive/%f && cp %p /mnt/wal_archive/%f'
archive_timeout = 60 # Force WAL segment rotation every 60s during idle periods
max_wal_senders = 10
```

---

## 3. Database Restoration Procedures

### 3.1 Scenario A: Restoring from Full Logical Dump (`pg_restore`)

Use this procedure to restore an entire database instance or recreate a staging environment:

1. **Halt Application Traffic**:
   Put the API into maintenance mode or scale down instances:
   ```bash
   kubectl scale deployment gravity-api --replicas=0
   ```

2. **Terminate Active Database Connections**:
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE datname = 'gym_platform_db' AND pid <> pg_backend_pid();
   ```

3. **Drop and Recreate Clean Database**:
   ```bash
   dropdb -h localhost -U postgres --if-exists gym_platform_db
   createdb -h localhost -U postgres -O gym_app_user gym_platform_db
   ```

4. **Decrypt and Verify Checksum**:
   ```bash
   gpg --batch --yes --decrypt --output gravity_pg18.dump gravity_pg18_YYYYMMDD.dump.gpg
   sha256sum -c gravity_pg18_YYYYMMDD.dump.sha256
   ```

5. **Execute High-Speed Parallel Restore**:
   ```bash
   pg_restore \
     --host=localhost \
     --port=5432 \
     --username=postgres \
     --dbname=gym_platform_db \
     --jobs=4 \
     --clean \
     --if-exists \
     --no-owner \
     --no-privileges \
     --verbose \
     gravity_pg18.dump
   ```

6. **Post-Restore Integrity Audit**:
   Verify ledger balances match pre-backup state:
   ```sql
   SELECT 
     (SELECT count(*) FROM credit_ledger) AS credit_ledger_rows,
     (SELECT count(*) FROM gym_payable_ledger) AS payable_ledger_rows,
     (SELECT sum(credits_amount) FROM credit_ledger) AS total_circulating_credits,
     (SELECT sum(amount_tomans) FROM gym_payable_ledger) AS total_gym_liabilities;
   ```

7. **Restart Application Services**:
   ```bash
   kubectl scale deployment gravity-api --replicas=2
   ```

---

## 4. Redis 8 Persistence & Recovery Runbook

Redis is used for:
- Distributed Redlock locks (`lock:checkin:${memberId}`)
- Replay prevention nonces (`nonce:qr:${nonce}`)
- Rate-limiting & OTP cooldowns

### 4.1 Persistence Configuration (`redis.conf`)

In production, Redis MUST use both RDB snapshots and Append Only File (AOF) with `everysec` synchronization:

```conf
# RDB Snapshotting
save 900 1
save 300 10
save 60 1000

# Append Only File (AOF)
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite yes
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

### 4.2 Redis Disaster Recovery (Crash or Data Loss)

If Redis container dies or state is corrupted:
1. Verify storage volume persistence (`/data/appendonly.aof` and `/data/dump.rdb`).
2. If AOF is truncated or corrupted due to unexpected node shutdown:
   ```bash
   redis-check-aof --fix /data/appendonly.aof
   ```
3. Restart Redis service:
   ```bash
   docker compose restart redis
   ```
4. Verify Redis connectivity via API readiness probe:
   ```bash
   curl -s http://localhost:4000/api/v1/health/ready | jq .dependencies.redis
   ```

> [!IMPORTANT]
> Because Gravity adheres to a **fail-closed** architecture, if Redis is down, check-ins and payments will safely reject rather than allowing replay attacks or double-spend race conditions.

---

## 5. Automated Backup Verification Drill

Disaster recovery readiness MUST be automatically validated on a weekly basis by spinning up an isolated ephemeral container, restoring the latest backup, running financial invariant checks, and tearing down the container.

Verification Script (`infra/scripts/verify-backup.sh`):

```bash
#!/usr/bin/env bash
set -e

echo "Starting automated DR restore drill..."
TEST_DB="dr_test_$(date +%s)"
createdb -h localhost -U postgres "${TEST_DB}"

pg_restore -h localhost -U postgres -d "${TEST_DB}" --no-owner /var/backups/latest.dump

# Assert integrity
TABLE_COUNT=$(psql -h localhost -U postgres -d "${TEST_DB}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
if [ "${TABLE_COUNT}" -lt 15 ]; then
  echo "DR drill failed: table count ${TABLE_COUNT} is lower than required schema 16."
  dropdb -h localhost -U postgres "${TEST_DB}"
  exit 1
fi

dropdb -h localhost -U postgres "${TEST_DB}"
echo "DR drill successfully passed."
```
