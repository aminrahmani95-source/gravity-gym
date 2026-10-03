import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { GymsService } from '../src/modules/gyms/gyms.service';
import { GymTier, Gender, GymAccessMode } from '@gym-app/shared-types';
import { isSansActiveAt } from '../src/common/utils/tehran-time.util';

describe('Phase 2: Gym Network & Detail Experience', () => {
  let db: DatabaseService;
  let gymsService: GymsService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    gymsService = new GymsService(db);
  });

  // =========================================================================
  // 1. Gym Detail (findById)
  // =========================================================================
  describe('Gym Detail (findById)', () => {
    it('should return complete gym details for an existing gym including facilities, sans, and credit cost', async () => {
      const gym = await gymsService.findById('gym-elite-4');

      expect(gym).toBeDefined();
      expect(gym.id).toBe('gym-elite-4');
      expect(gym.nameFa).toBe('کلاب ورزشی هتل اسپیناس پالاس');
      expect(gym.tier).toBe(GymTier.ELITE);
      expect(gym.accessMode).toBe(GymAccessMode.MIXED);
      expect(gym.city).toBe('تهران');
      expect(gym.district).toBe('سعادت آباد');
      expect(gym.addressFa).toBeDefined();
      expect(gym.currentCreditCost).toBe(14); // Real seeded DB override: 14 credits

      // Facilities check
      expect(Array.isArray(gym.facilities)).toBe(true);
      expect(gym.facilities?.length).toBeGreaterThan(0);

      // Sans check
      expect(Array.isArray(gym.sans)).toBe(true);
      expect(gym.sans?.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException for non-existent gym id', async () => {
      await expect(gymsService.findById('gym-unknown-999')).rejects.toThrow(/مجموعه ورزشی مورد نظر یافت نشد/);
    });
  });

  // =========================================================================
  // 2. Discovery & Filtering
  // =========================================================================
  describe('Discovery & Filtering', () => {
    it('should filter gyms by tier accurately', async () => {
      const basicGyms = await gymsService.findAll({ tier: GymTier.BASIC });
      expect(basicGyms.every(g => g.tier === GymTier.BASIC)).toBe(true);

      const premiumGyms = await gymsService.findAll({ tier: GymTier.PREMIUM });
      expect(premiumGyms.every(g => g.tier === GymTier.PREMIUM)).toBe(true);
    });

    it('should filter gyms by gender matching access mode and operating sessions', async () => {
      // Female filter: must include FEMALE_ONLY gym and MIXED gyms with female sans, but NEVER MALE_ONLY
      const femaleGyms = await gymsService.findAll({ gender: Gender.FEMALE });
      expect(femaleGyms.some(g => g.id === 'gym-basic-1')).toBe(true); // Caro (FEMALE_ONLY)
      expect(femaleGyms.some(g => g.id === 'gym-plus-2')).toBe(false); // Vanak (MALE_ONLY)

      // Male filter: must include MALE_ONLY gym and MIXED gyms with male sans, but NEVER FEMALE_ONLY
      const maleGyms = await gymsService.findAll({ gender: Gender.MALE });
      expect(maleGyms.some(g => g.id === 'gym-plus-2')).toBe(true);  // Vanak (MALE_ONLY)
      expect(maleGyms.some(g => g.id === 'gym-basic-1')).toBe(false); // Caro (FEMALE_ONLY)
    });

    it('should respect pagination limits to prevent unbounded responses', async () => {
      const page1 = await gymsService.findAll({ page: 1, limit: 2 });
      expect(page1.length).toBeLessThanOrEqual(2);

      const page2 = await gymsService.findAll({ page: 2, limit: 2 });
      expect(page2.length).toBeLessThanOrEqual(2);

      // Verify disjoint pages
      const page1Ids = page1.map(g => g.id);
      expect(page2.some(g => page1Ids.includes(g.id))).toBe(false);
    });
  });

  // =========================================================================
  // 3. Overnight Session Verification (14:30 -> 05:00)
  // =========================================================================
  describe('Overnight Session Strict Boundary Verification (14:30 -> 05:00)', () => {
    const overnightSans = {
      dayOfWeek: 1, // Sunday (یک‌شنبه)
      gender: Gender.MALE,
      startTime: '14:30:00',
      endTime: '05:00:00',
    };

    // ACTIVE times on Day 1 (Sunday)
    it('is active on Day 1 at 14:30', () => {
      expect(isSansActiveAt(overnightSans, 1, '14:30:00')).toBe(true);
    });

    it('is active on Day 1 at 18:00', () => {
      expect(isSansActiveAt(overnightSans, 1, '18:00:00')).toBe(true);
    });

    it('is active on Day 1 at 23:59:59', () => {
      expect(isSansActiveAt(overnightSans, 1, '23:59:59')).toBe(true);
    });

    // ACTIVE times on Day 2 (Monday 00:00 -> 04:59)
    it('is active on Day 2 at 00:01:00 (spanned from Day 1)', () => {
      expect(isSansActiveAt(overnightSans, 2, '00:01:00')).toBe(true);
    });

    it('is active on Day 2 at 04:59:59 (spanned from Day 1)', () => {
      expect(isSansActiveAt(overnightSans, 2, '04:59:59')).toBe(true);
    });

    // INACTIVE times
    it('is INACTIVE on Day 2 at 05:00:00 (exact session end boundary)', () => {
      expect(isSansActiveAt(overnightSans, 2, '05:00:00')).toBe(false);
    });

    it('is INACTIVE on Day 2 at 05:01:00', () => {
      expect(isSansActiveAt(overnightSans, 2, '05:01:00')).toBe(false);
    });

    it('is INACTIVE on Day 1 at 10:00:00', () => {
      expect(isSansActiveAt(overnightSans, 1, '10:00:00')).toBe(false);
    });

    it('is INACTIVE on Day 1 at 14:29:59 (before session start)', () => {
      expect(isSansActiveAt(overnightSans, 1, '14:29:59')).toBe(false);
    });

    // Friday -> Saturday Week Rollover Verification
    it('correctly handles Friday (day 6) to Saturday (day 0) overnight rollover', () => {
      const fridayOvernightSans = {
        dayOfWeek: 6, // Friday (جمعه)
        gender: Gender.MALE,
        startTime: '14:30:00',
        endTime: '05:00:00',
      };

      // Saturday 02:00:00 should be active from Friday's session
      expect(isSansActiveAt(fridayOvernightSans, 0, '02:00:00')).toBe(true);
      // Saturday 05:00:00 should be inactive
      expect(isSansActiveAt(fridayOvernightSans, 0, '05:00:00')).toBe(false);
    });
  });
});
