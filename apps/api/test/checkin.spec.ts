import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { CreditLedgerEntryType, UserRole } from '@gym-app/shared-types';

describe('8-Stage Check-in Validation & Privacy Tests', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let ledger: LedgerService;
  let economics: EconomicsService;
  let checkin: CheckinService;

  const testUserId = 'user-member-1'; // Ali Ahmadi (Male)
  const testStaffId = 'user-staff';
  const testGymId = 'gym-plus-2';    // Setareh Vanak (C = 4 cr, M = 65,000 T)

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    await redis.onModuleInit();
    ledger = new LedgerService(db);
    economics = new EconomicsService(db);
    checkin = new CheckinService(db, redis, ledger, economics);

    // Seed test member with 30 credits
    await ledger.issueCredits(testUserId, 30, CreditLedgerEntryType.PLAN_PURCHASE);

    // Ensure active Male sans for test gym during test execution regardless of time of day
    const now = new Date();
    const currentTimeStr = now.toTimeString().split(' ')[0];
    const day = (now.getDay() + 1) % 7;
    const sansTable = db.getTable('gym_sans');
    const idx = sansTable.findIndex(s => s.gym_id === testGymId && s.day_of_week === day && s.start_time <= currentTimeStr && s.end_time >= currentTimeStr);
    if (idx !== -1) {
      sansTable.splice(idx, 1);
    }
    sansTable.unshift({
      id: `sans-test-${testGymId}`,
      gym_id: testGymId,
      day_of_week: day,
      gender: 'MALE',
      start_time: '00:00:00',
      end_time: '23:59:59',
      capacity: 50,
      is_peak: true,
    });
  });

  it('should generate a signed dynamic QR token with 45s validity', async () => {
    const res = await checkin.generateDynamicQr(testUserId, testGymId);

    expect(res.qrToken).toBeDefined();
    expect(res.expiresInSeconds).toBe(45);
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should successfully execute the 8-Stage Validation Pipeline on valid counter scan', async () => {
    const initialCredits = await ledger.getBalance(testUserId);
    const initialGymPayable = await ledger.getGymPayableBalance(testGymId);

    const { qrToken } = await checkin.generateDynamicQr(testUserId, testGymId);

    // Front-desk receptionist scans QR token
    const result = await checkin.verifyAndConsumeCheckin(qrToken, testStaffId, testGymId);

    expect(result.status).toBe('APPROVED');
    expect(result.checkinId).toBeDefined();
    const debited = result.visitDetails?.creditsDebited;
    expect(debited).toBeGreaterThanOrEqual(4); // Plus gym base 4, peak 5

    // Verify Ledger Stage 8: Exactly debited credits deducted from user
    const finalCredits = await ledger.getBalance(testUserId);
    expect(finalCredits).toBe(initialCredits - (debited ?? 4));

    // Exactly 65,000 Tomans credited to gym payable account
    const finalGymPayable = await ledger.getGymPayableBalance(testGymId);
    expect(finalGymPayable).toBe(initialGymPayable + 65000);
  });

  it('should block Replay Attacks: Scanning the exact same QR token twice must fail', async () => {
    const { qrToken } = await checkin.generateDynamicQr(testUserId, testGymId);

    // First scan: Approved
    const firstScan = await checkin.verifyAndConsumeCheckin(qrToken, testStaffId, testGymId);
    expect(firstScan.status).toBe('APPROVED');

    // Second scan with identical QR: Must fail due to nonce consumption (Stage 2)
    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, testStaffId, testGymId)
    ).rejects.toThrow(/این بارکد قبلاً استفاده شده است/);
  });

  it('should reject QR codes presented at a different gym than issued (cross-venue fraud protection)', async () => {
    const { qrToken } = await checkin.generateDynamicQr(testUserId, testGymId);

    // Receptionist at gym-elite-4 attempts to scan QR generated for testGymId (gym-plus-2)
    const otherGymId = 'gym-elite-4';
    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, testStaffId, otherGymId)
    ).rejects.toThrow(/این بارکد برای مجموعه ورزشی دیگری صادر شده است/);
  });

  it('should enforce intra-club cooldown window (Stage 7)', async () => {
    const { qrToken: qr1 } = await checkin.generateDynamicQr(testUserId, testGymId);
    await checkin.verifyAndConsumeCheckin(qr1, testStaffId, testGymId);

    // Generate a new fresh QR token for the same user immediately
    const { qrToken: qr2 } = await checkin.generateDynamicQr(testUserId, testGymId);

    // Attempting another checkin at the same gym within cooldown window must fail
    await expect(
      checkin.verifyAndConsumeCheckin(qr2, testStaffId, testGymId)
    ).rejects.toThrow(/فاصله زمانی مجاز تا ورود بعدی در این مجموعه رعایت نشده است/);
  });

  it('should strictly preserve member privacy by suppressing National Code on reception screen', async () => {
    const { qrToken } = await checkin.generateDynamicQr(testUserId, testGymId);
    const result = await checkin.verifyAndConsumeCheckin(qrToken, testStaffId, testGymId);

    // Verified privacy requirements:
    expect((result.member as any)?.nationalCode).toBeUndefined();
    expect((result.member as any)?.phoneNumber).toBeUndefined();

    // Allowed verification attributes:
    expect(result.member?.fullName).toBe('علی احمدی');
    expect(result.member?.gender).toBe('MALE');
    expect(result.member?.subscriptionTitle).toBeDefined();
  });

  it('should strictly enforce 45s QR cryptographic expiration even when nonce retention is 90s', async () => {
    const crypto = await import('crypto');
    const secret = (checkin as any).qrSecret;
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Token generated 50 seconds ago: expired by 5s (> 45s validity), but well within 90s nonce TTL
    const iat = nowSeconds - 50;
    const exp = nowSeconds - 5; // expired 5 seconds ago
    const nonce = 'fresh-test-nonce-1';
    const payloadToSign = `${testUserId}:${testGymId}:${iat}:${exp}:${nonce}`;
    const sig = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');

    const expiredToken = Buffer.from(
      JSON.stringify({ sub: testUserId, gymId: testGymId, iat, exp, nonce, sig })
    ).toString('base64url');

    // 1. Proof: Age rule (Stage 3) strictly rejects token expired after 45s, even though nonce is unconsumed
    await expect(
      checkin.verifyAndConsumeCheckin(expiredToken, testStaffId, testGymId)
    ).rejects.toThrow(/بارکد ورود منقضی شده است/);

    // 2. Proof: Attacker cannot extend expiration to 90s without invalidating HMAC signature
    const tamperedPayload = { sub: testUserId, gymId: testGymId, iat, exp: nowSeconds + 40, nonce: 'fresh-tampered-nonce-2', sig };
    const tamperedToken = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');

    await expect(
      checkin.verifyAndConsumeCheckin(tamperedToken, testStaffId, testGymId)
    ).rejects.toThrow(/امضای رمزنگاری بارکد نامعتبر یا دستکاری شده است/);
  });

  it('should reject QR generation if gym does not exist or is inactive', async () => {
    // Non-existent gym
    await expect(
      checkin.generateDynamicQr(testUserId, 'gym-does-not-exist')
    ).rejects.toThrow(/مجموعه ورزشی مورد نظر یافت نشد/);

    // Inactive gym
    const gymTable = db.getTable('gyms');
    const targetGym = gymTable.find(g => g.id === testGymId);
    if (targetGym) {
      targetGym.is_active = false;
      await expect(
        checkin.generateDynamicQr(testUserId, testGymId)
      ).rejects.toThrow(/مجموعه ورزشی مورد نظر در حال حاضر غیرفعال می‌باشد/);
      targetGym.is_active = true; // restore
    }
  });

  it('should reject QR generation if member balance is less than required gym credit cost', async () => {
    const poorUserId = 'user-member-poor';
    db.getTable('users').push({
      id: poorUserId,
      phone_number: '09129998877',
      role: 'USER',
      status: 'ACTIVE',
      gender: 'MALE',
      created_at: new Date().toISOString(),
    });

    // Issue only 1 credit (gym-plus-2 requires 4 or 5 credits)
    await ledger.issueCredits(poorUserId, 1, CreditLedgerEntryType.PLAN_PURCHASE);

    await expect(
      checkin.generateDynamicQr(poorUserId, testGymId)
    ).rejects.toThrow(/موجودی اعتبار شما/);
  });
});

