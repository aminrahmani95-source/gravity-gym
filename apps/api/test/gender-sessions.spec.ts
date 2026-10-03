import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { CreditLedgerEntryType, Gender, GymAccessMode } from '@gym-app/shared-types';
import { getTehranTimeInfo } from '../src/common/utils/tehran-time.util';

describe('Gender Access & Gym Sessions - 10 Critical Edge Cases', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let ledger: LedgerService;
  let economics: EconomicsService;
  let checkin: CheckinService;

  const maleUserId = 'user-member-1';   // Ali (MALE)
  const femaleUserId = 'user-member-2'; // Sara (FEMALE)
  const staffUserId = 'user-staff';

  const femaleGymId = 'gym-basic-1';    // Caro (FEMALE_ONLY)
  const maleGymId = 'gym-plus-2';       // Setareh Vanak (MALE_ONLY)
  const mixedGymId = 'gym-premium-3';   // Oxygen Royal (MIXED)

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    await redis.onModuleInit();
    ledger = new LedgerService(db);
    economics = new EconomicsService(db);
    checkin = new CheckinService(db, redis, ledger, economics);

    // Provide credit balance for both test members
    await ledger.issueCredits(maleUserId, 50, CreditLedgerEntryType.PLAN_PURCHASE);
    await ledger.issueCredits(femaleUserId, 50, CreditLedgerEntryType.PLAN_PURCHASE);
  });

  // Helper to configure gym_sans for tests at the current Tehran time
  function configureActiveSession(gymId: string, gender: Gender, dayOfWeek: number) {
    const sansTable = db.getTable('gym_sans');
    const existingIdx = sansTable.findIndex(s => s.gym_id === gymId && s.day_of_week === dayOfWeek);
    if (existingIdx !== -1) {
      sansTable.splice(existingIdx, 1);
    }
    sansTable.unshift({
      id: `sans-active-${gymId}-${gender}`,
      gym_id: gymId,
      day_of_week: dayOfWeek,
      gender,
      start_time: '00:00:00',
      end_time: '23:59:59',
      capacity: 40,
      is_peak: false,
    });
  }

  // =========================================================================
  // CASE 1: Female member + Female-only gym + active female session -> PASS
  // =========================================================================
  it('Case 1: Female member + Female-only gym + active session -> PASS (201)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    configureActiveSession(femaleGymId, Gender.FEMALE, iranianDayOfWeek);

    const { qrToken } = await checkin.generateDynamicQr(femaleUserId, femaleGymId);
    const result = await checkin.verifyAndConsumeCheckin(qrToken, staffUserId, femaleGymId);

    expect(result.status).toBe('APPROVED');
    expect(result.member?.gender).toBe(Gender.FEMALE);
  });

  // =========================================================================
  // CASE 2: Male member + Male-only gym + active male session -> PASS
  // =========================================================================
  it('Case 2: Male member + Male-only gym + active session -> PASS (201)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    configureActiveSession(maleGymId, Gender.MALE, iranianDayOfWeek);

    const { qrToken } = await checkin.generateDynamicQr(maleUserId, maleGymId);
    const result = await checkin.verifyAndConsumeCheckin(qrToken, staffUserId, maleGymId);

    expect(result.status).toBe('APPROVED');
    expect(result.member?.gender).toBe(Gender.MALE);
  });

  // =========================================================================
  // CASE 3: Female member + Male-only gym -> DENY (403 Forbidden)
  // =========================================================================
  it('Case 3: Female member attempting check-in at Male-only gym -> DENY (403)', async () => {
    const { qrToken } = await checkin.generateDynamicQr(femaleUserId, maleGymId);

    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, staffUserId, maleGymId)
    ).rejects.toThrow(/این مجموعه ورزشی کاملاً ویژه آقایان است/);
  });

  // =========================================================================
  // CASE 4: Male member + Female-only gym -> DENY (403 Forbidden)
  // =========================================================================
  it('Case 4: Male member attempting check-in at Female-only gym -> DENY (403)', async () => {
    const { qrToken } = await checkin.generateDynamicQr(maleUserId, femaleGymId);

    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, staffUserId, femaleGymId)
    ).rejects.toThrow(/این مجموعه ورزشی کاملاً ویژه بانوان است/);
  });

  // =========================================================================
  // CASE 5: Female member + Mixed gym + Female session active -> PASS
  // =========================================================================
  it('Case 5: Female member + Mixed gym + Female session active -> PASS (201)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    configureActiveSession(mixedGymId, Gender.FEMALE, iranianDayOfWeek);

    const { qrToken } = await checkin.generateDynamicQr(femaleUserId, mixedGymId);
    const result = await checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId);

    expect(result.status).toBe('APPROVED');
    expect(result.member?.gender).toBe(Gender.FEMALE);
  });

  // =========================================================================
  // CASE 6: Female member + Mixed gym + Male session active -> DENY (403 Forbidden)
  // =========================================================================
  it('Case 6: Female member + Mixed gym + Male session active -> DENY (403)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    // Configure session as strictly MALE for today
    const sansTable = db.getTable('gym_sans');
    const existing = sansTable.filter(s => s.gym_id === mixedGymId && s.day_of_week === iranianDayOfWeek);
    for (const e of existing) {
      sansTable.splice(sansTable.indexOf(e), 1);
    }
    sansTable.push({
      id: `sans-case6-${mixedGymId}`,
      gym_id: mixedGymId,
      day_of_week: iranianDayOfWeek,
      gender: Gender.MALE,
      start_time: '00:00:00',
      end_time: '23:59:59',
      capacity: 30,
      is_peak: false,
    });

    const { qrToken } = await checkin.generateDynamicQr(femaleUserId, mixedGymId);

    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId)
    ).rejects.toThrow(/تداخل سانس جنسیتی.*سانس اختصاصی آقایان برقرار است/);
  });

  // =========================================================================
  // CASE 7: Male member + Mixed gym + Female session active -> DENY (403 Forbidden)
  // =========================================================================
  it('Case 7: Male member + Mixed gym + Female session active -> DENY (403)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    // Configure session as strictly FEMALE for today
    const sansTable = db.getTable('gym_sans');
    const existing = sansTable.filter(s => s.gym_id === mixedGymId && s.day_of_week === iranianDayOfWeek);
    for (const e of existing) {
      sansTable.splice(sansTable.indexOf(e), 1);
    }
    sansTable.push({
      id: `sans-case7-${mixedGymId}`,
      gym_id: mixedGymId,
      day_of_week: iranianDayOfWeek,
      gender: Gender.FEMALE,
      start_time: '00:00:00',
      end_time: '23:59:59',
      capacity: 30,
      is_peak: false,
    });

    const { qrToken } = await checkin.generateDynamicQr(maleUserId, mixedGymId);

    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId)
    ).rejects.toThrow(/تداخل سانس جنسیتی.*سانس اختصاصی بانوان برقرار است/);
  });

  // =========================================================================
  // CASE 8: Male member + Mixed gym + Male session active -> PASS
  // =========================================================================
  it('Case 8: Male member + Mixed gym + Male session active -> PASS (201)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    configureActiveSession(mixedGymId, Gender.MALE, iranianDayOfWeek);

    const { qrToken } = await checkin.generateDynamicQr(maleUserId, mixedGymId);
    const result = await checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId);

    expect(result.status).toBe('APPROVED');
    expect(result.member?.gender).toBe(Gender.MALE);
  });

  // =========================================================================
  // CASE 9: Correct gender but outside session time -> DENY (400 Bad Request)
  // =========================================================================
  it('Case 9: Correct gender but outside session time -> DENY (400 Bad Request)', async () => {
    const { iranianDayOfWeek, currentTimeStr } = getTehranTimeInfo();
    const [currentHour] = currentTimeStr.split(':').map(Number);
    // Dynamically choose a 1-hour window offset by 6 hours so it never includes current time
    const startH = String((currentHour + 6) % 24).padStart(2, '0');
    const endH = String((currentHour + 7) % 24).padStart(2, '0');

    // Configure session for a time slot that does NOT cover current time
    const sansTable = db.getTable('gym_sans');
    const existing = sansTable.filter(s => s.gym_id === mixedGymId && s.day_of_week === iranianDayOfWeek);
    for (const e of existing) {
      sansTable.splice(sansTable.indexOf(e), 1);
    }
    sansTable.push({
      id: `sans-case9-${mixedGymId}`,
      gym_id: mixedGymId,
      day_of_week: iranianDayOfWeek,
      gender: Gender.MALE,
      start_time: `${startH}:00:00`,
      end_time: `${endH}:00:00`,
      capacity: 30,
      is_peak: false,
    });

    const { qrToken } = await checkin.generateDynamicQr(maleUserId, mixedGymId);

    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId)
    ).rejects.toThrow(/دارای سانس فعال نمی‌باشد/);
  });

  // =========================================================================
  // CASE 10: Correct gender + correct session + invalid/replayed QR -> DENY
  // =========================================================================
  it('Case 10: Correct gender + correct session + replayed QR -> DENY (400 Anti-Replay)', async () => {
    const { iranianDayOfWeek } = getTehranTimeInfo();
    configureActiveSession(mixedGymId, Gender.MALE, iranianDayOfWeek);

    const { qrToken } = await checkin.generateDynamicQr(maleUserId, mixedGymId);

    // 1st scan: Succeeds
    const firstScan = await checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId);
    expect(firstScan.status).toBe('APPROVED');

    // 2nd scan with identical token: Replay attack strictly denied
    await expect(
      checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId)
    ).rejects.toThrow(/این بارکد قبلاً استفاده شده است/);
  });
});
