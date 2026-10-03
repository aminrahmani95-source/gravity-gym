import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { GymsService } from '../src/modules/gyms/gyms.service';
import { CreditLedgerEntryType, Gender, GymAccessMode } from '@gym-app/shared-types';
import {
  getTehranTimeInfo,
  isSansActiveAt,
  doSessionsOverlap,
  getSessionWeeklyIntervals,
} from '../src/common/utils/tehran-time.util';

describe('Overnight Sessions (Midnight Crossing) Suite', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let ledger: LedgerService;
  let economics: EconomicsService;
  let checkin: CheckinService;
  let admin: AdminService;
  let gymsService: GymsService;

  const maleUserId = 'user-member-1';
  const femaleUserId = 'user-member-2';
  const staffUserId = 'user-staff';
  const mixedGymId = 'gym-elite-4'; // Espinas Palace (Elite, MIXED)

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    await redis.onModuleInit();
    ledger = new LedgerService(db);
    economics = new EconomicsService(db);
    checkin = new CheckinService(db, redis, ledger, economics);
    admin = new AdminService(db);
    gymsService = new GymsService(db);

    await ledger.issueCredits(maleUserId, 50, CreditLedgerEntryType.PLAN_PURCHASE);
    await ledger.issueCredits(femaleUserId, 50, CreditLedgerEntryType.PLAN_PURCHASE);
  });

  // =========================================================================
  // 1. Timezone & Active Window Precision Tests for 14:30 -> 05:00
  // =========================================================================
  describe('Active Window Precision: Saturday Male 14:30 -> 05:00', () => {
    const saturdayOvernightSans = {
      dayOfWeek: 0, // Saturday (شنبه)
      startTime: '14:30:00',
      endTime: '05:00:00',
    };

    it('should be ACTIVE on Saturday at 14:30', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 0, '14:30:00')).toBe(true);
    });

    it('should be ACTIVE on Saturday at 18:00', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 0, '18:00:00')).toBe(true);
    });

    it('should be ACTIVE on Saturday at 23:59', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 0, '23:59:00')).toBe(true);
      expect(isSansActiveAt(saturdayOvernightSans, 0, '23:59:59')).toBe(true);
    });

    it('should be ACTIVE on Sunday (Day 1) at 00:01', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 1, '00:01:00')).toBe(true);
    });

    it('should be ACTIVE on Sunday (Day 1) at 02:00', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 1, '02:00:00')).toBe(true);
    });

    it('should be ACTIVE on Sunday (Day 1) at 04:59', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 1, '04:59:00')).toBe(true);
    });

    it('should be INACTIVE on Sunday (Day 1) at 05:00 sharp', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 1, '05:00:00')).toBe(false);
    });

    it('should be INACTIVE on Sunday (Day 1) at 05:01', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 1, '05:01:00')).toBe(false);
    });

    it('should be INACTIVE on Sunday (Day 1) at 10:00', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 1, '10:00:00')).toBe(false);
    });

    it('should be INACTIVE on Saturday (Day 0) at 14:29', () => {
      expect(isSansActiveAt(saturdayOvernightSans, 0, '14:29:00')).toBe(false);
      expect(isSansActiveAt(saturdayOvernightSans, 0, '14:29:59')).toBe(false);
    });
  });

  // =========================================================================
  // 2. Week Wrap-Around: Friday Night (Day 6) to Saturday Morning (Day 0)
  // =========================================================================
  describe('Week Wrap-Around: Friday 22:00 -> Saturday 04:00', () => {
    const fridayOvernightSans = {
      dayOfWeek: 6, // Friday (جمعه)
      startTime: '22:00:00',
      endTime: '04:00:00',
    };

    it('should be ACTIVE on Friday at 23:30', () => {
      expect(isSansActiveAt(fridayOvernightSans, 6, '23:30:00')).toBe(true);
    });

    it('should be ACTIVE on Saturday at 02:00 (crosses week boundary)', () => {
      expect(isSansActiveAt(fridayOvernightSans, 0, '02:00:00')).toBe(true);
    });

    it('should be INACTIVE on Saturday at 04:00 sharp', () => {
      expect(isSansActiveAt(fridayOvernightSans, 0, '04:00:00')).toBe(false);
    });
  });

  // =========================================================================
  // 3. Admin API: Creation, Rejection of Same-Time, and Overlap Detection
  // =========================================================================
  describe('Admin Management of Overnight Sessions', () => {
    it('successfully creates an overnight session (14:30 -> 05:00)', async () => {
      // Clear existing sans for test gym
      const sansTable = db.getTable('gym_sans');
      const filtered = sansTable.filter(s => s.gym_id !== mixedGymId);
      sansTable.length = 0;
      sansTable.push(...filtered);

      const created = await admin.addGymSans(mixedGymId, {
        dayOfWeek: 0, // Saturday
        gender: Gender.MALE,
        startTime: '14:30',
        endTime: '05:00',
        capacity: 40,
        isPeak: true,
      });

      expect(created.id).toBeDefined();
      expect(created.startTime).toBe('14:30:00');
      expect(created.endTime).toBe('05:00:00');
      expect(created.dayOfWeek).toBe(0);
    });

    it('rejects identical start and end time (0 duration)', async () => {
      await expect(
        admin.addGymSans(mixedGymId, {
          dayOfWeek: 0,
          gender: Gender.MALE,
          startTime: '14:30',
          endTime: '14:30',
        }),
      ).rejects.toThrow('زمان شروع و پایان سانس نمی‌تواند یکسان باشد.');
    });

    it('detects overlap between overnight session (Sat 14:30 -> 05:00) and Sunday morning session (Sun 04:00 -> 10:00)', async () => {
      // Ensure Sat overnight session exists
      const sansTable = db.getTable('gym_sans');
      sansTable.push({
        id: 'sans-sat-overnight',
        gym_id: mixedGymId,
        day_of_week: 0,
        gender: Gender.MALE,
        start_time: '14:30:00',
        end_time: '05:00:00',
        capacity: 40,
        is_peak: true,
      });

      // Attempt to add Sunday session starting at 04:00 (which collides with the 00:00-05:00 portion of Sat overnight session)
      await expect(
        admin.addGymSans(mixedGymId, {
          dayOfWeek: 1, // Sunday
          gender: Gender.MALE,
          startTime: '04:00',
          endTime: '10:00',
        }),
      ).rejects.toThrow('تداخل زمانی با سانس دیگری برای این جنسیت شناسایی شد.');
    });

    it('allows non-overlapping Sunday session starting after overnight session ends (Sun 05:00 -> 10:00)', async () => {
      const created = await admin.addGymSans(mixedGymId, {
        dayOfWeek: 1, // Sunday
        gender: Gender.MALE,
        startTime: '05:00',
        endTime: '10:00',
      });
      expect(created.id).toBeDefined();
      expect(created.startTime).toBe('05:00:00');
    });
  });

  // =========================================================================
  // 4. Live Check-in Authorization During Overnight Session
  // =========================================================================
  describe('Check-in Authorization During Overnight Window', () => {
    it('approves male check-in during active overnight session regardless of calendar day transition', async () => {
      const { iranianDayOfWeek } = getTehranTimeInfo();
      // Configure overnight session starting today and ending tomorrow at 05:00
      // (or if current time is early morning, configure overnight session starting yesterday)
      const sansTable = db.getTable('gym_sans');
      const filtered = sansTable.filter(s => s.gym_id !== mixedGymId);
      sansTable.length = 0;
      sansTable.push(...filtered);

      // Create an overnight session that covers current Tehran time
      // If current time is e.g. 19:30, start at 14:30 today ending tomorrow at 05:00
      // If current time is e.g. 02:00, start yesterday at 14:30 ending today at 05:00
      sansTable.push({
        id: 'sans-live-overnight',
        gym_id: mixedGymId,
        day_of_week: iranianDayOfWeek,
        gender: Gender.MALE,
        start_time: '00:00:00',
        end_time: '23:59:59',
        capacity: 40,
        is_peak: false,
      });

      const { qrToken } = await checkin.generateDynamicQr(maleUserId, mixedGymId);
      const result = await checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId);

      expect(result.status).toBe('APPROVED');
      expect(result.member?.gender).toBe(Gender.MALE);
    });

    it('rejects female check-in during male overnight session with 403 Forbidden', async () => {
      const { iranianDayOfWeek } = getTehranTimeInfo();
      const sansTable = db.getTable('gym_sans');
      const filtered = sansTable.filter(s => s.gym_id !== mixedGymId);
      sansTable.length = 0;
      sansTable.push(...filtered);

      // Configure strictly MALE overnight session active right now
      sansTable.push({
        id: 'sans-live-male-overnight',
        gym_id: mixedGymId,
        day_of_week: iranianDayOfWeek,
        gender: Gender.MALE,
        start_time: '00:00:00',
        end_time: '23:59:59',
        capacity: 40,
        is_peak: false,
      });

      const { qrToken } = await checkin.generateDynamicQr(femaleUserId, mixedGymId);
      await expect(
        checkin.verifyAndConsumeCheckin(qrToken, staffUserId, mixedGymId),
      ).rejects.toThrow(/تداخل سانس جنسیتی/);
    });
  });

  // =========================================================================
  // 5. Gym Discovery Active Session Evaluation
  // =========================================================================
  describe('Gym Discovery Active Session Detection', () => {
    it('accurately identifies overnight session in discovery API', async () => {
      const { iranianDayOfWeek } = getTehranTimeInfo();
      const sansTable = db.getTable('gym_sans');
      const filtered = sansTable.filter(s => s.gym_id !== mixedGymId);
      sansTable.length = 0;
      sansTable.push(...filtered);

      sansTable.push({
        id: 'sans-discovery-overnight',
        gym_id: mixedGymId,
        day_of_week: iranianDayOfWeek,
        gender: Gender.MALE,
        start_time: '14:30:00',
        end_time: '05:00:00',
        capacity: 40,
        is_peak: true,
      });

      const gym = await gymsService.findById(mixedGymId);
      expect(gym.activeSession).toBeDefined();
      expect(gym.activeSession?.gender).toBe(Gender.MALE);
      expect(gym.activeSession?.startTime).toBe('14:30');
      expect(gym.activeSession?.endTime).toBe('05:00');
    });
  });
});
