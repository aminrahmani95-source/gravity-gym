import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { GymAccessMode, Gender } from '@gym-app/shared-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Phase 7: Admin Operations & Observability', () => {
  let db: DatabaseService;
  let adminService: AdminService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    adminService = new AdminService(db);
  });

  describe('1. Dashboard Metrics & Platform Observability', () => {
    it('aggregates real operational and financial health metrics correctly', async () => {
      const metrics = await adminService.getDashboardMetrics();

      expect(metrics.overview).toBeDefined();
      expect(metrics.overview.totalUsers).toBeGreaterThan(0);
      expect(metrics.overview.totalGyms).toBeGreaterThan(0);
      expect(metrics.overview.activeGyms).toBeGreaterThan(0);
      expect(metrics.overview.totalSansCount).toBeGreaterThan(0);

      expect(metrics.economics).toBeDefined();
      expect(typeof metrics.economics.totalRevenueTomans).toBe('number');
      expect(typeof metrics.economics.totalPayablesTomans).toBe('number');
      expect(typeof metrics.economics.contributionMargin).toBe('number');
      expect(typeof metrics.economics.contributionMarginRatio).toBe('number');
    });

    it('retrieves recent checkin logs', async () => {
      const recent = await adminService.getRecentCheckins();
      expect(Array.isArray(recent)).toBe(true);
    });
  });

  describe('2. Gym Management & Access Mode Configuration', () => {
    it('lists all partner gyms with access modes and sans schedules', async () => {
      const gyms = await adminService.getGymsManagementList();
      expect(gyms.length).toBeGreaterThan(0);
      const gym = gyms.find(g => g.id === 'gym-basic-1');
      expect(gym).toBeDefined();
      expect(gym!.accessMode).toBeDefined();
      expect(Array.isArray(gym!.sans)).toBe(true);
    });

    it('updates gym access mode successfully', async () => {
      const gymId = 'gym-premium-3';
      const res = await adminService.updateGymAccessMode(gymId, GymAccessMode.FEMALE_ONLY);
      expect(res.success).toBe(true);
      expect(res.accessMode).toBe(GymAccessMode.FEMALE_ONLY);

      const updated = await adminService.getGymsManagementList();
      const target = updated.find(g => g.id === gymId);
      expect(target!.accessMode).toBe(GymAccessMode.FEMALE_ONLY);
    });
  });

  describe('3. Gym Sans Administration & Conflict Validation', () => {
    it('rejects adding female sans to a MALE_ONLY gym', async () => {
      const maleOnlyGymId = 'gym-plus-2';
      await expect(
        adminService.addGymSans(maleOnlyGymId, {
          dayOfWeek: 1,
          gender: Gender.FEMALE,
          startTime: '09:00',
          endTime: '13:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects adding overlapping sans for the same gender', async () => {
      // Create dedicated test gym with clean slate
      const gymId = 'gym-admin-test-overlap';
      db.getTable('gyms').push({
        id: gymId,
        name_fa: 'باشگاه تست مدیریت',
        tier: 'STANDARD',
        access_mode: 'MIXED',
        is_active: true,
      });

      // First sans: 08:00 - 12:00
      await adminService.addGymSans(gymId, {
        dayOfWeek: 2,
        gender: Gender.FEMALE,
        startTime: '08:00',
        endTime: '12:00',
      });

      // Overlapping sans: 10:00 - 14:00
      await expect(
        adminService.addGymSans(gymId, {
          dayOfWeek: 2,
          gender: Gender.FEMALE,
          startTime: '10:00',
          endTime: '14:00',
        }),
      ).rejects.toThrow(/تداخل زمانی با سانس دیگری برای این جنسیت شناسایی شد/);
    });

    it('successfully adds non-overlapping sans and allows deleting it', async () => {
      const gymId = 'gym-admin-test-crud';
      db.getTable('gyms').push({
        id: gymId,
        name_fa: 'باشگاه تست عملیاتی',
        tier: 'PLUS',
        access_mode: 'MIXED',
        is_active: true,
      });

      const added = await adminService.addGymSans(gymId, {
        dayOfWeek: 4,
        gender: Gender.MALE,
        startTime: '18:00',
        endTime: '22:00',
        capacity: 40,
        isPeak: true,
      });

      expect(added.id).toBeDefined();
      expect(added.isPeak).toBe(true);

      const delRes = await adminService.deleteGymSans(gymId, added.id);
      expect(delRes.success).toBe(true);
    });

    it('throws NotFoundException when deleting non-existent sans', async () => {
      await expect(
        adminService.deleteGymSans('gym-premium-3', 'non-existent-sans-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
