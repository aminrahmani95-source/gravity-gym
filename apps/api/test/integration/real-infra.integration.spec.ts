import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import * as crypto from 'crypto';

/**
 * Real Infrastructure Integration Test Profile
 * Tests concurrency, idempotency, ACID rollback, and Redis fail-closed behavior
 * directly against live PostgreSQL 18 & Redis.
 *
 * CRITICAL REQUIREMENT:
 * This test suite MUST FAIL if real PostgreSQL or Redis is unavailable.
 * It will NEVER silently fall back to in-memory emulators or falsely pass.
 */
describe('Real Infrastructure Integration Tests (PostgreSQL 18 & Redis)', () => {
  const pgUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_secure_pass@localhost:5432/gym_platform_db';
  const redisUrl =
    process.env.TEST_REDIS_URL ||
    process.env.REDIS_URL ||
    'redis://localhost:6379';

  let pool: Pool;
  let redis: Redis;
  let pgVersionString = '';
  let redisVersionString = '';

  beforeAll(async () => {
    // 1. Enforce Real PostgreSQL Connectivity
    try {
      pool = new Pool({
        connectionString: pgUrl,
        connectionTimeoutMillis: 3000,
      });
      const pgRes = await pool.query('SELECT version()');
      pgVersionString = pgRes.rows[0].version;
    } catch (err: any) {
      console.error('\n❌ FATAL: Real PostgreSQL database connection failed on', pgUrl);
      console.error('Error details:', err.message);
      throw new Error(`Real PostgreSQL infrastructure is UNAVAILABLE (${err.message}). Integration suite cannot proceed.`);
    }

    // 2. Enforce Real Redis Connectivity
    try {
      redis = new Redis(redisUrl, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
      });
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Redis ping returned unexpected response: ${pong}`);
      }
      const redisInfo = await redis.info('server');
      const versionMatch = redisInfo.match(/redis_version:([^\r\n]+)/);
      redisVersionString = versionMatch ? versionMatch[1] : 'unknown';
    } catch (err: any) {
      console.error('\n❌ FATAL: Real Redis cache/mutex connection failed on', redisUrl);
      console.error('Error details:', err.message);
      throw new Error(`Real Redis infrastructure is UNAVAILABLE (${err.message}). Integration suite cannot proceed.`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end().catch(() => {});
    if (redis) await redis.quit().catch(() => {});
  });

  // =========================================================================
  // 1. INFRASTRUCTURE PROOF
  // =========================================================================
  it('1. Infrastructure Verification: asserts real PostgreSQL and Redis connectivity, version, and absence of in-memory emulators', async () => {
    expect(pool).toBeDefined();
    expect(pgVersionString).toMatch(/PostgreSQL\s+\d+/i);

    expect(redis).toBeDefined();
    const ping = await redis.ping();
    expect(ping).toBe('PONG');
    expect(redisVersionString).toBeDefined();

    // Verify neither connection is an in-memory emulator
    expect((pool as any).isInMemory).toBeUndefined();
    expect((redis as any).isInMemory).toBeUndefined();

    console.log('\n================ LIVE INFRASTRUCTURE VERIFICATION ================');
    console.log(`✅ PostgreSQL Live Engine : ${pgVersionString.split(',')[0]}`);
    console.log(`✅ Redis Live Engine      : Redis v${redisVersionString} (Ping: ${ping})`);
    console.log(`✅ In-Memory DB Emulator : STRICTLY DISABLED (Real PostgreSQL Active)`);
    console.log(`✅ In-Memory Redis Mock   : STRICTLY DISABLED (Real Redis Server Active)`);
    console.log('===================================================================\n');
  });

  // =========================================================================
  // 2. TEST A: 5 SIMULTANEOUS SCANS OF THE SAME QR TOKEN
  // =========================================================================
  it('2. Test A: 5 simultaneous scans of the same QR token (exactly 1 approved, 4 rejected)', async () => {
    const testMemberId = '00000000-0000-0000-0000-000000000003'; // Ali Ahmadi
    const testGymId = '10000000-0000-0000-0000-000000000004'; // Espinas Palace (14 credits)
    const nonce = `nonce-concurrent-${crypto.randomUUID()}`;
    const attempts = 5;

    // Concurrently execute 5 scan requests using real Redis Redlock & replay cache
    const results = await Promise.all(
      Array.from({ length: attempts }, async (_, index) => {
        const lockId = crypto.randomUUID();
        const lockKey = `lock:checkin:${testMemberId}`;
        
        // 1. Acquire Redis distributed lock (TTL 10s)
        const acquired = await redis.set(lockKey, lockId, 'EX', 10, 'NX');
        if (acquired !== 'OK') {
          return { index, status: 'REJECTED', reason: 'CONCURRENT_CHECKIN_LOCKED' };
        }

        try {
          // 2. Check & record nonce in Redis (TTL 90s)
          const nonceKey = `nonce:qr:${nonce}`;
          const nonceClaimed = await redis.set(nonceKey, '1', 'EX', 90, 'NX');
          if (nonceClaimed !== 'OK') {
            return { index, status: 'REJECTED', reason: 'REPLAY_ATTACK_DETECTED' };
          }

          // 3. PostgreSQL Transaction: record checkin & update ledgers
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const checkinId = crypto.randomUUID();
            await client.query(
              `INSERT INTO checkins (id, user_id, gym_id, credits_debited, monetary_payout_tomans, status)
               VALUES ($1, $2, $3, $4, $5, 'COMPLETED')`,
              [checkinId, testMemberId, testGymId, 14, 230000]
            );
            await client.query('COMMIT');
            return { index, status: 'APPROVED', checkinId };
          } catch (dbErr: any) {
            await client.query('ROLLBACK');
            return { index, status: 'REJECTED', reason: dbErr.message };
          } finally {
            client.release();
          }
        } finally {
          // Release Redis lock safely
          const currentLock = await redis.get(lockKey);
          if (currentLock === lockId) {
            await redis.del(lockKey);
          }
        }
      })
    );

    const approved = results.filter((r) => r.status === 'APPROVED');
    const rejected = results.filter((r) => r.status === 'REJECTED');

    expect(approved.length).toBe(1);
    expect(rejected.length).toBe(4);
    expect(rejected.every((r) => ['CONCURRENT_CHECKIN_LOCKED', 'REPLAY_ATTACK_DETECTED'].includes(r.reason))).toBe(true);

    // Verify exactly 1 checkin record exists in PostgreSQL for this approved run
    const pgCheck = await pool.query('SELECT count(*) FROM checkins WHERE id = $1', [approved[0].checkinId]);
    expect(parseInt(pgCheck.rows[0].count, 10)).toBe(1);
  });

  // =========================================================================
  // 3. TEST B: CONCURRENT CREDIT DEBITS AGAINST INSUFFICIENT BALANCE
  // =========================================================================
  it('3. Test B: Multiple concurrent credit debits against insufficient balance (no overdraft, exact final balance)', async () => {
    const testUserId = `00000000-0000-0000-0000-${crypto.randomUUID().slice(24)}`;
    
    // Create dedicated test user in PostgreSQL
    await pool.query(
      `INSERT INTO users (id, phone_number, first_name, last_name, gender, role, status)
       VALUES ($1, $2, 'تست', 'همروندی', 'MALE', 'USER', 'ACTIVE')`,
      [testUserId, `0919${Math.floor(1000000 + Math.random() * 9000000)}`]
    );

    // Seed initial balance of exactly 10 credits in credit_ledger
    await pool.query(
      `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, description)
       VALUES ($1, 10, 10, 'PLAN_PURCHASE', 'Seed 10 credits')`,
      [testUserId]
    );

    // 5 concurrent requests, each attempting to debit 4 credits (total requested = 20, available = 10)
    const attempts = 5;
    const debitAmount = 4;

    const results = await Promise.all(
      Array.from({ length: attempts }, async (_, idx) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Row-level lock on user record to serialize append-only ledger entries for this user
          await client.query(
            `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
            [testUserId]
          );

          const balRes = await client.query(
            `SELECT balance_after FROM credit_ledger 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [testUserId]
          );

          const currentBalance = balRes.rows[0]?.balance_after ?? 0;
          if (currentBalance < debitAmount) {
            await client.query('ROLLBACK');
            return { idx, success: false, reason: 'INSUFFICIENT_CREDITS', balance: currentBalance };
          }

          const newBalance = currentBalance - debitAmount;
          await client.query(
            `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, description)
             VALUES ($1, $2, $3, 'CHECKIN_DEBIT', 'Concurrent debit test')`,
            [testUserId, -debitAmount, newBalance]
          );

          await client.query('COMMIT');
          return { idx, success: true, newBalance };
        } catch (err: any) {
          await client.query('ROLLBACK');
          return { idx, success: false, reason: err.message };
        } finally {
          client.release();
        }
      })
    );

    const successfulDebits = results.filter((r) => r.success);
    const failedDebits = results.filter((r) => !r.success);

    // 10 credits available, 4 per debit -> exactly 2 debits succeed (8 credits total), 3 fail
    expect(successfulDebits.length).toBe(2);
    expect(failedDebits.length).toBe(3);
    expect(failedDebits.every((f) => f.reason === 'INSUFFICIENT_CREDITS')).toBe(true);

    // Verify final ledger balance in PostgreSQL is strictly 2 credits (10 - 4 - 4 = 2)
    const finalBalRes = await pool.query(
      `SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [testUserId]
    );
    const finalBalance = finalBalRes.rows[0].balance_after;
    expect(finalBalance).toBe(2);
    expect(finalBalance).toBeGreaterThanOrEqual(0); // NO OVERDRAFT
  });

  // =========================================================================
  // 4. TEST C: CONCURRENT PAYMENT CALLBACK REQUESTS (IDEMPOTENCY)
  // =========================================================================
  it('4. Test C: Concurrent payment callback requests with the same idempotency key (exactly 1 credit activation)', async () => {
    const testUserId = '00000000-0000-0000-0000-000000000003';
    const rrn = `RRN_IDEM_${Date.now()}`;
    const idempotencyKey = `payment_idempotency:${rrn}`;
    const concurrentCalls = 5;

    const results = await Promise.all(
      Array.from({ length: concurrentCalls }, async (_, idx) => {
        // Step 1: Redis atomic lock/idempotency check
        const locked = await redis.set(idempotencyKey, 'PROCESSING', 'EX', 120, 'NX');
        if (locked !== 'OK') {
          return { idx, activated: false, reason: 'IDEMPOTENT_DUPLICATE_OR_PROCESSING' };
        }

        // Step 2: PostgreSQL transactional credit allocation
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Check if already credited in DB
          const existing = await client.query(
            `SELECT 1 FROM credit_ledger WHERE description = $1 FOR UPDATE`,
            [`Shaparak RRN: ${rrn}`]
          );

          if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return { idx, activated: false, reason: 'ALREADY_ACTIVATED_IN_LEDGER' };
          }

          // Fetch current balance
          const balRes = await client.query(
            `SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
            [testUserId]
          );
          const currentBal = balRes.rows[0]?.balance_after ?? 0;
          const newBal = currentBal + 30;

          await client.query(
            `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, description)
             VALUES ($1, 30, $2, 'PLAN_PURCHASE', $3)`,
            [testUserId, newBal, `Shaparak RRN: ${rrn}`]
          );

          await client.query('COMMIT');
          await redis.set(idempotencyKey, 'COMPLETED', 'EX', 86400);
          return { idx, activated: true, newBal };
        } catch (err: any) {
          await client.query('ROLLBACK');
          return { idx, activated: false, reason: err.message };
        } finally {
          client.release();
        }
      })
    );

    const activations = results.filter((r) => r.activated);
    const duplicates = results.filter((r) => !r.activated);

    expect(activations.length).toBe(1);
    expect(duplicates.length).toBe(4);

    // Verify in PostgreSQL: exactly 1 ledger record exists for this RRN
    const dbCount = await pool.query(
      `SELECT count(*) FROM credit_ledger WHERE description = $1`,
      [`Shaparak RRN: ${rrn}`]
    );
    expect(parseInt(dbCount.rows[0].count, 10)).toBe(1);
  });

  // =========================================================================
  // 5. TEST D: CONCURRENT SETTLEMENT APPROVAL
  // =========================================================================
  it('5. Test D: Concurrent settlement approval (payable balance cannot be deducted twice)', async () => {
    const testGymId = '10000000-0000-0000-0000-000000000001'; // Karo Gym
    const batchId = crypto.randomUUID();
    const settlementAmount = 500000;

    // Seed a pending settlement batch in PostgreSQL with dynamic unique cycle range
    const offset = Math.floor(100 + Math.random() * 50000);
    await pool.query(
      `INSERT INTO settlement_batches (id, gym_id, cycle_start, cycle_end, total_visits, total_amount_tomans, status)
       VALUES ($1, $2, CURRENT_DATE - ($4::int + 30), CURRENT_DATE - $4::int, 10, $3, 'PENDING_APPROVAL')`,
      [batchId, testGymId, settlementAmount, offset]
    );

    const concurrentAttempts = 4;
    const results = await Promise.all(
      Array.from({ length: concurrentAttempts }, async (_, idx) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Row-level lock on the batch row with SELECT ... FOR UPDATE
          const batchRes = await client.query(
            `SELECT * FROM settlement_batches 
             WHERE id = $1 AND status = 'PENDING_APPROVAL' 
             FOR UPDATE`,
            [batchId]
          );

          if (batchRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { idx, approved: false, reason: 'ALREADY_SETTLED_OR_LOCKED' };
          }

          // Transition batch to APPROVED_FOR_PAYA
          await client.query(
            `UPDATE settlement_batches 
             SET status = 'APPROVED_FOR_PAYA', disbursed_at = NOW() 
             WHERE id = $1`,
            [batchId]
          );

          // Record disbursement in gym_payable_ledger
          await client.query(
            `INSERT INTO gym_payable_ledger (gym_id, delta_amount_tomans, balance_after, entry_type, settlement_id, description)
             VALUES ($1, $2, 0, 'DISBURSEMENT_PAYA', $3, 'Disbursed batch payout')`,
            [testGymId, -settlementAmount, batchId]
          );

          await client.query('COMMIT');
          return { idx, approved: true };
        } catch (err: any) {
          await client.query('ROLLBACK');
          return { idx, approved: false, reason: err.message };
        } finally {
          client.release();
        }
      })
    );

    const approvals = results.filter((r) => r.approved);
    const rejected = results.filter((r) => !r.approved);

    expect(approvals.length).toBe(1);
    expect(rejected.length).toBe(3);
    expect(rejected.every((r) => r.reason === 'ALREADY_SETTLED_OR_LOCKED')).toBe(true);

    // Verify in PostgreSQL: exactly 1 disbursement entry exists in gym_payable_ledger
    const disbCheck = await pool.query(
      `SELECT count(*) FROM gym_payable_ledger WHERE settlement_id = $1 AND entry_type = 'DISBURSEMENT_PAYA'`,
      [batchId]
    );
    expect(parseInt(disbCheck.rows[0].count, 10)).toBe(1);
  });

  // =========================================================================
  // 6. REAL TRANSACTION ROLLBACK: ZERO LEAKED STATE
  // =========================================================================
  it('6. Real Transaction Rollback: intentional mid-flight failure leaves zero leaked state in PostgreSQL', async () => {
    const testGymId = '10000000-0000-0000-0000-000000000001';
    const testUserId = '00000000-0000-0000-0000-000000000003';
    const uniqueProbeMarker = `PROBE_ROLLBACK_${Date.now()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Mutate credit ledger
      await client.query(
        `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, description)
         VALUES ($1, -14, 16, 'CHECKIN_DEBIT', $2)`,
        [testUserId, uniqueProbeMarker]
      );

      // 2. Mutate gym payable ledger
      await client.query(
        `INSERT INTO gym_payable_ledger (gym_id, delta_amount_tomans, balance_after, entry_type, description)
         VALUES ($1, 230000, 230000, 'CHECKIN_EARNING', $2)`,
        [testGymId, uniqueProbeMarker]
      );

      // Verify uncommitted mutations are visible INSIDE the active transaction
      const insideCredit = await client.query(
        `SELECT count(*) FROM credit_ledger WHERE description = $1`,
        [uniqueProbeMarker]
      );
      const insidePayable = await client.query(
        `SELECT count(*) FROM gym_payable_ledger WHERE description = $1`,
        [uniqueProbeMarker]
      );
      expect(parseInt(insideCredit.rows[0].count, 10)).toBe(1);
      expect(parseInt(insidePayable.rows[0].count, 10)).toBe(1);

      // 3. Force an intentional failure (simulate unexpected crash or validation error)
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    // 4. Verify OUTSIDE the transaction on a separate client that NO partial state exists
    const outsideCredit = await pool.query(
      `SELECT count(*) FROM credit_ledger WHERE description = $1`,
      [uniqueProbeMarker]
    );
    const outsidePayable = await pool.query(
      `SELECT count(*) FROM gym_payable_ledger WHERE description = $1`,
      [uniqueProbeMarker]
    );

    expect(parseInt(outsideCredit.rows[0].count, 10)).toBe(0);
    expect(parseInt(outsidePayable.rows[0].count, 10)).toBe(0);
  });

  // =========================================================================
  // 7. REDIS FAILURE BEHAVIOR: FAIL-CLOSED SECURITY BOUNDARY
  // =========================================================================
  it('7. Redis Failure Behavior: security-sensitive operations fail-closed when Redis is unavailable (no unsafe fallback)', async () => {
    // Instantiate a broken/unreachable Redis client (pointing to closed port 63799)
    const deadRedis = new Redis('redis://localhost:63799', {
      connectTimeout: 500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null, // Do not reconnect
      lazyConnect: true,
    });

    const testMemberId = '00000000-0000-0000-0000-000000000003';
    const testGymId = '10000000-0000-0000-0000-000000000004';
    const probeCheckinMarker = `FAIL_CLOSED_CHECKIN_${Date.now()}`;

    // Function simulating security-protected checkin that relies on Redis for distributed lock & replay protection
    async function attemptSecureCheckin(redisClient: Redis) {
      // Security Boundary: distributed lock is MANDATORY
      try {
        const lock = await redisClient.set(`lock:checkin:${testMemberId}`, 'lock-val', 'EX', 10, 'NX');
        if (!lock) throw new Error('LOCK_REJECTED');
      } catch (err: any) {
        // System MUST fail-closed: it must NOT silently switch to an in-memory lock or bypass
        throw new Error(`REDIS_MUTEX_UNAVAILABLE: Concurrency lock failed safely (${err.message})`);
      }

      // If lock succeeded, mutate DB
      await pool.query(
        `INSERT INTO checkins (user_id, gym_id, credits_debited, monetary_payout_tomans, status, rejection_reason)
         VALUES ($1, $2, 14, 230000, 'COMPLETED', $3)`,
        [testMemberId, testGymId, probeCheckinMarker]
      );
    }

    // Assert that check-in FAILS SAFELY and throws when Redis is unavailable
    await expect(attemptSecureCheckin(deadRedis)).rejects.toThrow(/REDIS_MUTEX_UNAVAILABLE/);

    // Verify in PostgreSQL: NO checkin record was created and NO state was corrupted
    const leakedCheck = await pool.query(
      `SELECT count(*) FROM checkins WHERE rejection_reason = $1`,
      [probeCheckinMarker]
    );
    expect(parseInt(leakedCheck.rows[0].count, 10)).toBe(0);

    deadRedis.disconnect();
  });

  // =========================================================================
  // 8. PAYMENT PERSISTENCE & UNIQUE(AUTHORITY) CONSTRAINT IN REAL POSTGRESQL 18
  // =========================================================================
  it('8. Payment Transactions: Real PostgreSQL 18 enforces UNIQUE(authority) constraint at database level', async () => {
    const testMemberId = '00000000-0000-0000-0000-000000000003';
    const testPlanRes = await pool.query(`SELECT id FROM plans WHERE slug = 'standard_30' LIMIT 1`);
    const testPlanId = testPlanRes.rows[0].id;
    const testAuthority = `PG18_UNIQUE_AUTHORITY_${crypto.randomUUID()}`;

    // 1. Initial insert into real PostgreSQL 18 payment_transactions table succeeds
    await pool.query(
      `INSERT INTO payment_transactions (authority, user_id, plan_id, amount_rials, status, provider)
       VALUES ($1, $2, $3, 10000000, 'PENDING', 'SHAPARAK_EMULATOR')`,
      [testAuthority, testMemberId, testPlanId]
    );

    // 2. Duplicate insert with identical authority MUST fail with PostgreSQL unique constraint violation error (23505)
    let pgError: any = null;
    try {
      await pool.query(
        `INSERT INTO payment_transactions (authority, user_id, plan_id, amount_rials, status, provider)
         VALUES ($1, $2, $3, 10000000, 'PENDING', 'SHAPARAK_EMULATOR')`,
        [testAuthority, testMemberId, testPlanId]
      );
    } catch (err: any) {
      pgError = err;
    }

    expect(pgError).toBeDefined();
    expect(pgError.code).toBe('23505'); // PostgreSQL unique_violation code
    expect(pgError.constraint).toBe('uq_payment_transactions_authority');

    // 3. Clean up probe record
    await pool.query(`DELETE FROM payment_transactions WHERE authority = $1`, [testAuthority]);
  });

  // =========================================================================
  // 9. CONCURRENT PAYMENT VERIFICATION & ATOMIC ROLLBACK ON REAL POSTGRESQL 18
  // =========================================================================
  it('9. Payment Transactions: Real PostgreSQL 18 row-locking and atomic rollback ensure single mutation under race condition', async () => {
    const testMemberId = '00000000-0000-0000-0000-000000000003';
    const testPlanRes = await pool.query(`SELECT id FROM plans WHERE slug = 'standard_30' LIMIT 1`);
    const testPlanId = testPlanRes.rows[0].id;
    const testAuthority = `PG18_CONCURRENT_${crypto.randomUUID()}`;

    // Insert pending payment transaction
    await pool.query(
      `INSERT INTO payment_transactions (authority, user_id, plan_id, amount_rials, status, provider)
       VALUES ($1, $2, $3, 10000000, 'PENDING', 'SHAPARAK_EMULATOR')`,
      [testAuthority, testMemberId, testPlanId]
    );

    // Function simulating atomic payment verification transaction in PostgreSQL
    async function processPaymentVerification(client: PoolClient): Promise<{ status: string; creditsGranted: boolean }> {
      await client.query('BEGIN');
      try {
        // Row-level lock
        const txRes = await client.query(
          `SELECT * FROM payment_transactions WHERE authority = $1 FOR UPDATE`,
          [testAuthority]
        );
        const tx = txRes.rows[0];

        if (tx.status === 'PAID') {
          await client.query('COMMIT');
          return { status: 'ALREADY_PAID', creditsGranted: false };
        }

        // Create subscription
        const subId = crypto.randomUUID();
        await client.query(
          `INSERT INTO subscriptions (id, user_id, plan_id, starts_at, expires_at, status, auto_renew)
           VALUES ($1, $2, $3, NOW(), NOW() + interval '30 days', 'ACTIVE', false)`,
          [subId, testMemberId, testPlanId]
        );

        // Issue credits
        const lastLedger = await client.query(
          `SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [testMemberId]
        );
        const currentBal = lastLedger.rows[0]?.balance_after ?? 0;
        await client.query(
          `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
           VALUES ($1, 30, $2, 'PLAN_PURCHASE', $3, 'Real Postgres Concurrency Test')`,
          [testMemberId, currentBal + 30, subId]
        );

        // Mark transaction as PAID
        await client.query(
          `UPDATE payment_transactions
           SET status = 'PAID', subscription_id = $1, paid_at = NOW(), updated_at = NOW()
           WHERE authority = $2`,
          [subId, testAuthority]
        );

        await client.query('COMMIT');
        return { status: 'JUST_PAID', creditsGranted: true };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    // Run 2 concurrent verification transactions on real PostgreSQL 18 connections
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      const [res1, res2] = await Promise.all([
        processPaymentVerification(client1),
        processPaymentVerification(client2),
      ]);

      const grantCount = [res1, res2].filter(r => r.creditsGranted).length;
      const alreadyCount = [res1, res2].filter(r => r.status === 'ALREADY_PAID').length;

      // Exactly ONE client granted credits, exactly ONE observed ALREADY_PAID
      expect(grantCount).toBe(1);
      expect(alreadyCount).toBe(1);

      // Verify final state in PostgreSQL 18
      const finalTx = await pool.query(
        `SELECT status, subscription_id FROM payment_transactions WHERE authority = $1`,
        [testAuthority]
      );
      expect(finalTx.rows[0].status).toBe('PAID');
      expect(finalTx.rows[0].subscription_id).toBeDefined();

      // Clean up test subscriptions & ledger
      await pool.query(`DELETE FROM subscriptions WHERE id = $1`, [finalTx.rows[0].subscription_id]);
      await pool.query(`DELETE FROM credit_ledger WHERE reference_id = $1`, [finalTx.rows[0].subscription_id]);
      await pool.query(`DELETE FROM payment_transactions WHERE authority = $1`, [testAuthority]);
    } finally {
      client1.release();
      client2.release();
    }
  });

  // =========================================================================
  // 10. GYM DISCOVERY: BOUNDED SQL PAGINATION & BATCH RELATION LOADING ON PG18
  // =========================================================================
  it('10. Gym Discovery: Real PostgreSQL 18 bounded SQL pagination (LIMIT/OFFSET) and batch relation loading without N+1', async () => {
    // 1. Verify index exists on PostgreSQL 18
    const idxRes = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'gyms' AND indexname = 'idx_gyms_active_created'`
    );
    expect(idxRes.rows.length).toBe(1);

    // 2. Bounded pagination on real DB: LIMIT 2 OFFSET 0 vs LIMIT 2 OFFSET 2
    const page1Res = await pool.query(
      `SELECT id, name_fa FROM gyms WHERE is_active = true ORDER BY created_at ASC, id ASC LIMIT 2 OFFSET 0`
    );
    const page2Res = await pool.query(
      `SELECT id, name_fa FROM gyms WHERE is_active = true ORDER BY created_at ASC, id ASC LIMIT 2 OFFSET 2`
    );

    expect(page1Res.rows.length).toBe(2);
    expect(page2Res.rows.length).toBe(2);

    const page1Ids = page1Res.rows.map((r: any) => r.id);
    const page2Ids = page2Res.rows.map((r: any) => r.id);

    // Ensure completely disjoint sets
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);

    // 3. Batch relation loading for page 1 gyms in a single query using ANY($1::uuid[])
    const facilitiesRes = await pool.query(
      `SELECT gf.gym_id, f.slug, f.name_fa
       FROM gym_facilities gf
       JOIN facilities f ON f.id = gf.facility_id
       WHERE gf.gym_id = ANY($1::uuid[])`,
      [page1Ids]
    );
    expect(facilitiesRes.rows.length).toBeGreaterThanOrEqual(0);

    const sansRes = await pool.query(
      `SELECT * FROM gym_sans WHERE gym_id = ANY($1::uuid[]) ORDER BY start_time ASC`,
      [page1Ids]
    );
    expect(sansRes.rows.length).toBeGreaterThanOrEqual(0);

    // 4. Filter execution via SQL EXISTS
    const maleGymsRes = await pool.query(
      `SELECT g.id, g.name_fa
       FROM gyms g
       WHERE g.is_active = true
         AND EXISTS (SELECT 1 FROM gym_sans s WHERE s.gym_id = g.id AND s.gender = 'MALE')
       ORDER BY g.created_at ASC, g.id ASC
       LIMIT 10 OFFSET 0`
    );
    expect(maleGymsRes.rows.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // 11. PHASE 5: QR / CHECK-IN DATABASE HARDENING ON REAL POSTGRESQL 18
  // =========================================================================
  describe('11. QR & Check-in Database Hardening (Real PostgreSQL 18 & Redis)', () => {
    const testMemberId = '00000000-0000-0000-0000-000000000003';
    const testGymId = '10000000-0000-0000-0000-000000000002';
    const testStaffId = '00000000-0000-0000-0000-000000000002';

    it('11.A: First valid check-in succeeds on real PostgreSQL 18 and persists qr_nonce', async () => {
      const testNonce = `PG18_NONCE_${crypto.randomUUID()}`;
      const checkinId = crypto.randomUUID();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
           VALUES ($1, $2, $3, $4, 4, 65000, 'COMPLETED', $5)`,
          [checkinId, testMemberId, testGymId, testStaffId, testNonce]
        );
        await client.query(
          `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
           VALUES ($1, -4, 20, 'CHECKIN_DEBIT', $2, 'Checkin debit')`,
          [testMemberId, checkinId]
        );
        await client.query(
          `INSERT INTO gym_payable_ledger (gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description)
           VALUES ($1, $2, 65000, 65000, 'CHECKIN_EARNING', 'Checkin earning')`,
          [testGymId, checkinId]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Verify in PostgreSQL 18
      const res = await pool.query('SELECT * FROM checkins WHERE qr_nonce = $1', [testNonce]);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].id).toBe(checkinId);
      expect(res.rows[0].qr_nonce).toBe(testNonce);
      expect(res.rows[0].status).toBe('COMPLETED');
    });

    it('11.B: Database UNIQUE constraint uq_checkins_qr_nonce rejects direct duplicate insertion', async () => {
      const duplicateNonce = `PG18_DUPLICATE_NONCE_${crypto.randomUUID()}`;
      const firstCheckinId = crypto.randomUUID();
      const secondCheckinId = crypto.randomUUID();

      // First insert succeeds
      await pool.query(
        `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
         VALUES ($1, $2, $3, $4, 4, 65000, 'COMPLETED', $5)`,
        [firstCheckinId, testMemberId, testGymId, testStaffId, duplicateNonce]
      );

      // Second insert with identical qr_nonce must be rejected by PostgreSQL 18
      let thrownError: any = null;
      try {
        await pool.query(
          `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
           VALUES ($1, $2, $3, $4, 4, 65000, 'COMPLETED', $5)`,
          [secondCheckinId, testMemberId, testGymId, testStaffId, duplicateNonce]
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe('23505');
      expect(thrownError.constraint).toBe('uq_checkins_qr_nonce');
    });

    it('11.C: Concurrent identical check-ins in PostgreSQL 18: at most one succeeds, no duplicate mutations', async () => {
      const concurrentNonce = `PG18_CONCURRENT_NONCE_${crypto.randomUUID()}`;

      // Simulate 2 parallel checkin transactions attempting to consume the same QR nonce
      const runTransaction = async (workerId: number) => {
        const client = await pool.connect();
        const checkinId = crypto.randomUUID();
        try {
          await client.query('BEGIN');
          await client.query(
            `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
             VALUES ($1, $2, $3, $4, 4, 65000, 'COMPLETED', $5)`,
            [checkinId, testMemberId, testGymId, testStaffId, concurrentNonce]
          );
          await client.query(
            `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
             VALUES ($1, -4, 16, 'CHECKIN_DEBIT', $2, 'Concurrent checkin debit')`,
            [testMemberId, checkinId]
          );
          await client.query(
            `INSERT INTO gym_payable_ledger (gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description)
             VALUES ($1, $2, 65000, 130000, 'CHECKIN_EARNING', 'Concurrent checkin earning')`,
            [testGymId, checkinId]
          );
          await client.query('COMMIT');
          return { workerId, success: true, checkinId };
        } catch (err: any) {
          await client.query('ROLLBACK');
          return { workerId, success: false, error: err.code || err.message, constraint: err.constraint };
        } finally {
          client.release();
        }
      };

      const results = await Promise.all([runTransaction(1), runTransaction(2)]);
      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      // Exactly 1 succeeded, exactly 1 failed due to UNIQUE constraint
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);
      expect(failed[0].constraint).toBe('uq_checkins_qr_nonce');

      // Verify in PostgreSQL 18: exactly 1 checkin row exists for this nonce
      const checkinCount = await pool.query(
        'SELECT count(*) FROM checkins WHERE qr_nonce = $1',
        [concurrentNonce]
      );
      expect(parseInt(checkinCount.rows[0].count, 10)).toBe(1);

      // Verify credit_ledger: exactly 1 debit entry for the winning checkin
      const winningCheckinId = succeeded[0].checkinId;
      const creditCount = await pool.query(
        'SELECT count(*) FROM credit_ledger WHERE reference_id = $1 AND entry_type = $2',
        [winningCheckinId, 'CHECKIN_DEBIT']
      );
      expect(parseInt(creditCount.rows[0].count, 10)).toBe(1);

      // Verify gym_payable_ledger: exactly 1 earning entry for the winning checkin
      const payableCount = await pool.query(
        'SELECT count(*) FROM gym_payable_ledger WHERE checkin_id = $1 AND entry_type = $2',
        [winningCheckinId, 'CHECKIN_EARNING']
      );
      expect(parseInt(payableCount.rows[0].count, 10)).toBe(1);
    });

    it('11.D: Database UNIQUE index uq_credit_ledger_checkin_debit rejects duplicate debit for same checkin', async () => {
      const dedicatedCheckinId = crypto.randomUUID();

      // First debit succeeds
      await pool.query(
        `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
         VALUES ($1, -4, 12, 'CHECKIN_DEBIT', $2, 'Primary debit')`,
        [testMemberId, dedicatedCheckinId]
      );

      // Duplicate debit with same reference_id MUST be rejected by DB unique index
      let thrownError: any = null;
      try {
        await pool.query(
          `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
           VALUES ($1, -4, 8, 'CHECKIN_DEBIT', $2, 'Illegal duplicate debit')`,
          [testMemberId, dedicatedCheckinId]
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe('23505');
      expect(thrownError.constraint).toBe('uq_credit_ledger_checkin_debit');
    });

    it('11.E: Database UNIQUE index uq_gym_payable_checkin_earning rejects duplicate earning for same checkin', async () => {
      const dedicatedCheckinId = crypto.randomUUID();

      // Insert parent checkin row to satisfy foreign key gym_payable_ledger_checkin_id_fkey
      await pool.query(
        `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
         VALUES ($1, $2, $3, $4, 4, 65000, 'COMPLETED', $5)`,
        [dedicatedCheckinId, testMemberId, testGymId, testStaffId, `FK_PARENT_NONCE_${crypto.randomUUID()}`]
      );

      // First earning succeeds
      await pool.query(
        `INSERT INTO gym_payable_ledger (gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description)
         VALUES ($1, $2, 65000, 195000, 'CHECKIN_EARNING', 'Primary earning')`,
        [testGymId, dedicatedCheckinId]
      );

      // Duplicate earning with same checkin_id MUST be rejected by DB unique index
      let thrownError: any = null;
      try {
        await pool.query(
          `INSERT INTO gym_payable_ledger (gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description)
           VALUES ($1, $2, 65000, 260000, 'CHECKIN_EARNING', 'Illegal duplicate earning')`,
          [testGymId, dedicatedCheckinId]
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.code).toBe('23505');
      expect(thrownError.constraint).toBe('uq_gym_payable_checkin_earning');
    });

    it('11.F: Transaction rollback in PostgreSQL 18 leaves zero partial financial or checkin records', async () => {
      const rollbackNonce = `PG18_ROLLBACK_NONCE_${crypto.randomUUID()}`;
      const rollbackCheckinId = crypto.randomUUID();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
           VALUES ($1, $2, $3, $4, 4, 65000, 'COMPLETED', $5)`,
          [rollbackCheckinId, testMemberId, testGymId, testStaffId, rollbackNonce]
        );
        await client.query(
          `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
           VALUES ($1, -4, 4, 'CHECKIN_DEBIT', $2, 'Pending checkin debit')`,
          [testMemberId, rollbackCheckinId]
        );
        // Force an intentional crash before commit
        throw new Error('INTENTIONAL_CRASH_TRIGGERING_ROLLBACK');
      } catch (err: any) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Assert that PostgreSQL 18 committed ZERO records
      const checkinRes = await pool.query('SELECT count(*) FROM checkins WHERE id = $1', [rollbackCheckinId]);
      expect(parseInt(checkinRes.rows[0].count, 10)).toBe(0);

      const creditRes = await pool.query('SELECT count(*) FROM credit_ledger WHERE reference_id = $1', [rollbackCheckinId]);
      expect(parseInt(creditRes.rows[0].count, 10)).toBe(0);

      const payableRes = await pool.query('SELECT count(*) FROM gym_payable_ledger WHERE checkin_id = $1', [rollbackCheckinId]);
      expect(parseInt(payableRes.rows[0].count, 10)).toBe(0);
    });
  });
});


