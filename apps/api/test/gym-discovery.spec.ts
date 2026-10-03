import { describe, it, expect, beforeEach } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DatabaseService } from '../src/common/database/database.service';
import { GymsService } from '../src/modules/gyms/gyms.service';
import { GymDiscoveryQueryDto } from '../src/modules/gyms/dto/gym.dto';
import { GymTier, Gender } from '@gym-app/shared-types';

describe('Gym Discovery Performance & Bounded Pagination Tests', () => {
  let db: DatabaseService;
  let gymsService: GymsService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    gymsService = new GymsService(db);
  });

  it('1. Default gym discovery returns active gyms with default limit', async () => {
    const gyms = await gymsService.findAll();
    expect(Array.isArray(gyms)).toBe(true);
    expect(gyms.length).toBeGreaterThanOrEqual(4);
    for (const g of gyms) {
      expect(g.isActive).toBe(true);
      expect(g.id).toBeDefined();
      expect(g.nameFa).toBeDefined();
    }
  });

  it('2. Pagination works deterministically across pages', async () => {
    // Page 1 with limit 2
    const page1 = await gymsService.findAll({ page: 1, limit: 2 });
    expect(page1.length).toBe(2);

    // Page 2 with limit 2
    const page2 = await gymsService.findAll({ page: 2, limit: 2 });
    expect(page2.length).toBe(2);

    // Ensure pages do not overlap
    const page1Ids = page1.map(g => g.id);
    for (const g of page2) {
      expect(page1Ids).not.toContain(g.id);
    }
  });

  it('3. Limit is strictly enforced', async () => {
    const limited = await gymsService.findAll({ page: 1, limit: 1 });
    expect(limited.length).toBe(1);

    const limited3 = await gymsService.findAll({ page: 1, limit: 3 });
    expect(limited3.length).toBe(3);
  });

  it('4. Invalid pagination parameters fail validation', async () => {
    // page < 1
    const invalidPage = plainToInstance(GymDiscoveryQueryDto, { page: 0, limit: 20 });
    const errorsPage = await validate(invalidPage);
    expect(errorsPage.some(e => e.property === 'page')).toBe(true);

    // limit < 1
    const invalidLimit = plainToInstance(GymDiscoveryQueryDto, { page: 1, limit: 0 });
    const errorsLimit = await validate(invalidLimit);
    expect(errorsLimit.some(e => e.property === 'limit')).toBe(true);

    // limit > 100
    const excessiveLimit = plainToInstance(GymDiscoveryQueryDto, { page: 1, limit: 101 });
    const errorsExcessive = await validate(excessiveLimit);
    expect(errorsExcessive.some(e => e.property === 'limit')).toBe(true);

    // valid params
    const validDto = plainToInstance(GymDiscoveryQueryDto, { page: 2, limit: 25 });
    const validErrors = await validate(validDto);
    expect(validErrors.length).toBe(0);
  });

  it('5. Existing filters (city, tier, gender) continue to work', async () => {
    // Tier filter
    const eliteGyms = await gymsService.findAll({ tier: GymTier.ELITE });
    expect(eliteGyms.length).toBeGreaterThanOrEqual(1);
    for (const g of eliteGyms) {
      expect(g.tier).toBe(GymTier.ELITE);
    }

    // City filter
    const tehranGyms = await gymsService.findAll({ city: 'تهران' });
    expect(tehranGyms.length).toBeGreaterThanOrEqual(4);
    for (const g of tehranGyms) {
      expect(g.city).toBe('تهران');
    }

    // Gender sans filter
    const femaleSansGyms = await gymsService.findAll({ gender: Gender.FEMALE });
    expect(femaleSansGyms.length).toBeGreaterThanOrEqual(1);
    for (const g of femaleSansGyms) {
      const hasFemaleSans = g.sans?.some(s => s.gender === Gender.FEMALE);
      expect(hasFemaleSans).toBe(true);
    }
  });

  it('6. Response data remains semantically equivalent to legacy contract', async () => {
    const gyms = await gymsService.findAll({ limit: 1 });
    const gym = gyms[0];

    expect(gym).toHaveProperty('id');
    expect(gym).toHaveProperty('nameFa');
    expect(gym).toHaveProperty('tier');
    expect(gym).toHaveProperty('city');
    expect(gym).toHaveProperty('district');
    expect(gym).toHaveProperty('addressFa');
    expect(gym).toHaveProperty('latitude');
    expect(gym).toHaveProperty('longitude');
    expect(gym).toHaveProperty('facilities');
    expect(gym).toHaveProperty('sans');
    expect(gym).toHaveProperty('currentCreditCost');
    expect(typeof gym.currentCreditCost).toBe('number');
  });

  it('7. Empty page beyond total items returns empty array without error', async () => {
    const emptyPage = await gymsService.findAll({ page: 999, limit: 20 });
    expect(Array.isArray(emptyPage)).toBe(true);
    expect(emptyPage.length).toBe(0);
  });

  it('8. Inactive gyms do not leak into discovery results', async () => {
    // Seed inactive gym in memory
    db.getTable('gyms').push({
      id: 'gym-inactive-test',
      name_fa: 'باشگاه غیرفعال تست',
      tier: 'BASIC',
      city: 'تهران',
      district: 'ونک',
      address_fa: 'خیابان تست',
      latitude: 35.75,
      longitude: 51.39,
      geofence_radius_meters: 150,
      sheba_number: 'IR000000000000000000000000',
      bank_account_holder: 'تست',
      is_active: false,
    });

    const allGyms = await gymsService.findAll({ limit: 100 });
    const foundInactive = allGyms.find(g => g.id === 'gym-inactive-test');
    expect(foundInactive).toBeUndefined();
  });

  it('9. Related facilities, pricing overrides, and sans shifts are correctly loaded in batch', async () => {
    const gyms = await gymsService.findAll({ limit: 4 });
    const eliteGym = gyms.find(g => g.tier === GymTier.ELITE);
    expect(eliteGym).toBeDefined();

    // Elite pricing override: 14 credits
    expect(eliteGym?.currentCreditCost).toBe(14);

    // Facilities loaded
    expect(eliteGym?.facilities?.length).toBeGreaterThan(0);

    // Sans shifts loaded
    expect(eliteGym?.sans?.length).toBeGreaterThan(0);
    const hasMaleSans = eliteGym?.sans?.some(s => s.gender === Gender.MALE);
    expect(hasMaleSans).toBe(true);
  });

  it('10. Query count does NOT grow linearly with gym count (O(1) query bounded batching)', async () => {
    // Seed 10 gyms in memory
    for (let i = 5; i <= 14; i++) {
      db.getTable('gyms').push({
        id: `gym-scale-${i}`,
        name_fa: `باشگاه مقیاس‌پذیری ${i}`,
        tier: 'BASIC',
        city: 'تهران',
        district: 'مرکز',
        address_fa: `آدرس شماره ${i}`,
        latitude: 35.70,
        longitude: 51.40,
        geofence_radius_meters: 150,
        sheba_number: `IR${i}0000000000000000000000`,
        bank_account_holder: `مالک ${i}`,
        is_active: true,
        created_at: new Date().toISOString(),
      });
    }

    // Reset query count instrumentation
    db.resetQueryCount();

    // Fetch page of 10 gyms
    const scaledGyms = await gymsService.findAll({ page: 1, limit: 10 });
    expect(scaledGyms.length).toBe(10);

    // In the legacy implementation, 10 gyms resulted in 1 + (3 * 10) = 31 queries!
    // In our optimized batch implementation, total queries is strictly <= 4 regardless of gym count!
    const totalQueriesExecuted = db.getQueryCount();
    expect(totalQueriesExecuted).toBeLessThanOrEqual(4);
  });
});
