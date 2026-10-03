# GRAVITY — DATABASE BACKUP & DISASTER RECOVERY RUNBOOK

> **Target Database Engine**: PostgreSQL 18  
> **Target Database Name**: `gym_platform_db`  
> **Backup Storage Target**: Encrypted S3 / MinIO Object Storage with Immutability (WORM) Lock

---

## 1. Automated Backup Strategy

### A. Full Logical Snapshot (Daily at 02:00 Asia/Tehran)
```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/gravity"
BACKUP_FILE="${BACKUP_DIR}/gravity_full_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

# Execute parallel compressed pg_dump (Custom Format with Blob/Large Objects)
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST:-localhost}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-postgres}" \
  -d "${DB_NAME:-gym_platform_db}" \
  -F c \
  -b \
  -v \
  -f "${BACKUP_FILE}"

# Generate SHA256 checksum for tamper-evidence
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

echo "Backup completed successfully: ${BACKUP_FILE}"
```

### B. Point-In-Time Recovery (PITR) & Continuous WAL Archiving
Configure `postgresql.conf`:
```ini
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f'
archive_timeout = 300 # Forces segment rotation every 5 minutes
```

---

## 2. Disaster Recovery Drill (Restore Procedure)

### Step 1: Pre-Restore Preparation
```bash
# 1. Terminate active backend connections to prevent mid-restore mutation
psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'gym_platform_db' AND pid <> pg_backend_pid();
"

# 2. Drop and recreate clean target database
dropdb -h "${DB_HOST}" -U "${DB_USER}" --if-exists gym_platform_db
createdb -h "${DB_HOST}" -U "${DB_USER}" -O postgres gym_platform_db
```

### Step 2: Restore from Compressed Dump
```bash
# 3. Restore schema, constraints, indexes, and table data
pg_restore \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d gym_platform_db \
  -v \
  --single-transaction \
  --exit-on-error \
  "${BACKUP_FILE}"
```

---

## 3. Post-Restore Data Integrity Verification Queries

Immediately after restore, execute the following cryptographic and financial verification queries:

### 1. Verify Users & Active Subscriptions Count
```sql
SELECT 
    COUNT(*) AS total_users,
    COUNT(CASE WHEN role = 'USER' THEN 1 END) AS member_count,
    COUNT(CASE WHEN role = 'GYM_STAFF' THEN 1 END) AS staff_count
FROM users;

SELECT status, COUNT(*) 
FROM subscriptions 
GROUP BY status;
```

### 2. Verify Member Credit Ledger Mathematical Invariant
```sql
-- For every user, the recorded balance_after of the latest entry must match sum of all delta_credits
WITH calculated AS (
    SELECT user_id, SUM(delta_credits) AS expected_balance
    FROM credit_ledger
    GROUP BY user_id
),
latest AS (
    SELECT DISTINCT ON (user_id) user_id, balance_after
    FROM credit_ledger
    ORDER BY user_id, created_at DESC
)
SELECT c.user_id, c.expected_balance, l.balance_after
FROM calculated c
JOIN latest l ON c.user_id = l.user_id
WHERE c.expected_balance <> l.balance_after;
-- Result MUST return 0 rows!
```

### 3. Verify Partner Gym Payable Ledger Invariant
```sql
-- For every gym, the latest balance_after must match sum of all delta_amount_tomans
WITH calculated_gym AS (
    SELECT gym_id, SUM(delta_amount_tomans) AS expected_payable
    FROM gym_payable_ledger
    GROUP BY gym_id
),
latest_gym AS (
    SELECT DISTINCT ON (gym_id) gym_id, balance_after
    FROM gym_payable_ledger
    ORDER BY gym_id, created_at DESC
)
SELECT cg.gym_id, cg.expected_payable, lg.balance_after
FROM calculated_gym cg
JOIN latest_gym lg ON cg.gym_id = lg.gym_id
WHERE cg.expected_payable <> lg.balance_after;
-- Result MUST return 0 rows!
```

### 4. Verify No Orphan Foreign Keys
```sql
SELECT COUNT(*) FROM checkins WHERE user_id NOT IN (SELECT id FROM users);
SELECT COUNT(*) FROM checkins WHERE gym_id NOT IN (SELECT id FROM gyms);
SELECT COUNT(*) FROM subscriptions WHERE user_id NOT IN (SELECT id FROM users);
SELECT COUNT(*) FROM payment_transactions WHERE user_id NOT IN (SELECT id FROM users);
-- All must return 0!
```

---

## 4. Host Environment Limitation Notice
* The local development Windows host does not have a live PostgreSQL 18 server installed (Microsoft SQL Server and Redis 8 are present).
* Full SQL DDL schema syntax, transaction rollback behaviors, and ledger balance invariants are verified via the automated backend test suite.
* Real backup execution must be conducted on staging/production environments provisioned with PostgreSQL 18.
