import { describe, it, expect, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { UserRole } from '@gym-app/shared-types';
import { AdminController } from '../src/modules/admin/admin.controller';
import { SettlementsController } from '../src/modules/settlements/settlements.controller';
import { EconomicsController } from '../src/modules/economics/economics.controller';
import { CheckinController } from '../src/modules/checkin/checkin.controller';
import { DatabaseService } from '../src/common/database/database.service';

function createMockContext(user?: { id?: string; role?: UserRole; phone?: string }): ExecutionContext {
  const request = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('RBAC Matrix & Access Control Enforcement', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let db: DatabaseService;

  beforeEach(async () => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    db = new DatabaseService();
    await db.onModuleInit();
  });

  describe('1. Controller & Handler Metadata Guarantees', () => {
    it('AdminController has class-level restriction to ADMIN and SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, AdminController);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
      expect(roles).not.toContain(UserRole.GYM_STAFF);
      expect(roles).not.toContain(UserRole.USER);
    });

    it('SettlementsController has class-level restriction to ADMIN and SUPER_ADMIN only', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, SettlementsController);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
      expect(roles).not.toContain(UserRole.GYM_STAFF);
      expect(roles).not.toContain(UserRole.USER);
    });

    it('EconomicsController sensitive pricing override requires ADMIN or SUPER_ADMIN', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, EconomicsController.prototype.updateClubPricing);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
      expect(roles).not.toContain(UserRole.GYM_STAFF);
      expect(roles).not.toContain(UserRole.USER);
    });

    it('CheckinController reception-verify permits GYM_STAFF and ADMINs, but excludes USER', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, CheckinController.prototype.receptionVerify);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.GYM_STAFF);
      expect(roles).toContain(UserRole.ADMIN);
      expect(roles).toContain(UserRole.SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.USER);
    });
  });

  describe('2. RolesGuard Enforcement Matrix for Admin Access ([ADMIN, SUPER_ADMIN])', () => {
    beforeEach(() => {
      // Stub reflector to return [ADMIN, SUPER_ADMIN]
      reflector.getAllAndOverride = () => [UserRole.ADMIN, UserRole.SUPER_ADMIN];
    });

    it('Guest / Unauthenticated context -> Throws ForbiddenException', () => {
      const ctx = createMockContext(undefined);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('USER role -> Throws ForbiddenException (Denied)', () => {
      const ctx = createMockContext({ id: 'u-1', role: UserRole.USER, phone: '09120000003' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('GYM_STAFF role -> Throws ForbiddenException (Denied)', () => {
      const ctx = createMockContext({ id: 's-1', role: UserRole.GYM_STAFF, phone: '09120000002' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('ADMIN role -> Allowed (canActivate = true)', () => {
      const ctx = createMockContext({ id: 'a-1', role: UserRole.ADMIN, phone: '09120000005' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('SUPER_ADMIN role -> Allowed (canActivate = true)', () => {
      const ctx = createMockContext({ id: 'sa-1', role: UserRole.SUPER_ADMIN, phone: '09120000001' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('3. RolesGuard Enforcement Matrix for Reception Access ([GYM_STAFF, GYM_OWNER, ADMIN, SUPER_ADMIN])', () => {
    beforeEach(() => {
      reflector.getAllAndOverride = () => [UserRole.GYM_STAFF, UserRole.GYM_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    });

    it('GYM_STAFF role -> Allowed (canActivate = true)', () => {
      const ctx = createMockContext({ id: 's-1', role: UserRole.GYM_STAFF, phone: '09120000002' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('USER role -> Throws ForbiddenException (Denied)', () => {
      const ctx = createMockContext({ id: 'u-1', role: UserRole.USER, phone: '09120000003' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('ADMIN role -> Allowed (canActivate = true)', () => {
      const ctx = createMockContext({ id: 'a-1', role: UserRole.ADMIN, phone: '09120000005' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('SUPER_ADMIN role -> Allowed (canActivate = true)', () => {
      const ctx = createMockContext({ id: 'sa-1', role: UserRole.SUPER_ADMIN, phone: '09120000001' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('4. Database Seed Users Conformity', () => {
    it('seeds SUPER_ADMIN user with 09120000001', async () => {
      const res = await db.query('SELECT * FROM users WHERE phone_number = $1', ['09120000001']);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].role).toBe(UserRole.SUPER_ADMIN);
    });

    it('seeds ADMIN user with 09120000005', async () => {
      const res = await db.query('SELECT * FROM users WHERE phone_number = $1', ['09120000005']);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].role).toBe(UserRole.ADMIN);
    });

    it('seeds GYM_STAFF user with 09120000002', async () => {
      const res = await db.query('SELECT * FROM users WHERE phone_number = $1', ['09120000002']);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].role).toBe(UserRole.GYM_STAFF);
    });

    it('seeds USER members with 09120000003 and 09120000004', async () => {
      const res1 = await db.query('SELECT * FROM users WHERE phone_number = $1', ['09120000003']);
      expect(res1.rows[0].role).toBe(UserRole.USER);

      const res2 = await db.query('SELECT * FROM users WHERE phone_number = $1', ['09120000004']);
      expect(res2.rows[0].role).toBe(UserRole.USER);
    });
  });
});
