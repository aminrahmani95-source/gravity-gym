import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { RedisService } from '../src/common/redis/redis.service';
import { GymAccessMode, GymTier, Gender } from '@gym-app/shared-types';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

describe('Super Admin Gym Management Operations', () => {
  let db: DatabaseService;
  let adminService: AdminService;
  let checkinService: CheckinService;
  let ledgerService: LedgerService;
  let economicsService: EconomicsService;
  let notificationsService: NotificationsService;
  let redis: RedisService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    adminService = new AdminService(db);

    redis = new RedisService();
    await redis.onModuleInit();
    economicsService = new EconomicsService(db);
    ledgerService = new LedgerService(db);
    notificationsService = new NotificationsService();
    checkinService = new CheckinService(
      db,
      redis,
      ledgerService,
      economicsService,
      notificationsService,
    );
  });

  describe('1. View & Discover All Gyms', () => {
    it('returns all gyms with full management metadata', async () => {
      const gyms = await adminService.getGymsManagementList();
      expect(gyms.length).toBeGreaterThan(0);
      const karo = gyms.find(g => g.id === 'gym-basic-1');
      expect(karo).toBeDefined();
      expect(karo?.nameFa).toBe('باشگاه بدنسازی کارو');
      expect(karo?.city).toBe('تهران');
      expect(karo?.district).toBe('نواب');
      expect(karo?.shebaNumber).toBe('IR430120000000000000000001');
      expect(karo?.bankAccountHolder).toBe('محمد رستمی');
      expect(karo?.isActive).toBe(true);
      expect(Array.isArray(karo?.sans)).toBe(true);
    });
  });

  describe('2. Add a New Gym', () => {
    it('creates a new gym record with Sheba normalization and default overrides', async () => {
      const created = await adminService.createGym({
        nameFa: 'باشگاه تناسب اندام صبا',
        tier: GymTier.PLUS,
        accessMode: GymAccessMode.MIXED,
        city: 'تهران',
        district: 'قیطریه',
        addressFa: 'بلوار قیطریه، خیابان فاطمی، پلاک ۱۲',
        latitude: 35.795,
        longitude: 51.442,
        geofenceRadiusMeters: 180,
        shebaNumber: '980120000000000000000099', // without IR prefix, should auto-normalize
        bankAccountHolder: 'فاطمه صبوری',
        phone: '02122334455',
        descriptionFa: 'باشگاه مجهز به دستگاه‌های مدرن بدنسازی و کراس‌فیت',
        isActive: true,
      });

      expect(created.id).toBeDefined();
      expect(created.nameFa).toBe('باشگاه تناسب اندام صبا');
      expect(created.shebaNumber).toBe('IR980120000000000000000099');
      expect(created.city).toBe('تهران');
      expect(created.district).toBe('قیطریه');
      expect(created.isActive).toBe(true);

      // Verify immediate appearance in gyms management roster
      const allGyms = await adminService.getGymsManagementList();
      const match = allGyms.find(g => g.id === created.id);
      expect(match).toBeDefined();
      expect(match?.nameFa).toBe('باشگاه تناسب اندام صبا');
    });

    it('rejects gym creation with invalid Sheba number', async () => {
      await expect(
        adminService.createGym({
          nameFa: 'باشگاه نامعتبر',
          tier: GymTier.BASIC,
          city: 'تهران',
          district: 'صادقیه',
          addressFa: 'خیابان ستارخان',
          latitude: 35.72,
          longitude: 51.34,
          shebaNumber: 'IR123', // Too short
          bankAccountHolder: 'امید رضایی',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents duplicate gym creation by Sheba or name in same city', async () => {
      // karo Sheba already exists in seed: IR430120000000000000000001
      await expect(
        adminService.createGym({
          nameFa: 'باشگاه جدید',
          tier: GymTier.PREMIUM,
          city: 'تهران',
          district: 'الهیه',
          addressFa: 'خیابان فرشته',
          latitude: 35.78,
          longitude: 51.42,
          shebaNumber: 'IR430120000000000000000001',
          bankAccountHolder: 'تست',
        }),
      ).rejects.toThrow(ConflictException);

      // Duplicate name in same city
      await expect(
        adminService.createGym({
          nameFa: 'باشگاه بدنسازی کارو',
          tier: GymTier.BASIC,
          city: 'تهران',
          district: 'نواب',
          addressFa: 'آدرس دیگر',
          latitude: 35.67,
          longitude: 51.38,
          shebaNumber: 'IR770120000000000000000077',
          bankAccountHolder: 'تست',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Edit an Existing Gym', () => {
    it('updates gym details and persists modifications', async () => {
      const gymId = 'gym-basic-1';
      const updated = await adminService.updateGym(gymId, {
        nameFa: 'باشگاه بدنسازی کارو (شعبه VIP)',
        phone: '02155667788',
        district: 'نواب صفوی',
      });

      expect(updated.nameFa).toBe('باشگاه بدنسازی کارو (شعبه VIP)');
      expect(updated.phone).toBe('02155667788');
      expect(updated.district).toBe('نواب صفوی');

      // Verify persistence
      const list = await adminService.getGymsManagementList();
      const target = list.find(g => g.id === gymId);
      expect(target?.nameFa).toBe('باشگاه بدنسازی کارو (شعبه VIP)');
      expect(target?.phone).toBe('02155667788');
    });

    it('rejects updating Sheba to an already taken Sheba', async () => {
      // gym-plus-2 Sheba is IR160120000000000000000002
      await expect(
        adminService.updateGym('gym-basic-1', {
          shebaNumber: 'IR160120000000000000000002',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. Deactivate / Activate Gym & Checkin Guard', () => {
    it('soft deactivates gym and blocks checkin requests', async () => {
      const gymId = 'gym-elite-4';

      // 1. Deactivate
      const deactResult = await adminService.toggleGymStatus(gymId, false);
      expect(deactResult.success).toBe(true);
      expect(deactResult.isActive).toBe(false);

      // Verify list shows inactive
      const list = await adminService.getGymsManagementList();
      const target = list.find(g => g.id === gymId);
      expect(target?.isActive).toBe(false);

      // Verify Check-in generation is strictly blocked for inactive gym
      await expect(
        checkinService.generateDynamicQr('user-member-1', gymId),
      ).rejects.toThrow(BadRequestException);

      // 2. Reactivate
      const reactResult = await adminService.toggleGymStatus(gymId, true);
      expect(reactResult.success).toBe(true);
      expect(reactResult.isActive).toBe(true);

      const listAfter = await adminService.getGymsManagementList();
      const targetAfter = listAfter.find(g => g.id === gymId);
      expect(targetAfter?.isActive).toBe(true);
    });
  });

  describe('5. Safe Removal & Archiving Network Invariant', () => {
    it('archives (soft-deactivates) gym if historical check-ins or ledger records exist', async () => {
      // Seed a historical checkin for gym-basic-1
      db.getTable('checkins').push({
        id: 'hist-checkin-1',
        user_id: 'user-member-1',
        gym_id: 'gym-basic-1',
        staff_user_id: 'user-staff',
        credits_debited: 1,
        monetary_payout_tomans: 25000,
        status: 'COMPLETED',
        qr_nonce: 'nonce-hist-1',
        created_at: new Date().toISOString(),
      });

      const removal = await adminService.removeGym('gym-basic-1');
      expect(removal.success).toBe(true);
      expect(removal.action).toBe('ARCHIVED');
      expect(removal.message).toContain('بایگانی');

      // Verify gym record still exists to protect historical data integrity
      const list = await adminService.getGymsManagementList();
      const gym = list.find(g => g.id === 'gym-basic-1');
      expect(gym).toBeDefined();
      expect(gym?.isActive).toBe(false);
    });

    it('hard deletes gym and cascading relations if no historical records exist', async () => {
      // Create clean test gym
      const newGym = await adminService.createGym({
        nameFa: 'باشگاه موقت بدون تراکنش',
        tier: GymTier.BASIC,
        city: 'اصفهان',
        district: 'چهارباغ',
        addressFa: 'خیابان چهارباغ عباسی',
        latitude: 32.65,
        longitude: 51.66,
        shebaNumber: 'IR330120000000000000000033',
        bankAccountHolder: 'موسسه ورزشی',
      });

      // Add a test sans
      await adminService.addGymSans(newGym.id, {
        dayOfWeek: 0,
        gender: Gender.MALE,
        startTime: '10:00',
        endTime: '12:00',
      });

      const removal = await adminService.removeGym(newGym.id);
      expect(removal.success).toBe(true);
      expect(removal.action).toBe('DELETED');

      // Verify gym is completely removed from list
      const list = await adminService.getGymsManagementList();
      const exists = list.find(g => g.id === newGym.id);
      expect(exists).toBeUndefined();

      // Verify cascade sans is also deleted
      const sans = db.getTable('gym_sans').filter(s => s.gym_id === newGym.id);
      expect(sans.length).toBe(0);
    });
  });

  describe('6. Gym Detail & Operational Overview', () => {
    it('returns complete operational dossier including staff, checkin counts, and classes', async () => {
      // Seed staff assigned to gym-plus-2
      const staffUser = db.getTable('users').find(u => u.id === 'user-staff');
      if (staffUser) staffUser.assigned_gym_id = 'gym-plus-2';

      const detail = await adminService.getGymDetail('gym-plus-2');
      expect(detail).toBeDefined();
      expect(detail.gym.id).toBe('gym-plus-2');
      expect(detail.gym.nameFa).toBe('مجموعه ورزشی ستاره ونک');
      expect(Array.isArray(detail.assignedStaff)).toBe(true);
      expect(detail.assignedStaff.length).toBeGreaterThan(0);
      expect(detail.assignedStaff[0].phoneNumber).toBe('09120000002');
      expect(typeof detail.totalCheckins).toBe('number');
      expect(typeof detail.activeCheckinsToday).toBe('number');
      expect(Array.isArray(detail.sans)).toBe(true);
      expect(Array.isArray(detail.hostedClasses)).toBe(true);
      expect(typeof detail.hasFinancialHistory).toBe('boolean');
    });
  });
});
