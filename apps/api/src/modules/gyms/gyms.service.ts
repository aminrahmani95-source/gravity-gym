import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { Gym, GymDiscoveryQuery, GymSans, Facility, GymTier, Gender, GymAccessMode, GymActiveSessionInfo } from '@gym-app/shared-types';
import { getTehranTimeInfo, isSansActiveAt } from '../../common/utils/tehran-time.util';

@Injectable()
export class GymsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Bounded gym discovery with SQL-level pagination and batch loading.
   * Completely eliminates the 1+3N query pattern.
   * Total queries executed is constant O(1) regardless of number of gyms.
   */
  async findAll(query: GymDiscoveryQuery & { accessMode?: GymAccessMode } = {}): Promise<Gym[]> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let gyms: any[] = [];

    if (this.db.isInMemory) {
      let filtered = [...this.db.getTable('gyms')].filter(g => g.is_active);

      if (query.city) {
        filtered = filtered.filter(g => g.city === query.city);
      }
      if (query.district) {
        filtered = filtered.filter(g => g.district === query.district);
      }
      if (query.tier) {
        filtered = filtered.filter(g => g.tier === query.tier);
      }
      if (query.accessMode) {
        filtered = filtered.filter(g => (g.access_mode || 'MIXED') === query.accessMode);
      }
      if (query.gender) {
        const sansTable = this.db.getTable('gym_sans');
        filtered = filtered.filter(g => {
          const mode = g.access_mode || 'MIXED';
          if (query.gender === 'FEMALE') {
            if (mode === 'MALE_ONLY') return false;
            if (mode === 'FEMALE_ONLY') return true;
          } else if (query.gender === 'MALE') {
            if (mode === 'FEMALE_ONLY') return false;
            if (mode === 'MALE_ONLY') return true;
          }
          return sansTable.some(s => s.gym_id === g.id && s.gender === query.gender);
        });
      }

      if (query.lat !== undefined && query.lng !== undefined) {
        filtered = filtered
          .map(g => ({
            ...g,
            _distanceKm: this.calculateHaversineDistance(query.lat!, query.lng!, Number(g.latitude), Number(g.longitude)),
          }))
          .filter(g => (query.radiusKm ? g._distanceKm <= query.radiusKm : true))
          .sort((a, b) => a._distanceKm - b._distanceKm);
      } else {
        filtered.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || (a.id || '').localeCompare(b.id || ''));
      }

      gyms = filtered.slice(offset, offset + limit);
    } else {
      const conditions: string[] = ['g.is_active = true'];
      const params: any[] = [];
      let paramIdx = 1;

      if (query.city) {
        conditions.push(`g.city = $${paramIdx++}`);
        params.push(query.city);
      }
      if (query.district) {
        conditions.push(`g.district = $${paramIdx++}`);
        params.push(query.district);
      }
      if (query.tier) {
        conditions.push(`g.tier = $${paramIdx++}`);
        params.push(query.tier);
      }
      if (query.accessMode) {
        conditions.push(`g.access_mode = $${paramIdx++}`);
        params.push(query.accessMode);
      }
      if (query.gender) {
        const genderParam = paramIdx++;
        conditions.push(`(
          (g.access_mode = 'FEMALE_ONLY' AND $${genderParam} = 'FEMALE') OR
          (g.access_mode = 'MALE_ONLY' AND $${genderParam} = 'MALE') OR
          (COALESCE(g.access_mode, 'MIXED') = 'MIXED' AND EXISTS (SELECT 1 FROM gym_sans s WHERE s.gym_id = g.id AND s.gender = $${genderParam}))
        )`);
        params.push(query.gender);
      }

      let orderClause = 'ORDER BY g.created_at ASC, g.id ASC';
      if (query.lat !== undefined && query.lng !== undefined) {
        const latParam = paramIdx++;
        const lngParam = paramIdx++;
        params.push(query.lat, query.lng);
        const distSql = `(6371 * acos(least(1.0, greatest(-1.0, cos(radians($${latParam})) * cos(radians(g.latitude)) * cos(radians(g.longitude) - radians($${lngParam})) + sin(radians($${latParam})) * sin(radians(g.latitude))))))`;
        if (query.radiusKm) {
          const radParam = paramIdx++;
          params.push(query.radiusKm);
          conditions.push(`${distSql} <= $${radParam}`);
        }
        orderClause = `ORDER BY ${distSql} ASC, g.id ASC`;
      }

      const limitParam = paramIdx++;
      const offsetParam = paramIdx++;
      params.push(limit, offset);

      const sql = `
        SELECT g.*
        FROM gyms g
        WHERE ${conditions.join(' AND ')}
        ${orderClause}
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      const res = await this.db.query(sql, params);
      gyms = res.rows;
    }

    if (gyms.length === 0) {
      return [];
    }

    const gymIds = gyms.map(g => g.id);

    // =========================================================================
    // BATCH DATA LOADING (Bounded to 3 batched queries total)
    // =========================================================================

    // 1. Batch Credit Costs
    const costMap = new Map<string, number>();
    if (this.db.isInMemory) {
      const overrides = this.db.getTable('gym_pricing_overrides');
      const now = new Date();
      for (const gid of gymIds) {
        const active = overrides.find(o => o.gym_id === gid && (!o.effective_to || new Date(o.effective_to) > now));
        if (active) costMap.set(gid, active.credit_cost);
      }
    } else {
      const costRes = await this.db.query(
        `SELECT DISTINCT ON (gym_id) gym_id, credit_cost
         FROM gym_pricing_overrides
         WHERE gym_id = ANY($1::uuid[]) AND (effective_to IS NULL OR effective_to > NOW())
         ORDER BY gym_id, effective_from DESC`,
        [gymIds],
      );
      for (const row of costRes.rows) {
        costMap.set(row.gym_id, row.credit_cost);
      }
    }

    // 2. Batch Facilities
    const facilitiesMap = new Map<string, Facility[]>();
    if (this.db.isInMemory) {
      const facs = this.db.getTable('facilities').map(f => ({
        id: f.id,
        nameFa: f.name_fa,
        slug: f.slug,
        icon: f.icon,
        isPremium: f.is_premium,
      }));
      for (const gid of gymIds) {
        facilitiesMap.set(gid, facs);
      }
    } else {
      const facRes = await this.db.query(
        `SELECT gf.gym_id, f.id, f.name_fa, f.slug, f.icon, f.is_premium
         FROM facilities f
         JOIN gym_facilities gf ON f.id = gf.facility_id
         WHERE gf.gym_id = ANY($1::uuid[])`,
        [gymIds],
      );
      for (const r of facRes.rows) {
        if (!facilitiesMap.has(r.gym_id)) {
          facilitiesMap.set(r.gym_id, []);
        }
        facilitiesMap.get(r.gym_id)!.push({
          id: r.id,
          nameFa: r.name_fa,
          slug: r.slug,
          icon: r.icon,
          isPremium: r.is_premium,
        });
      }
    }

    // 3. Batch Operating Sans
    const sansMap = new Map<string, GymSans[]>();
    if (this.db.isInMemory) {
      const sansTable = this.db.getTable('gym_sans');
      for (const gid of gymIds) {
        const gymSans = sansTable
          .filter(s => s.gym_id === gid)
          .map(s => ({
            id: s.id,
            gymId: s.gym_id,
            dayOfWeek: s.day_of_week,
            gender: s.gender as Gender,
            startTime: s.start_time,
            endTime: s.end_time,
            capacity: s.capacity,
            isPeak: s.is_peak,
          }));
        sansMap.set(gid, gymSans);
      }
    } else {
      const sansRes = await this.db.query(
        `SELECT * FROM gym_sans
         WHERE gym_id = ANY($1::uuid[])
         ORDER BY gym_id, day_of_week ASC, start_time ASC`,
        [gymIds],
      );
      for (const s of sansRes.rows) {
        if (!sansMap.has(s.gym_id)) {
          sansMap.set(s.gym_id, []);
        }
        sansMap.get(s.gym_id)!.push({
          id: s.id,
          gymId: s.gym_id,
          dayOfWeek: s.day_of_week,
          gender: s.gender as Gender,
          startTime: s.start_time,
          endTime: s.end_time,
          capacity: s.capacity,
          isPeak: s.is_peak,
        });
      }
    }

    // Assemble final Gym objects
    return gyms.map(g => {
      let distanceKm: number | undefined = g._distanceKm;
      if (distanceKm === undefined && query.lat !== undefined && query.lng !== undefined) {
        distanceKm = this.calculateHaversineDistance(
          query.lat,
          query.lng,
          Number(g.latitude),
          Number(g.longitude),
        );
      }

      const mode = (g.access_mode || 'MIXED') as GymAccessMode;
      const gSans = sansMap.get(g.id) || [];
      const activeSession = this.computeActiveSession(gSans, mode, query.gender);

      return {
        id: g.id,
        nameFa: g.name_fa,
        tier: g.tier as GymTier,
        accessMode: mode,
        city: g.city,
        district: g.district,
        addressFa: g.address_fa,
        latitude: Number(g.latitude),
        longitude: Number(g.longitude),
        geofenceRadiusMeters: g.geofence_radius_meters,
        shebaNumber: g.sheba_number,
        bankAccountHolder: g.bank_account_holder,
        phone: g.phone,
        descriptionFa: g.description_fa,
        images: typeof g.images === 'string' ? JSON.parse(g.images) : (g.images || []),
        isActive: g.is_active,
        facilities: facilitiesMap.get(g.id) || [],
        sans: gSans,
        activeSession,
        currentCreditCost: costMap.get(g.id) ?? this.getDefaultCreditCostForTier(g.tier as GymTier),
        distanceKm: distanceKm !== undefined ? Math.round(distanceKm * 10) / 10 : undefined,
        createdAt: g.created_at,
      };
    });
  }

  async findById(id: string): Promise<Gym> {
    let gym: any;
    if (this.db.isInMemory) {
      gym = this.db.getTable('gyms').find(g => g.id === id);
    } else {
      const res = await this.db.query('SELECT * FROM gyms WHERE id = $1', [id]);
      gym = res.rows[0];
    }

    if (!gym) {
      throw new NotFoundException('مجموعه ورزشی مورد نظر یافت نشد.');
    }

    const facilities = await this.getGymFacilities(gym.id);
    const sans = await this.getGymSans(gym.id);
    const currentCreditCost = await this.getCurrentCreditCost(gym.id);
    const mode = (gym.access_mode || 'MIXED') as GymAccessMode;
    const activeSession = this.computeActiveSession(sans, mode);

    return {
      id: gym.id,
      nameFa: gym.name_fa,
      tier: gym.tier as GymTier,
      accessMode: mode,
      city: gym.city,
      district: gym.district,
      addressFa: gym.address_fa,
      latitude: Number(gym.latitude),
      longitude: Number(gym.longitude),
      geofenceRadiusMeters: gym.geofence_radius_meters,
      shebaNumber: gym.sheba_number,
      bankAccountHolder: gym.bank_account_holder,
      phone: gym.phone,
      descriptionFa: gym.description_fa,
      images: typeof gym.images === 'string' ? JSON.parse(gym.images) : (gym.images || []),
      isActive: gym.is_active,
      facilities,
      sans,
      activeSession,
      currentCreditCost,
      createdAt: gym.created_at,
    };
  }

  private computeActiveSession(
    gymSans: GymSans[],
    accessMode: GymAccessMode,
    targetGender?: Gender,
  ): GymActiveSessionInfo | undefined {
    const tehranInfo = getTehranTimeInfo();
    const prevDayOfWeek = (tehranInfo.iranianDayOfWeek + 6) % 7;
    const relevantSans = gymSans.filter(
      s => s.dayOfWeek === tehranInfo.iranianDayOfWeek || s.dayOfWeek === prevDayOfWeek,
    );
    const todaySans = gymSans.filter(s => s.dayOfWeek === tehranInfo.iranianDayOfWeek);

    if (accessMode === GymAccessMode.FEMALE_ONLY) {
      const active = relevantSans.find(
        s => s.gender === Gender.FEMALE && isSansActiveAt(s, tehranInfo.iranianDayOfWeek, tehranInfo.currentTimeStr),
      );
      const slot = active || todaySans.find(s => s.gender === Gender.FEMALE);
      if (slot) {
        const isFromYesterday = slot.dayOfWeek === prevDayOfWeek;
        const labelPrefix = isFromYesterday
          ? `ویژه بانوان: ادامه سانس از دیروز تا ${slot.endTime.slice(0, 5)}`
          : `ویژه بانوان: امروز ${slot.startTime.slice(0, 5)} تا ${slot.endTime.slice(0, 5)}`;
        return {
          gender: Gender.FEMALE,
          startTime: slot.startTime.slice(0, 5),
          endTime: slot.endTime.slice(0, 5),
          isPeak: slot.isPeak,
          labelFa: labelPrefix,
        };
      }
      return {
        gender: Gender.FEMALE,
        startTime: '06:00',
        endTime: '23:00',
        isPeak: false,
        labelFa: 'ویژه بانوان',
      };
    }

    if (accessMode === GymAccessMode.MALE_ONLY) {
      const active = relevantSans.find(
        s => s.gender === Gender.MALE && isSansActiveAt(s, tehranInfo.iranianDayOfWeek, tehranInfo.currentTimeStr),
      );
      const slot = active || todaySans.find(s => s.gender === Gender.MALE);
      if (slot) {
        const isFromYesterday = slot.dayOfWeek === prevDayOfWeek;
        const labelPrefix = isFromYesterday
          ? `ویژه آقایان: ادامه سانس از دیروز تا ${slot.endTime.slice(0, 5)}`
          : `ویژه آقایان: امروز ${slot.startTime.slice(0, 5)} تا ${slot.endTime.slice(0, 5)}`;
        return {
          gender: Gender.MALE,
          startTime: slot.startTime.slice(0, 5),
          endTime: slot.endTime.slice(0, 5),
          isPeak: slot.isPeak,
          labelFa: labelPrefix,
        };
      }
      return {
        gender: Gender.MALE,
        startTime: '06:00',
        endTime: '23:59',
        isPeak: false,
        labelFa: 'ویژه آقایان',
      };
    }

    // MIXED access mode
    const currentActive = relevantSans.find(s => {
      if (targetGender && s.gender !== targetGender) return false;
      return isSansActiveAt(s, tehranInfo.iranianDayOfWeek, tehranInfo.currentTimeStr);
    });

    const fallback = todaySans.find(s => (targetGender ? s.gender === targetGender : true));
    const slot = currentActive || fallback;

    if (slot) {
      const genderFa = slot.gender === Gender.FEMALE ? 'بانوان' : 'آقایان';
      const isFromYesterday = slot.dayOfWeek === prevDayOfWeek;
      const labelFa = isFromYesterday
        ? `${genderFa}: ادامه سانس از دیروز تا ${slot.endTime.slice(0, 5)}`
        : `${genderFa}: امروز ${slot.startTime.slice(0, 5)} تا ${slot.endTime.slice(0, 5)}`;
      return {
        gender: slot.gender,
        startTime: slot.startTime.slice(0, 5),
        endTime: slot.endTime.slice(0, 5),
        isPeak: slot.isPeak,
        labelFa,
      };
    }

    return undefined;
  }

  async getCurrentCreditCost(gymId: string): Promise<number> {
    if (this.db.isInMemory) {
      const overrides = this.db.getTable('gym_pricing_overrides');
      const active = overrides.find(o => o.gym_id === gymId && (!o.effective_to || new Date(o.effective_to) > new Date()));
      if (active) return active.credit_cost;

      const gym = this.db.getTable('gyms').find(g => g.id === gymId);
      return this.getDefaultCreditCostForTier(gym?.tier as GymTier);
    }

    const res = await this.db.query(
      `SELECT credit_cost FROM gym_pricing_overrides 
       WHERE gym_id = $1 AND (effective_to IS NULL OR effective_to > NOW())
       ORDER BY effective_from DESC LIMIT 1`,
      [gymId],
    );

    if (res.rows[0]) return res.rows[0].credit_cost;

    const gymRes = await this.db.query('SELECT tier FROM gyms WHERE id = $1', [gymId]);
    return this.getDefaultCreditCostForTier(gymRes.rows[0]?.tier as GymTier);
  }

  private getDefaultCreditCostForTier(tier?: GymTier): number {
    switch (tier) {
      case GymTier.BASIC: return 2;
      case GymTier.PLUS: return 4;
      case GymTier.PREMIUM: return 7;
      case GymTier.ELITE: return 14;
      default: return 3;
    }
  }

  async getGymFacilities(gymId: string): Promise<Facility[]> {
    if (this.db.isInMemory) {
      return [...this.db.getTable('facilities')].map(f => ({
        id: f.id,
        nameFa: f.name_fa,
        slug: f.slug,
        icon: f.icon,
        isPremium: f.is_premium,
      }));
    }

    const res = await this.db.query(
      `SELECT f.* FROM facilities f 
       JOIN gym_facilities gf ON f.id = gf.facility_id 
       WHERE gf.gym_id = $1`,
      [gymId],
    );
    return res.rows.map(r => ({
      id: r.id,
      nameFa: r.name_fa,
      slug: r.slug,
      icon: r.icon,
      isPremium: r.is_premium,
    }));
  }

  async getGymSans(gymId: string): Promise<GymSans[]> {
    if (this.db.isInMemory) {
      const sans = this.db.getTable('gym_sans').filter(s => s.gym_id === gymId);
      return sans.map(s => ({
        id: s.id,
        gymId: s.gym_id,
        dayOfWeek: s.day_of_week,
        gender: s.gender as Gender,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        isPeak: s.is_peak,
      }));
    }

    const res = await this.db.query(
      'SELECT * FROM gym_sans WHERE gym_id = $1 ORDER BY day_of_week ASC, start_time ASC',
      [gymId],
    );
    return res.rows.map(s => ({
      id: s.id,
      gymId: s.gym_id,
      dayOfWeek: s.day_of_week,
      gender: s.gender as Gender,
      startTime: s.start_time,
      endTime: s.end_time,
      capacity: s.capacity,
      isPeak: s.is_peak,
    }));
  }

  private calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
