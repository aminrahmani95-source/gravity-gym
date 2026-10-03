import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { GymAccessMode, Gender, GymSans, GymDetailAdminResponse, GymRemovalResult } from '@gym-app/shared-types';
import { CreateGymSansDto, CreateAdminGymDto, UpdateAdminGymDto } from './dto/admin-gym.dto';
import { doSessionsOverlap } from '../../common/utils/tehran-time.util';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Aggregates real-time financial and operational platform health metrics
   */
  async getDashboardMetrics(): Promise<any> {
    let totalUsers = 0;
    let activeSubscribers = 0;
    let totalCheckins = 0;
    let totalRevenueTomans = 0;
    let totalPayablesTomans = 0;

    if (this.db.isInMemory) {
      totalUsers = this.db.getTable('users').length;
      activeSubscribers = this.db.getTable('subscriptions').filter(s => s.status === 'ACTIVE').length;
      totalCheckins = this.db.getTable('checkins').filter(c => c.status === 'COMPLETED').length;

      // Calculate revenue from subscriptions
      const subs = this.db.getTable('subscriptions');
      const plans = this.db.getTable('plans');
      for (const s of subs) {
        const p = plans.find(x => x.id === s.plan_id);
        if (p) totalRevenueTomans += Number(p.price_tomans);
      }

      // Calculate accrued payables
      const payables = this.db.getTable('gym_payable_ledger');
      for (const p of payables) {
        totalPayablesTomans += Number(p.delta_amount_tomans);
      }
    } else {
      const uRes = await this.db.query('SELECT COUNT(*) FROM users');
      totalUsers = parseInt(uRes.rows[0].count, 10);

      const sRes = await this.db.query("SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE'");
      activeSubscribers = parseInt(sRes.rows[0].count, 10);

      const cRes = await this.db.query("SELECT COUNT(*) FROM checkins WHERE status = 'COMPLETED'");
      totalCheckins = parseInt(cRes.rows[0].count, 10);

      const rRes = await this.db.query(
        "SELECT COALESCE(SUM(p.price_tomans), 0) as rev FROM subscriptions s JOIN plans p ON s.plan_id = p.id"
      );
      totalRevenueTomans = parseInt(rRes.rows[0].rev, 10);

      const pRes = await this.db.query("SELECT COALESCE(SUM(delta_amount_tomans), 0) as pay FROM gym_payable_ledger");
      totalPayablesTomans = parseInt(pRes.rows[0].pay, 10);
    }

    let totalGyms = 0;
    let activeGyms = 0;
    let totalSansCount = 0;
    if (this.db.isInMemory) {
      const gTable = this.db.getTable('gyms');
      totalGyms = gTable.length;
      activeGyms = gTable.filter((g: any) => g.is_active).length;
      totalSansCount = this.db.getTable('gym_sans').length;
    } else {
      const gRes = await this.db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM gyms');
      totalGyms = parseInt(gRes.rows[0].total, 10);
      activeGyms = parseInt(gRes.rows[0].active, 10);
      const sRes = await this.db.query('SELECT COUNT(*) as total FROM gym_sans');
      totalSansCount = parseInt(sRes.rows[0].total, 10);
    }

    const estimatedVariableCosts = activeSubscribers * 40000;
    const contributionMargin = Math.max(0, totalRevenueTomans - totalPayablesTomans - estimatedVariableCosts);
    const contributionMarginRatio = totalRevenueTomans > 0 ? (contributionMargin / totalRevenueTomans) * 100 : 0;

    return {
      overview: {
        totalUsers,
        activeSubscribers,
        totalCheckins,
        totalGyms,
        activeGyms,
        totalSansCount,
      },
      economics: {
        totalRevenueTomans,
        totalPayablesTomans,
        estimatedVariableCosts,
        contributionMargin,
        contributionMarginRatio: Math.round(contributionMarginRatio * 10) / 10,
      },
    };
  }

  async getRecentCheckins(): Promise<any[]> {
    if (this.db.isInMemory) {
      const usersTable = this.db.getTable('users');
      const gymsTable = this.db.getTable('gyms');
      return [...this.db.getTable('checkins')]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50)
        .map(c => {
          const u = usersTable.find((user: any) => user.id === c.user_id);
          const g = gymsTable.find((gym: any) => gym.id === c.gym_id);
          return {
            ...c,
            phone_number: u?.phone_number || '',
            first_name: u?.first_name || '',
            last_name: u?.last_name || '',
            gym_name: g?.name_fa || '',
          };
        });
    }

    const res = await this.db.query(
      `SELECT c.*, u.phone_number, u.first_name, u.last_name, g.name_fa as gym_name
       FROM checkins c
       JOIN users u ON c.user_id = u.id
       JOIN gyms g ON c.gym_id = g.id
       ORDER BY c.created_at DESC LIMIT 50`
    );
    return res.rows;
  }

  /**
   * Retrieves all gyms with their configured access mode, location, sheba, and sessions
   */
  async getGymsManagementList(): Promise<any[]> {
    let gymsList: any[] = [];
    if (this.db.isInMemory) {
      gymsList = [...this.db.getTable('gyms')];
      const sansTable = this.db.getTable('gym_sans');
      return gymsList.map(g => ({
        id: g.id,
        nameFa: g.name_fa,
        tier: g.tier,
        accessMode: g.access_mode || 'MIXED',
        city: g.city || '',
        district: g.district || '',
        addressFa: g.address_fa || '',
        latitude: Number(g.latitude) || 35.7,
        longitude: Number(g.longitude) || 51.4,
        geofenceRadiusMeters: Number(g.geofence_radius_meters) || 150,
        shebaNumber: g.sheba_number || '',
        bankAccountHolder: g.bank_account_holder || '',
        phone: g.phone || '',
        descriptionFa: g.description_fa || '',
        images: g.images || [],
        isActive: g.is_active,
        createdAt: g.created_at || new Date().toISOString(),
        sans: sansTable
          .filter(s => s.gym_id === g.id)
          .map(s => ({
            id: s.id,
            gymId: s.gym_id,
            dayOfWeek: s.day_of_week,
            gender: s.gender,
            startTime: s.start_time,
            endTime: s.end_time,
            capacity: s.capacity,
            isPeak: s.is_peak,
          })),
      }));
    }

    const gymsRes = await this.db.query('SELECT * FROM gyms ORDER BY name_fa ASC');
    const sansRes = await this.db.query('SELECT * FROM gym_sans ORDER BY day_of_week ASC, start_time ASC');

    return gymsRes.rows.map(g => ({
      id: g.id,
      nameFa: g.name_fa,
      tier: g.tier,
      accessMode: g.access_mode || 'MIXED',
      city: g.city || '',
      district: g.district || '',
      addressFa: g.address_fa || '',
      latitude: Number(g.latitude) || 35.7,
      longitude: Number(g.longitude) || 51.4,
      geofenceRadiusMeters: Number(g.geofence_radius_meters) || 150,
      shebaNumber: g.sheba_number || '',
      bankAccountHolder: g.bank_account_holder || '',
      phone: g.phone || '',
      descriptionFa: g.description_fa || '',
      images: g.images || [],
      isActive: g.is_active,
      createdAt: g.created_at || new Date().toISOString(),
      sans: sansRes.rows
        .filter(s => s.gym_id === g.id)
        .map(s => ({
          id: s.id,
          gymId: s.gym_id,
          dayOfWeek: s.day_of_week,
          gender: s.gender,
          startTime: s.start_time,
          endTime: s.end_time,
          capacity: s.capacity,
          isPeak: s.is_peak,
        })),
    }));
  }

  /**
   * Updates a gym's access mode (MALE_ONLY, FEMALE_ONLY, MIXED)
   */
  async updateGymAccessMode(gymId: string, accessMode: GymAccessMode): Promise<{ success: boolean; accessMode: GymAccessMode }> {
    if (this.db.isInMemory) {
      const gym = this.db.getTable('gyms').find(g => g.id === gymId);
      if (!gym) {
        throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
      }
      gym.access_mode = accessMode;
      return { success: true, accessMode };
    }

    const check = await this.db.query('SELECT id FROM gyms WHERE id = $1', [gymId]);
    if (check.rows.length === 0) {
      throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
    }

    await this.db.query('UPDATE gyms SET access_mode = $1 WHERE id = $2', [accessMode, gymId]);
    return { success: true, accessMode };
  }

  /**
   * Adds a new operating sans (shift) with rigorous validation
   */
  async addGymSans(gymId: string, dto: CreateGymSansDto): Promise<GymSans> {
    let gym: any;
    if (this.db.isInMemory) {
      gym = this.db.getTable('gyms').find(g => g.id === gymId);
    } else {
      const res = await this.db.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
      gym = res.rows[0];
    }

    if (!gym) {
      throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
    }

    const accessMode: GymAccessMode = gym.access_mode || 'MIXED';

    // Access mode constraint check
    if (accessMode === GymAccessMode.MALE_ONLY && dto.gender !== Gender.MALE) {
      throw new BadRequestException('برای باشگاه ویژه آقایان نمی‌توان سانس بانوان تعریف کرد.');
    }
    if (accessMode === GymAccessMode.FEMALE_ONLY && dto.gender !== Gender.FEMALE) {
      throw new BadRequestException('برای باشگاه ویژه بانوان نمی‌توان سانس آقایان تعریف کرد.');
    }

    const startTimeFormatted = dto.startTime.length === 5 ? `${dto.startTime}:00` : dto.startTime;
    const endTimeFormatted = dto.endTime.length === 5 ? `${dto.endTime}:00` : dto.endTime;

    if (startTimeFormatted === endTimeFormatted) {
      throw new BadRequestException('زمان شروع و پایان سانس نمی‌تواند یکسان باشد.');
    }

    // Overlapping session validation for the same gender across the weekly schedule
    let existingSans: any[] = [];
    if (this.db.isInMemory) {
      existingSans = this.db.getTable('gym_sans').filter(
        s => s.gym_id === gymId && s.gender === dto.gender
      );
    } else {
      const sansRes = await this.db.query(
        'SELECT * FROM gym_sans WHERE gym_id = $1 AND gender = $2',
        [gymId, dto.gender]
      );
      existingSans = sansRes.rows;
    }

    const candidate = {
      dayOfWeek: dto.dayOfWeek,
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
    };

    const hasOverlap = existingSans.some(s =>
      doSessionsOverlap(candidate, {
        dayOfWeek: s.day_of_week ?? s.dayOfWeek,
        startTime: s.start_time ?? s.startTime,
        endTime: s.end_time ?? s.endTime,
      })
    );

    if (hasOverlap) {
      throw new BadRequestException('تداخل زمانی با سانس دیگری برای این جنسیت شناسایی شد.');
    }

    const newId = crypto.randomUUID();
    const isPeak = dto.isPeak ?? (dto.dayOfWeek === 0 || dto.dayOfWeek === 2);
    const capacity = dto.capacity || 30;

    if (this.db.isInMemory) {
      const newSansObj = {
        id: newId,
        gym_id: gymId,
        day_of_week: dto.dayOfWeek,
        gender: dto.gender,
        start_time: startTimeFormatted,
        end_time: endTimeFormatted,
        capacity,
        is_peak: isPeak,
      };
      this.db.getTable('gym_sans').push(newSansObj);
      return {
        id: newId,
        gymId,
        dayOfWeek: dto.dayOfWeek,
        gender: dto.gender,
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
        capacity,
        isPeak,
      };
    }

    await this.db.query(
      `INSERT INTO gym_sans (id, gym_id, day_of_week, gender, start_time, end_time, capacity, is_peak)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId, gymId, dto.dayOfWeek, dto.gender, startTimeFormatted, endTimeFormatted, capacity, isPeak]
    );

    return {
      id: newId,
      gymId,
      dayOfWeek: dto.dayOfWeek,
      gender: dto.gender,
      startTime: startTimeFormatted,
      endTime: endTimeFormatted,
      capacity,
      isPeak,
    };
  }

  /**
   * Deletes a gym operating session
   */
  async deleteGymSans(gymId: string, sansId: string): Promise<{ success: boolean }> {
    if (this.db.isInMemory) {
      const table = this.db.getTable('gym_sans');
      const idx = table.findIndex(s => s.id === sansId && s.gym_id === gymId);
      if (idx === -1) {
        throw new NotFoundException('سانس مورد نظر یافت نشد.');
      }
      table.splice(idx, 1);
      return { success: true };
    }

    const res = await this.db.query('DELETE FROM gym_sans WHERE id = $1 AND gym_id = $2', [sansId, gymId]);
    if (res.rowCount === 0) {
      throw new NotFoundException('سانس مورد نظر یافت نشد.');
    }
    return { success: true };
  }

  /**
   * Retrieves operational dossier and detail of a specific gym
   */
  async getGymDetail(gymId: string): Promise<GymDetailAdminResponse> {
    let gym: any;
    let assignedStaff: any[] = [];
    let totalCheckins = 0;
    let activeCheckinsToday = 0;
    let pricingOverride: any = undefined;
    let sans: any[] = [];
    let hostedClasses: any[] = [];
    let hasFinancialHistory = false;

    if (this.db.isInMemory) {
      gym = this.db.getTable('gyms').find(g => g.id === gymId);
      if (!gym) {
        throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
      }

      // Assigned staff
      const usersTable = this.db.getTable('users');
      assignedStaff = usersTable
        .filter(u => u.assigned_gym_id === gymId)
        .map(u => ({
          id: u.id,
          phoneNumber: u.phone_number,
          firstName: u.first_name,
          lastName: u.last_name,
          role: u.role,
          status: u.status,
        }));

      // Checkins
      const checkinsTable = this.db.getTable('checkins');
      const gymCheckins = checkinsTable.filter(c => c.gym_id === gymId);
      totalCheckins = gymCheckins.length;

      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      activeCheckinsToday = gymCheckins.filter(c => (c.created_at || '').startsWith(todayIso)).length;

      // Pricing overrides
      const overridesTable = this.db.getTable('gym_pricing_overrides');
      const override = overridesTable.find(o => o.gym_id === gymId);
      if (override) {
        pricingOverride = {
          targetMarginRatio: Number(override.target_margin_ratio) || 0.25,
          fixedFloorToman: Number(override.fixed_floor_toman) || 0,
          isDynamicFloorEnabled: Boolean(override.is_dynamic_floor_enabled),
          customLambdaRatio: override.custom_lambda_ratio ? Number(override.custom_lambda_ratio) : undefined,
        };
      }

      // Sans
      const sansTable = this.db.getTable('gym_sans');
      sans = sansTable.filter(s => s.gym_id === gymId).map(s => ({
        id: s.id,
        gymId: s.gym_id,
        dayOfWeek: s.day_of_week,
        gender: s.gender,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        isPeak: s.is_peak,
      }));

      // Hosted Classes
      const venuesTable = this.db.getTable('class_venues');
      const gymVenues = venuesTable.filter(v => v.gym_id === gymId);
      const venueIds = new Set(gymVenues.map(v => v.id));
      const classesTable = this.db.getTable('coach_classes');
      const coachesTable = this.db.getTable('coaches');

      hostedClasses = classesTable
        .filter(c => venueIds.has(c.venue_id))
        .map(c => {
          const coach = coachesTable.find(co => co.id === c.coach_id);
          const coachUser = coach ? usersTable.find(u => u.id === coach.user_id) : null;
          const coachName = coachUser ? `${coachUser.first_name || ''} ${coachUser.last_name || ''}`.trim() : 'مربی';
          return {
            id: c.id,
            titleFa: c.title_fa,
            coachName,
            scheduleFa: c.schedule_fa || '',
            pricePerSessionToman: Number(c.price_per_session_toman) || 0,
            isActive: Boolean(c.is_active),
          };
        });

      // Financial history check
      const payables = this.db.getTable('gym_payable_ledger').filter(p => p.gym_id === gymId);
      hasFinancialHistory = gymCheckins.length > 0 || payables.length > 0;
    } else {
      const gymRes = await this.db.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
      if (gymRes.rows.length === 0) {
        throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
      }
      gym = gymRes.rows[0];

      // Assigned staff
      const staffRes = await this.db.query(
        'SELECT id, phone_number, first_name, last_name, role, status FROM users WHERE assigned_gym_id = $1',
        [gymId]
      );
      assignedStaff = staffRes.rows.map(u => ({
        id: u.id,
        phoneNumber: u.phone_number,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        status: u.status,
      }));

      // Checkins
      const countRes = await this.db.query('SELECT COUNT(*) as total FROM checkins WHERE gym_id = $1', [gymId]);
      totalCheckins = parseInt(countRes.rows[0]?.total || '0', 10);

      const todayRes = await this.db.query(
        'SELECT COUNT(*) as today FROM checkins WHERE gym_id = $1 AND created_at >= CURRENT_DATE',
        [gymId]
      );
      activeCheckinsToday = parseInt(todayRes.rows[0]?.today || '0', 10);

      // Pricing overrides
      const overrideRes = await this.db.query(
        'SELECT * FROM gym_pricing_overrides WHERE gym_id = $1',
        [gymId]
      );
      if (overrideRes.rows.length > 0) {
        const o = overrideRes.rows[0];
        pricingOverride = {
          targetMarginRatio: Number(o.target_margin_ratio) || 0.25,
          fixedFloorToman: Number(o.fixed_floor_toman) || 0,
          isDynamicFloorEnabled: Boolean(o.is_dynamic_floor_enabled),
          customLambdaRatio: o.custom_lambda_ratio ? Number(o.custom_lambda_ratio) : undefined,
        };
      }

      // Sans
      const sansRes = await this.db.query(
        'SELECT * FROM gym_sans WHERE gym_id = $1 ORDER BY day_of_week ASC, start_time ASC',
        [gymId]
      );
      sans = sansRes.rows.map(s => ({
        id: s.id,
        gymId: s.gym_id,
        dayOfWeek: s.day_of_week,
        gender: s.gender,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        isPeak: s.is_peak,
      }));

      // Hosted classes
      const classesRes = await this.db.query(
        `SELECT cc.id, cc.title_fa, cc.schedule_fa, cc.price_per_session_toman, cc.is_active,
                u.first_name, u.last_name
         FROM coach_classes cc
         JOIN class_venues cv ON cc.venue_id = cv.id
         JOIN coaches c ON cc.coach_id = c.id
         JOIN users u ON c.user_id = u.id
         WHERE cv.gym_id = $1`,
        [gymId]
      );
      hostedClasses = classesRes.rows.map(r => ({
        id: r.id,
        titleFa: r.title_fa,
        coachName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'مربی',
        scheduleFa: r.schedule_fa || '',
        pricePerSessionToman: Number(r.price_per_session_toman) || 0,
        isActive: Boolean(r.is_active),
      }));

      // Financial history
      const payRes = await this.db.query(
        'SELECT COUNT(*) as cnt FROM gym_payable_ledger WHERE gym_id = $1',
        [gymId]
      );
      const payCount = parseInt(payRes.rows[0]?.cnt || '0', 10);
      hasFinancialHistory = totalCheckins > 0 || payCount > 0;
    }

    return {
      gym: {
        id: gym.id,
        nameFa: gym.name_fa,
        tier: gym.tier,
        accessMode: gym.access_mode || 'MIXED',
        city: gym.city || '',
        district: gym.district || '',
        addressFa: gym.address_fa || '',
        latitude: Number(gym.latitude) || 35.7,
        longitude: Number(gym.longitude) || 51.4,
        geofenceRadiusMeters: Number(gym.geofence_radius_meters) || 150,
        shebaNumber: gym.sheba_number || '',
        bankAccountHolder: gym.bank_account_holder || '',
        phone: gym.phone || '',
        descriptionFa: gym.description_fa || '',
        images: gym.images || [],
        isActive: Boolean(gym.is_active),
        createdAt: gym.created_at || new Date().toISOString(),
      },
      assignedStaff,
      totalCheckins,
      activeCheckinsToday,
      pricingOverride,
      sans,
      hostedClasses,
      hasFinancialHistory,
    };
  }

  /**
   * Creates a new gym with strict validation, duplicate detection, and default overrides
   */
  async createGym(dto: CreateAdminGymDto): Promise<any> {
    // 1. Normalize Sheba
    let cleanSheba = dto.shebaNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanSheba.startsWith('IR')) {
      cleanSheba = `IR${cleanSheba}`;
    }
    if (!/^IR\d{24}$/.test(cleanSheba)) {
      throw new BadRequestException('شماره شبا باید دقیقاً ۲۴ رقم پس از IR باشد.');
    }

    // 2. Check duplicates (Sheba or Name in same city)
    if (this.db.isInMemory) {
      const gymsTable = this.db.getTable('gyms');
      const duplicateSheba = gymsTable.find(g => (g.sheba_number || '').toUpperCase() === cleanSheba);
      if (duplicateSheba) {
        throw new ConflictException('شماره شبا وارد شده قبلاً برای مجموعه ورزشی دیگری ثبت شده است.');
      }
      const duplicateName = gymsTable.find(
        g => g.name_fa.trim() === dto.nameFa.trim() && g.city.trim() === dto.city.trim()
      );
      if (duplicateName) {
        throw new ConflictException(`مجموعه‌ای با نام «${dto.nameFa}» در شهر «${dto.city}» قبلاً ثبت گردیده است.`);
      }

      const newGymId = `gym-${crypto.randomUUID().slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      const newGym = {
        id: newGymId,
        name_fa: dto.nameFa.trim(),
        tier: dto.tier,
        access_mode: dto.accessMode || GymAccessMode.MIXED,
        city: dto.city.trim(),
        district: dto.district.trim(),
        address_fa: dto.addressFa.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofence_radius_meters: dto.geofenceRadiusMeters || 150,
        sheba_number: cleanSheba,
        bank_account_holder: dto.bankAccountHolder.trim(),
        phone: dto.phone?.trim() || '',
        description_fa: dto.descriptionFa?.trim() || '',
        images: dto.images || [],
        is_active: dto.isActive !== undefined ? dto.isActive : true,
        created_at: nowIso,
      };

      gymsTable.push(newGym);

      // Create default pricing override record
      this.db.getTable('gym_pricing_overrides').push({
        id: crypto.randomUUID(),
        gym_id: newGymId,
        target_margin_ratio: 0.25,
        fixed_floor_toman: 0,
        is_dynamic_floor_enabled: true,
      });

      return {
        id: newGym.id,
        nameFa: newGym.name_fa,
        tier: newGym.tier,
        accessMode: newGym.access_mode,
        city: newGym.city,
        district: newGym.district,
        addressFa: newGym.address_fa,
        latitude: newGym.latitude,
        longitude: newGym.longitude,
        geofenceRadiusMeters: newGym.geofence_radius_meters,
        shebaNumber: newGym.sheba_number,
        bankAccountHolder: newGym.bank_account_holder,
        phone: newGym.phone,
        descriptionFa: newGym.description_fa,
        images: newGym.images,
        isActive: newGym.is_active,
        createdAt: newGym.created_at,
        sans: [],
      };
    }

    // PostgreSQL branch
    const duplicateShebaRes = await this.db.query(
      'SELECT id FROM gyms WHERE UPPER(sheba_number) = $1',
      [cleanSheba]
    );
    if (duplicateShebaRes.rows.length > 0) {
      throw new ConflictException('شماره شبا وارد شده قبلاً برای مجموعه ورزشی دیگری ثبت شده است.');
    }

    const duplicateNameRes = await this.db.query(
      'SELECT id FROM gyms WHERE LOWER(TRIM(name_fa)) = LOWER(TRIM($1)) AND LOWER(TRIM(city)) = LOWER(TRIM($2))',
      [dto.nameFa, dto.city]
    );
    if (duplicateNameRes.rows.length > 0) {
      throw new ConflictException(`مجموعه‌ای با نام «${dto.nameFa}» در شهر «${dto.city}» قبلاً ثبت گردیده است.`);
    }

    const newGymId = crypto.randomUUID();
    const accessMode = dto.accessMode || GymAccessMode.MIXED;
    const geofence = dto.geofenceRadiusMeters || 150;
    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    await this.db.query(
      `INSERT INTO gyms (id, name_fa, tier, access_mode, city, district, address_fa, latitude, longitude,
                          geofence_radius_meters, sheba_number, bank_account_holder, phone, description_fa, images, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        newGymId,
        dto.nameFa.trim(),
        dto.tier,
        accessMode,
        dto.city.trim(),
        dto.district.trim(),
        dto.addressFa.trim(),
        dto.latitude,
        dto.longitude,
        geofence,
        cleanSheba,
        dto.bankAccountHolder.trim(),
        dto.phone?.trim() || null,
        dto.descriptionFa?.trim() || null,
        JSON.stringify(dto.images || []),
        isActive,
      ]
    );

    await this.db.query(
      `INSERT INTO gym_pricing_overrides (gym_id, target_margin_ratio, fixed_floor_toman, is_dynamic_floor_enabled)
       VALUES ($1, $2, $3, $4) ON CONFLICT (gym_id) DO NOTHING`,
      [newGymId, 0.25, 0, true]
    );

    return {
      id: newGymId,
      nameFa: dto.nameFa.trim(),
      tier: dto.tier,
      accessMode,
      city: dto.city.trim(),
      district: dto.district.trim(),
      addressFa: dto.addressFa.trim(),
      latitude: dto.latitude,
      longitude: dto.longitude,
      geofenceRadiusMeters: geofence,
      shebaNumber: cleanSheba,
      bankAccountHolder: dto.bankAccountHolder.trim(),
      phone: dto.phone?.trim() || '',
      descriptionFa: dto.descriptionFa?.trim() || '',
      images: dto.images || [],
      isActive,
      createdAt: new Date().toISOString(),
      sans: [],
    };
  }

  /**
   * Updates an existing gym with validation and conflict checks
   */
  async updateGym(gymId: string, dto: UpdateAdminGymDto): Promise<any> {
    if (this.db.isInMemory) {
      const gymsTable = this.db.getTable('gyms');
      const gym = gymsTable.find(g => g.id === gymId);
      if (!gym) {
        throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
      }

      if (dto.shebaNumber) {
        let cleanSheba = dto.shebaNumber.trim().toUpperCase().replace(/\s+/g, '');
        if (!cleanSheba.startsWith('IR')) cleanSheba = `IR${cleanSheba}`;
        if (!/^IR\d{24}$/.test(cleanSheba)) {
          throw new BadRequestException('شماره شبا باید دقیقاً ۲۴ رقم پس از IR باشد.');
        }
        const duplicateSheba = gymsTable.find(g => g.id !== gymId && (g.sheba_number || '').toUpperCase() === cleanSheba);
        if (duplicateSheba) {
          throw new ConflictException('این شماره شبا قبلاً برای مجموعه ورزشی دیگری ثبت شده است.');
        }
        gym.sheba_number = cleanSheba;
      }

      if (dto.nameFa !== undefined) gym.name_fa = dto.nameFa.trim();
      if (dto.tier !== undefined) gym.tier = dto.tier;
      if (dto.accessMode !== undefined) gym.access_mode = dto.accessMode;
      if (dto.city !== undefined) gym.city = dto.city.trim();
      if (dto.district !== undefined) gym.district = dto.district.trim();
      if (dto.addressFa !== undefined) gym.address_fa = dto.addressFa.trim();
      if (dto.latitude !== undefined) gym.latitude = dto.latitude;
      if (dto.longitude !== undefined) gym.longitude = dto.longitude;
      if (dto.geofenceRadiusMeters !== undefined) gym.geofence_radius_meters = dto.geofenceRadiusMeters;
      if (dto.bankAccountHolder !== undefined) gym.bank_account_holder = dto.bankAccountHolder.trim();
      if (dto.phone !== undefined) gym.phone = dto.phone.trim();
      if (dto.descriptionFa !== undefined) gym.description_fa = dto.descriptionFa.trim();
      if (dto.images !== undefined) gym.images = dto.images;
      if (dto.isActive !== undefined) gym.is_active = dto.isActive;

      const sansTable = this.db.getTable('gym_sans');
      return {
        id: gym.id,
        nameFa: gym.name_fa,
        tier: gym.tier,
        accessMode: gym.access_mode,
        city: gym.city,
        district: gym.district,
        addressFa: gym.address_fa,
        latitude: gym.latitude,
        longitude: gym.longitude,
        geofenceRadiusMeters: gym.geofence_radius_meters,
        shebaNumber: gym.sheba_number,
        bankAccountHolder: gym.bank_account_holder,
        phone: gym.phone,
        descriptionFa: gym.description_fa,
        images: gym.images,
        isActive: gym.is_active,
        createdAt: gym.created_at,
        sans: sansTable.filter(s => s.gym_id === gym.id),
      };
    }

    // PostgreSQL
    const res = await this.db.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
    if (res.rows.length === 0) {
      throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
    }
    const current = res.rows[0];

    let cleanSheba = current.sheba_number;
    if (dto.shebaNumber) {
      cleanSheba = dto.shebaNumber.trim().toUpperCase().replace(/\s+/g, '');
      if (!cleanSheba.startsWith('IR')) cleanSheba = `IR${cleanSheba}`;
      if (!/^IR\d{24}$/.test(cleanSheba)) {
        throw new BadRequestException('شماره شبا باید دقیقاً ۲۴ رقم پس از IR باشد.');
      }
      const duplicateShebaRes = await this.db.query(
        'SELECT id FROM gyms WHERE UPPER(sheba_number) = $1 AND id != $2',
        [cleanSheba, gymId]
      );
      if (duplicateShebaRes.rows.length > 0) {
        throw new ConflictException('این شماره شبا قبلاً برای مجموعه ورزشی دیگری ثبت شده است.');
      }
    }

    const updatedName = dto.nameFa !== undefined ? dto.nameFa.trim() : current.name_fa;
    const updatedTier = dto.tier !== undefined ? dto.tier : current.tier;
    const updatedAccessMode = dto.accessMode !== undefined ? dto.accessMode : current.access_mode;
    const updatedCity = dto.city !== undefined ? dto.city.trim() : current.city;
    const updatedDistrict = dto.district !== undefined ? dto.district.trim() : current.district;
    const updatedAddress = dto.addressFa !== undefined ? dto.addressFa.trim() : current.address_fa;
    const updatedLat = dto.latitude !== undefined ? dto.latitude : current.latitude;
    const updatedLng = dto.longitude !== undefined ? dto.longitude : current.longitude;
    const updatedGeofence = dto.geofenceRadiusMeters !== undefined ? dto.geofenceRadiusMeters : current.geofence_radius_meters;
    const updatedHolder = dto.bankAccountHolder !== undefined ? dto.bankAccountHolder.trim() : current.bank_account_holder;
    const updatedPhone = dto.phone !== undefined ? dto.phone.trim() : current.phone;
    const updatedDesc = dto.descriptionFa !== undefined ? dto.descriptionFa.trim() : current.description_fa;
    const updatedImages = dto.images !== undefined ? JSON.stringify(dto.images) : current.images;
    const updatedIsActive = dto.isActive !== undefined ? dto.isActive : current.is_active;

    await this.db.query(
      `UPDATE gyms
       SET name_fa = $1, tier = $2, access_mode = $3, city = $4, district = $5,
           address_fa = $6, latitude = $7, longitude = $8, geofence_radius_meters = $9,
           sheba_number = $10, bank_account_holder = $11, phone = $12, description_fa = $13,
           images = $14, is_active = $15
       WHERE id = $16`,
      [
        updatedName,
        updatedTier,
        updatedAccessMode,
        updatedCity,
        updatedDistrict,
        updatedAddress,
        updatedLat,
        updatedLng,
        updatedGeofence,
        cleanSheba,
        updatedHolder,
        updatedPhone,
        updatedDesc,
        updatedImages,
        updatedIsActive,
        gymId,
      ]
    );

    return this.getGymDetail(gymId).then(d => d.gym);
  }

  /**
   * Safely toggles active/inactive status of a gym
   */
  async toggleGymStatus(gymId: string, isActive: boolean): Promise<{ success: boolean; gymId: string; isActive: boolean }> {
    if (this.db.isInMemory) {
      const gym = this.db.getTable('gyms').find(g => g.id === gymId);
      if (!gym) {
        throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
      }
      gym.is_active = isActive;
      return { success: true, gymId, isActive };
    }

    const check = await this.db.query('SELECT id FROM gyms WHERE id = $1', [gymId]);
    if (check.rows.length === 0) {
      throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
    }

    await this.db.query('UPDATE gyms SET is_active = $1 WHERE id = $2', [isActive, gymId]);
    return { success: true, gymId, isActive };
  }

  /**
   * Safely removes gym from network.
   * If historical records (check-ins, payables, hosted classes) exist, safely deactivates/archives the gym
   * to protect referential integrity and audit ledger history.
   * If clean of references, performs clean hard-delete of gym and cascade records.
   */
  async removeGym(gymId: string): Promise<GymRemovalResult> {
    if (this.db.isInMemory) {
      const gymsTable = this.db.getTable('gyms');
      const idx = gymsTable.findIndex(g => g.id === gymId);
      if (idx === -1) {
        throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
      }
      const gym = gymsTable[idx];

      // Check references
      const checkins = this.db.getTable('checkins').filter(c => c.gym_id === gymId);
      const payables = this.db.getTable('gym_payable_ledger').filter(p => p.gym_id === gymId);
      const venues = this.db.getTable('class_venues').filter(v => v.gym_id === gymId);

      const hasHistoricalRecords = checkins.length > 0 || payables.length > 0 || venues.length > 0;

      if (hasHistoricalRecords) {
        gym.is_active = false;
        return {
          success: true,
          action: 'ARCHIVED',
          message: `مجموعه «${gym.name_fa}» به دلیل دارا بودن سوابق تردد (${checkins.length}) یا تراکنش‌های مالی پلتفرم از شبکه فعال خارج و بایگانی شد تا یکپارچگی داده‌ها حفظ گردد.`,
        };
      }

      // Safe complete removal
      // Remove sans
      const sansTable = this.db.getTable('gym_sans');
      for (let i = sansTable.length - 1; i >= 0; i--) {
        if (sansTable[i].gym_id === gymId) sansTable.splice(i, 1);
      }
      // Remove overrides
      const overridesTable = this.db.getTable('gym_pricing_overrides');
      const ovIdx = overridesTable.findIndex(o => o.gym_id === gymId);
      if (ovIdx !== -1) overridesTable.splice(ovIdx, 1);
      // Remove gym
      gymsTable.splice(idx, 1);

      return {
        success: true,
        action: 'DELETED',
        message: `مجموعه ورزشی «${gym.name_fa}» و تمامی اطلاعات پیکربندی آن با موفقیت به طور کامل حذف گردید.`,
      };
    }

    // PostgreSQL
    const res = await this.db.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
    if (res.rows.length === 0) {
      throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
    }
    const gym = res.rows[0];

    const checkinRes = await this.db.query('SELECT COUNT(*) as count FROM checkins WHERE gym_id = $1', [gymId]);
    const checkinCount = parseInt(checkinRes.rows[0]?.count || '0', 10);

    const payRes = await this.db.query('SELECT COUNT(*) as count FROM gym_payable_ledger WHERE gym_id = $1', [gymId]);
    const payCount = parseInt(payRes.rows[0]?.count || '0', 10);

    const venueRes = await this.db.query('SELECT COUNT(*) as count FROM class_venues WHERE gym_id = $1', [gymId]);
    const venueCount = parseInt(venueRes.rows[0]?.count || '0', 10);

    if (checkinCount > 0 || payCount > 0 || venueCount > 0) {
      await this.db.query('UPDATE gyms SET is_active = false WHERE id = $1', [gymId]);
      return {
        success: true,
        action: 'ARCHIVED',
        message: `مجموعه «${gym.name_fa}» به دلیل دارا بودن سوابق تردد (${checkinCount}) یا تراکنش‌های مالی پلتفرم از شبکه فعال خارج و بایگانی شد تا یکپارچگی داده‌ها حفظ گردد.`,
      };
    }

    await this.db.withTransaction(async (client) => {
      await client.query('DELETE FROM gym_sans WHERE gym_id = $1', [gymId]);
      await client.query('DELETE FROM gym_pricing_overrides WHERE gym_id = $1', [gymId]);
      await client.query('DELETE FROM gym_facilities WHERE gym_id = $1', [gymId]);
      await client.query('DELETE FROM gym_branches WHERE gym_id = $1', [gymId]);
      await client.query('DELETE FROM gyms WHERE id = $1', [gymId]);
    });

    return {
      success: true,
      action: 'DELETED',
      message: `مجموعه ورزشی «${gym.name_fa}» و تمامی اطلاعات پیکربندی آن با موفقیت به طور کامل حذف گردید.`,
    };
  }

  /**
   * List all gym staff across the platform with assigned gym details
   */
  async getStaffList(): Promise<any[]> {
    if (this.db.isInMemory) {
      const users = this.db.getTable('users').filter(u => u.role === 'GYM_STAFF' || u.assigned_gym_id);
      const gyms = this.db.getTable('gyms');
      return users.map(u => {
        const gym = gyms.find(g => g.id === u.assigned_gym_id);
        return {
          id: u.id,
          phone: u.phone_number || u.phone,
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          fullName: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.full_name || 'پرسنل مجموعه',
          role: u.role,
          status: u.status || 'ACTIVE',
          assignedGymId: u.assigned_gym_id || null,
          assignedGymName: gym ? gym.name_fa : 'منتسب‌نشده',
          createdAt: u.created_at,
        };
      });
    }

    const res = await this.db.query(
      `SELECT u.id, u.phone_number, u.first_name, u.last_name, u.role, u.status, u.assigned_gym_id, u.created_at,
              g.name_fa as gym_name_fa
       FROM users u
       LEFT JOIN gyms g ON u.assigned_gym_id = g.id
       WHERE u.role = 'GYM_STAFF' OR u.assigned_gym_id IS NOT NULL
       ORDER BY u.created_at DESC`
    );
    return res.rows.map(r => ({
      id: r.id,
      phone: r.phone_number,
      firstName: r.first_name,
      lastName: r.last_name,
      fullName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'پرسنل مجموعه',
      role: r.role,
      status: r.status,
      assignedGymId: r.assigned_gym_id,
      assignedGymName: r.gym_name_fa || 'منتسب‌نشده',
      createdAt: r.created_at,
    }));
  }

  /**
   * Assign or create/update a staff member
   */
  async assignStaff(dto: { phone: string; firstName: string; lastName: string; assignedGymId: string }): Promise<any> {
    if (!dto.phone || !dto.assignedGymId) {
      throw new BadRequestException('شماره تماس و مجموعه ورزشی منتسب الزامی است.');
    }

    if (this.db.isInMemory) {
      const gyms = this.db.getTable('gyms');
      const gym = gyms.find(g => g.id === dto.assignedGymId);
      if (!gym) throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');

      const users = this.db.getTable('users');
      let user = users.find(u => (u.phone_number === dto.phone || u.phone === dto.phone));
      if (!user) {
        user = {
          id: `usr-staff-${Date.now()}`,
          phone_number: dto.phone,
          first_name: dto.firstName,
          last_name: dto.lastName,
          role: 'GYM_STAFF',
          assigned_gym_id: dto.assignedGymId,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        users.push(user);
      } else {
        user.first_name = dto.firstName || user.first_name;
        user.last_name = dto.lastName || user.last_name;
        user.role = 'GYM_STAFF';
        user.assigned_gym_id = dto.assignedGymId;
        user.updated_at = new Date().toISOString();
      }

      return {
        id: user.id,
        phone: user.phone_number || user.phone,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        role: user.role,
        assignedGymId: user.assigned_gym_id,
        assignedGymName: gym.name_fa,
      };
    }

    const gymRes = await this.db.query('SELECT * FROM gyms WHERE id = $1', [dto.assignedGymId]);
    if (gymRes.rows.length === 0) throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');

    const userRes = await this.db.query('SELECT * FROM users WHERE phone_number = $1', [dto.phone]);
    let staffId: string;
    if (userRes.rows.length === 0) {
      staffId = `usr-staff-${Date.now()}`;
      await this.db.query(
        `INSERT INTO users (id, phone_number, first_name, last_name, role, assigned_gym_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'GYM_STAFF', $5, 'ACTIVE', NOW(), NOW())`,
        [staffId, dto.phone, dto.firstName, dto.lastName, dto.assignedGymId]
      );
    } else {
      staffId = userRes.rows[0].id;
      await this.db.query(
        `UPDATE users SET first_name = $1, last_name = $2, role = 'GYM_STAFF', assigned_gym_id = $3, updated_at = NOW() WHERE id = $4`,
        [dto.firstName, dto.lastName, dto.assignedGymId, staffId]
      );
    }

    return {
      id: staffId,
      phone: dto.phone,
      fullName: `${dto.firstName} ${dto.lastName}`.trim(),
      role: 'GYM_STAFF',
      assignedGymId: dto.assignedGymId,
      assignedGymName: gymRes.rows[0].name_fa,
    };
  }

  /**
   * List all coach classes across the platform with coach, venue, and session details
   */
  async getAllClassesList(): Promise<any[]> {
    if (this.db.isInMemory) {
      const classes = this.db.getTable('coach_classes');
      const coaches = this.db.getTable('coaches');
      const venues = this.db.getTable('class_venues');
      const sessions = this.db.getTable('class_sessions');

      return classes.map(c => {
        const coach = coaches.find(co => co.id === c.coach_id);
        const venue = venues.find(v => v.id === c.venue_id);
        const classSessions = sessions.filter(s => s.class_id === c.id);
        return {
          id: c.id,
          title: c.title,
          categorySlug: c.category_slug,
          coachId: c.coach_id,
          coachNameFa: coach ? coach.display_name : 'مربی گراویتی',
          venueId: c.venue_id,
          venueNameFa: venue ? venue.name_fa : 'محل کلاس',
          venueType: venue ? venue.venue_type : 'EXTERNAL_GYM',
          singleSessionPriceTomans: c.single_session_price_tomans,
          hasMonthlyPlan: c.has_monthly_plan,
          sessionCount: classSessions.length,
          isActive: c.is_active,
          createdAt: c.created_at,
        };
      });
    }

    const res = await this.db.query(
      `SELECT cc.*, c.display_name as coach_name_fa, cv.name_fa as venue_name_fa, cv.venue_type,
              (SELECT COUNT(*) FROM class_sessions cs WHERE cs.class_id = cc.id) as session_count
       FROM coach_classes cc
       LEFT JOIN coaches c ON cc.coach_id = c.id
       LEFT JOIN class_venues cv ON cc.venue_id = cv.id
       ORDER BY cc.created_at DESC`
    );
    return res.rows.map(r => ({
      id: r.id,
      title: r.title,
      categorySlug: r.category_slug,
      coachId: r.coach_id,
      coachNameFa: r.coach_name_fa || 'مربی گراویتی',
      venueId: r.venue_id,
      venueNameFa: r.venue_name_fa || 'محل کلاس',
      venueType: r.venue_type || 'EXTERNAL_GYM',
      singleSessionPriceTomans: r.single_session_price_tomans,
      hasMonthlyPlan: r.has_monthly_plan,
      sessionCount: parseInt(r.session_count || '0', 10),
      isActive: r.is_active,
      createdAt: r.created_at,
    }));
  }
}
