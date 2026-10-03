import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { CoachesService } from '../coaches/coaches.service';
import {
  CoachClass,
  ClassSession,
  CoachMonthlyPlan,
  CoachPlanEnrollment,
  ClassBooking,
  ClassCategory,
  ClassVenue,
  ClassVenueType,
  ClassDifficulty,
  ClassSessionStatus,
  ClassBookingStatus,
  ClassAttendanceStatus,
  CoachPlanStatus,
  CoachPlanUsageAction,
  CoachPayableEntryType,
  CoachVerificationStatus,
  UserRole,
  CreateClassDto,
  UpdateClassDto,
  CreateClassSessionDto,
  CreateCoachMonthlyPlanDto,
  ClassDiscoveryFilter,
} from '@gym-app/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => CoachesService))
    private readonly coachesService: CoachesService,
  ) {}

  // ==========================================
  // 1. DISCOVERY & PUBLIC QUERIES
  // ==========================================

  /**
   * Retrieves all active class categories.
   */
  async getCategories(): Promise<ClassCategory[]> {
    if (this.db.isInMemory) {
      const cats = this.db.getTable('class_categories')
        .filter((c: any) => c.is_active)
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      return cats.map(this.mapCategory);
    }

    const res = await this.db.query(
      'SELECT * FROM class_categories WHERE is_active = true ORDER BY sort_order ASC',
    );
    return res.rows.map(this.mapCategory);
  }

  /**
   * Retrieves all active venues, optionally filtered by venue type.
   */
  async getVenues(type?: ClassVenueType): Promise<ClassVenue[]> {
    if (this.db.isInMemory) {
      let venues = this.db.getTable('class_venues').filter((v: any) => v.is_active);
      if (type) {
        venues = venues.filter((v: any) => v.venue_type === type);
      }
      return venues.map(this.mapVenue);
    }

    let query = 'SELECT * FROM class_venues WHERE is_active = true';
    const params: any[] = [];
    if (type) {
      params.push(type);
      query += ` AND venue_type = $${params.length}`;
    }
    query += ' ORDER BY created_at ASC';

    const res = await this.db.query(query, params);
    return res.rows.map(this.mapVenue);
  }

  /**
   * Creates a new venue (e.g. coach creates external gym, private studio, or online link).
   */
  async createVenue(coachId: string, venueData: Partial<ClassVenue>): Promise<ClassVenue> {
    const venueId = crypto.randomUUID();
    const now = new Date().toISOString();

    const row = {
      id: venueId,
      venue_type: venueData.venueType || ClassVenueType.INDEPENDENT_VENUE,
      gym_id: venueData.gymId || null,
      name_fa: venueData.nameFa,
      city: venueData.city || 'تهران',
      district: venueData.district || null,
      address_fa: venueData.addressFa || null,
      latitude: venueData.latitude || null,
      longitude: venueData.longitude || null,
      online_meeting_url: venueData.onlineMeetingUrl || null,
      created_by_coach_id: coachId,
      is_active: true,
      created_at: now,
    };

    if (this.db.isInMemory) {
      this.db.getTable('class_venues').push(row);
      return this.mapVenue(row);
    }

    const res = await this.db.query(
      `INSERT INTO class_venues 
       (id, venue_type, gym_id, name_fa, city, district, address_fa, latitude, longitude, online_meeting_url, created_by_coach_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW()) RETURNING *`,
      [
        venueId,
        row.venue_type,
        row.gym_id,
        row.name_fa,
        row.city,
        row.district,
        row.address_fa,
        row.latitude,
        row.longitude,
        row.online_meeting_url,
        coachId,
      ],
    );
    return this.mapVenue(res.rows[0]);
  }

  /**
   * Search and filter classes with comprehensive enrichment (coach, venue, sessions, monthly plan).
   */
  async getClasses(filter: ClassDiscoveryFilter = {}): Promise<CoachClass[]> {
    let classes: any[] = [];
    let coaches: any[] = [];
    let venues: any[] = [];
    let categories: any[] = [];
    let sessions: any[] = [];
    let plans: any[] = [];

    if (this.db.isInMemory) {
      classes = [...this.db.getTable('coach_classes')].filter((c: any) => c.is_active && c.is_public);
      coaches = this.db.getTable('coaches');
      venues = this.db.getTable('class_venues');
      categories = this.db.getTable('class_categories');
      sessions = this.db.getTable('class_sessions');
      plans = this.db.getTable('coach_monthly_plans');
    } else {
      const cRes = await this.db.query('SELECT * FROM coach_classes WHERE is_active = true AND is_public = true');
      classes = cRes.rows;
      const coRes = await this.db.query('SELECT * FROM coaches WHERE is_active = true');
      coaches = coRes.rows;
      const vRes = await this.db.query('SELECT * FROM class_venues WHERE is_active = true');
      venues = vRes.rows;
      const catRes = await this.db.query('SELECT * FROM class_categories');
      categories = catRes.rows;
      const sRes = await this.db.query('SELECT * FROM class_sessions WHERE status = \'SCHEDULED\'');
      sessions = sRes.rows;
      const pRes = await this.db.query('SELECT * FROM coach_monthly_plans WHERE is_active = true');
      plans = pRes.rows;
    }

    const coachMap = new Map(coaches.map((c: any) => [c.id, c]));
    const venueMap = new Map(venues.map((v: any) => [v.id, v]));
    const categoryMap = new Map(categories.map((cat: any) => [cat.slug, cat]));

    let results = classes.map((c: any) => {
      const coachRow = coachMap.get(c.coach_id);
      const venueRow = venueMap.get(c.venue_id);
      const catRow = categoryMap.get(c.category_slug);
      const classSessions = sessions.filter((s: any) => s.class_id === c.id && s.status === ClassSessionStatus.SCHEDULED);
      const planRow = plans.find((p: any) => p.class_id === c.id && p.is_active);

      return {
        ...this.mapClass(c),
        categoryNameFa: catRow ? catRow.name_fa : c.category_slug,
        coach: coachRow ? this.mapCoachBasic(coachRow) : undefined,
        venue: venueRow ? this.mapVenue(venueRow) : undefined,
        upcomingSessionsCount: classSessions.length,
        monthlyPlan: planRow ? this.mapMonthlyPlan(planRow) : null,
      };
    });

    // Apply filtering
    if (filter.category) {
      results = results.filter(c => c.categorySlug === filter.category);
    }
    if (filter.coachId) {
      results = results.filter(c => c.coachId === filter.coachId);
    }
    if (filter.venueType) {
      results = results.filter(c => c.venue?.venueType === filter.venueType);
    }
    if (filter.difficulty) {
      results = results.filter(c => c.difficulty === filter.difficulty);
    }
    if (filter.maxPrice) {
      results = results.filter(c => c.singleSessionPriceTomans <= Number(filter.maxPrice));
    }
    if (filter.city) {
      results = results.filter(c => c.venue?.city === filter.city);
    }
    if (filter.district) {
      results = results.filter(c => c.venue?.district === filter.district);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      results = results.filter(c => 
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.coach && c.coach.displayName.toLowerCase().includes(q)) ||
        (c.venue && c.venue.nameFa.toLowerCase().includes(q)),
      );
    }

    return results;
  }

  /**
   * Retrieves single class by ID with complete details (coach, venue, upcoming sessions, and monthly plan).
   */
  async getClassById(classId: string): Promise<CoachClass> {
    let classRow: any = null;
    let coachRow: any = null;
    let venueRow: any = null;
    let catRow: any = null;
    let sessions: any[] = [];
    let monthlyPlanRow: any = null;

    if (this.db.isInMemory) {
      classRow = this.db.getTable('coach_classes').find((c: any) => c.id === classId);
      if (!classRow) throw new NotFoundException('کلاس مورد نظر یافت نشد.');
      coachRow = this.db.getTable('coaches').find((co: any) => co.id === classRow.coach_id);
      venueRow = this.db.getTable('class_venues').find((v: any) => v.id === classRow.venue_id);
      catRow = this.db.getTable('class_categories').find((cat: any) => cat.slug === classRow.category_slug);
      sessions = this.db.getTable('class_sessions')
        .filter((s: any) => s.class_id === classId && s.status === ClassSessionStatus.SCHEDULED)
        .sort((a: any, b: any) => (`${a.session_date} ${a.start_time}` > `${b.session_date} ${b.start_time}` ? 1 : -1));
      monthlyPlanRow = this.db.getTable('coach_monthly_plans').find((p: any) => p.class_id === classId && p.is_active);
    } else {
      const cRes = await this.db.query('SELECT * FROM coach_classes WHERE id = $1', [classId]);
      classRow = cRes.rows[0];
      if (!classRow) throw new NotFoundException('کلاس مورد نظر یافت نشد.');

      const [coRes, vRes, catRes, sRes, pRes] = await Promise.all([
        this.db.query('SELECT * FROM coaches WHERE id = $1', [classRow.coach_id]),
        this.db.query('SELECT * FROM class_venues WHERE id = $1', [classRow.venue_id]),
        this.db.query('SELECT * FROM class_categories WHERE slug = $1', [classRow.category_slug]),
        this.db.query('SELECT * FROM class_sessions WHERE class_id = $1 AND status = \'SCHEDULED\' ORDER BY session_date ASC, start_time ASC', [classId]),
        this.db.query('SELECT * FROM coach_monthly_plans WHERE class_id = $1 AND is_active = true LIMIT 1', [classId]),
      ]);

      coachRow = coRes.rows[0];
      venueRow = vRes.rows[0];
      catRow = catRes.rows[0];
      sessions = sRes.rows;
      monthlyPlanRow = pRes.rows[0];
    }

    return {
      ...this.mapClass(classRow),
      categoryNameFa: catRow ? catRow.name_fa : classRow.category_slug,
      coach: coachRow ? this.mapCoachBasic(coachRow) : undefined,
      venue: venueRow ? this.mapVenue(venueRow) : undefined,
      upcomingSessionsCount: sessions.length,
      monthlyPlan: monthlyPlanRow ? this.mapMonthlyPlan(monthlyPlanRow) : null,
    };
  }

  /**
   * Retrieves all scheduled sessions for a class.
   */
  async getClassSessions(classId: string): Promise<ClassSession[]> {
    if (this.db.isInMemory) {
      const sessions = this.db.getTable('class_sessions')
        .filter((s: any) => s.class_id === classId)
        .sort((a: any, b: any) => (`${a.session_date} ${a.start_time}` > `${b.session_date} ${b.start_time}` ? 1 : -1));
      return sessions.map(this.mapSession);
    }

    const res = await this.db.query(
      'SELECT * FROM class_sessions WHERE class_id = $1 ORDER BY session_date ASC, start_time ASC',
      [classId],
    );
    return res.rows.map(this.mapSession);
  }

  /**
   * Retrieves a single session by its unique ID with enriched class and venue details.
   */
  async getSessionById(sessionId: string): Promise<ClassSession> {
    let sessionRow: any = null;
    let classRow: any = null;
    let coachRow: any = null;
    let venueRow: any = null;

    if (this.db.isInMemory) {
      sessionRow = this.db.getTable('class_sessions').find((s: any) => s.id === sessionId);
      if (!sessionRow) throw new NotFoundException('جلسه کلاس مورد نظر یافت نشد.');
      classRow = this.db.getTable('coach_classes').find((c: any) => c.id === sessionRow.class_id);
      coachRow = this.db.getTable('coaches').find((co: any) => co.id === sessionRow.coach_id);
      venueRow = this.db.getTable('class_venues').find((v: any) => v.id === sessionRow.venue_id);
    } else {
      const sRes = await this.db.query('SELECT * FROM class_sessions WHERE id = $1', [sessionId]);
      sessionRow = sRes.rows[0];
      if (!sessionRow) throw new NotFoundException('جلسه کلاس مورد نظر یافت نشد.');

      const [cRes, coRes, vRes] = await Promise.all([
        this.db.query('SELECT * FROM coach_classes WHERE id = $1', [sessionRow.class_id]),
        this.db.query('SELECT * FROM coaches WHERE id = $1', [sessionRow.coach_id]),
        this.db.query('SELECT * FROM class_venues WHERE id = $1', [sessionRow.venue_id]),
      ]);

      classRow = cRes.rows[0];
      coachRow = coRes.rows[0];
      venueRow = vRes.rows[0];
    }

    return {
      ...this.mapSession(sessionRow),
      classTitle: classRow?.title,
      coachName: coachRow?.display_name,
      venueName: venueRow?.name_fa,
      venueType: venueRow?.venue_type,
    };
  }

  /**
   * Retrieves active monthly plans, optionally filtered by class.
   */
  async getMonthlyPlans(classId?: string): Promise<CoachMonthlyPlan[]> {
    if (this.db.isInMemory) {
      let plans = this.db.getTable('coach_monthly_plans').filter((p: any) => p.is_active);
      if (classId) plans = plans.filter((p: any) => p.class_id === classId);
      return plans.map(this.mapMonthlyPlan);
    }

    let query = 'SELECT * FROM coach_monthly_plans WHERE is_active = true';
    const params: any[] = [];
    if (classId) {
      params.push(classId);
      query += ` AND class_id = $${params.length}`;
    }
    const res = await this.db.query(query, params);
    return res.rows.map(this.mapMonthlyPlan);
  }

  // ==========================================
  // 2. COACH DASHBOARD & MANAGEMENT (COACH ROLE)
  // ==========================================

  /**
   * Ensures the requesting user has a verified, active coach profile.
   */
  async getVerifiedCoachForUser(userId: string) {
    const coach = await this.coachesService.getByUserId(userId);
    if (!coach) {
      throw new ForbiddenException('شما هنوز پروفایل مربیگری فعال نکرده‌اید.');
    }
    if (coach.verificationStatus === CoachVerificationStatus.PENDING) {
      throw new ForbiddenException('درخواست مربیگری شما در انتظار بررسی و تأیید تیم مدیریت است.');
    }
    if (coach.verificationStatus === CoachVerificationStatus.REJECTED) {
      throw new ForbiddenException('درخواست مربیگری شما تأیید نشده است.');
    }
    if (coach.verificationStatus === CoachVerificationStatus.SUSPENDED || !coach.isActive) {
      throw new ForbiddenException('حساب مربیگری شما غیرفعال یا معلق گردیده است.');
    }
    return coach;
  }

  /**
   * Coach creates a new class.
   */
  async createClass(userId: string, dto: CreateClassDto): Promise<CoachClass> {
    const coach = await this.getVerifiedCoachForUser(userId);

    const classId = crypto.randomUUID();
    const now = new Date().toISOString();

    const row = {
      id: classId,
      coach_id: coach.id,
      category_slug: dto.categorySlug,
      title: dto.title,
      description: dto.description || '',
      difficulty: dto.difficulty || ClassDifficulty.ALL_LEVELS,
      duration_minutes: dto.durationMinutes || 60,
      default_capacity: dto.defaultCapacity || 12,
      venue_id: dto.venueId,
      single_session_price_tomans: dto.singleSessionPriceTomans,
      has_monthly_plan: Boolean(dto.hasMonthlyPlan),
      cancellation_deadline_hours: dto.cancellationDeadlineHours || 2,
      is_active: true,
      is_public: dto.isPublic !== undefined ? dto.isPublic : true,
      cover_image_url: dto.coverImageUrl || null,
      created_at: now,
      updated_at: now,
    };

    if (this.db.isInMemory) {
      this.db.getTable('coach_classes').push(row);
      return this.mapClass(row);
    }

    const res = await this.db.query(
      `INSERT INTO coach_classes 
       (id, coach_id, category_slug, title, description, difficulty, duration_minutes, default_capacity, venue_id, single_session_price_tomans, has_monthly_plan, cancellation_deadline_hours, is_active, is_public, cover_image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()) RETURNING *`,
      [
        classId,
        coach.id,
        row.category_slug,
        row.title,
        row.description,
        row.difficulty,
        row.duration_minutes,
        row.default_capacity,
        row.venue_id,
        row.single_session_price_tomans,
        row.has_monthly_plan,
        row.cancellation_deadline_hours,
        row.is_active,
        row.is_public,
        row.cover_image_url,
      ],
    );
    return this.mapClass(res.rows[0]);
  }

  /**
   * Coach updates an existing class.
   */
  async updateClass(userId: string, classId: string, dto: UpdateClassDto): Promise<CoachClass> {
    const coach = await this.getVerifiedCoachForUser(userId);
    const existing = await this.getClassById(classId);

    if (existing.coachId !== coach.id) {
      throw new ForbiddenException('شما مجاز به ویرایش این کلاس نیستید.');
    }

    const now = new Date().toISOString();

    if (this.db.isInMemory) {
      const table = this.db.getTable('coach_classes');
      const idx = table.findIndex((c: any) => c.id === classId);
      const updated = {
        ...table[idx],
        title: dto.title ?? table[idx].title,
        category_slug: dto.categorySlug ?? table[idx].category_slug,
        description: dto.description ?? table[idx].description,
        difficulty: dto.difficulty ?? table[idx].difficulty,
        duration_minutes: dto.durationMinutes ?? table[idx].duration_minutes,
        default_capacity: dto.defaultCapacity ?? table[idx].default_capacity,
        venue_id: dto.venueId ?? table[idx].venue_id,
        single_session_price_tomans: dto.singleSessionPriceTomans ?? table[idx].single_session_price_tomans,
        has_monthly_plan: dto.hasMonthlyPlan !== undefined ? dto.hasMonthlyPlan : table[idx].has_monthly_plan,
        cancellation_deadline_hours: dto.cancellationDeadlineHours ?? table[idx].cancellation_deadline_hours,
        cover_image_url: dto.coverImageUrl ?? table[idx].cover_image_url,
        is_active: dto.isActive !== undefined ? dto.isActive : table[idx].is_active,
        is_public: dto.isPublic !== undefined ? dto.isPublic : table[idx].is_public,
        updated_at: now,
      };
      table[idx] = updated;
      return this.mapClass(updated);
    }

    const res = await this.db.query(
      `UPDATE coach_classes 
       SET title = COALESCE($1, title),
           category_slug = COALESCE($2, category_slug),
           description = COALESCE($3, description),
           difficulty = COALESCE($4, difficulty),
           duration_minutes = COALESCE($5, duration_minutes),
           default_capacity = COALESCE($6, default_capacity),
           venue_id = COALESCE($7, venue_id),
           single_session_price_tomans = COALESCE($8, single_session_price_tomans),
           has_monthly_plan = COALESCE($9, has_monthly_plan),
           cancellation_deadline_hours = COALESCE($10, cancellation_deadline_hours),
           cover_image_url = COALESCE($11, cover_image_url),
           is_active = COALESCE($12, is_active),
           is_public = COALESCE($13, is_public),
           updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [
        dto.title,
        dto.categorySlug,
        dto.description,
        dto.difficulty,
        dto.durationMinutes,
        dto.defaultCapacity,
        dto.venueId,
        dto.singleSessionPriceTomans,
        dto.hasMonthlyPlan,
        dto.cancellationDeadlineHours,
        dto.coverImageUrl,
        dto.isActive,
        dto.isPublic,
        classId,
      ],
    );
    return this.mapClass(res.rows[0]);
  }

  /**
   * Coach schedules a new session for one of their classes.
   */
  async createSession(userId: string, dto: CreateClassSessionDto): Promise<ClassSession> {
    const coach = await this.getVerifiedCoachForUser(userId);
    const coachClass = await this.getClassById(dto.classId);

    if (coachClass.coachId !== coach.id) {
      throw new ForbiddenException('شما مجاز به ایجاد جلسه برای این کلاس نیستید.');
    }

    const sessionId = crypto.randomUUID();
    const capacity = dto.capacity || coachClass.defaultCapacity;
    const priceTomans = dto.priceTomans !== undefined ? dto.priceTomans : coachClass.singleSessionPriceTomans;
    const now = new Date().toISOString();

    const row = {
      id: sessionId,
      class_id: coachClass.id,
      coach_id: coach.id,
      venue_id: coachClass.venueId,
      session_date: dto.sessionDate,
      start_time: dto.startTime,
      end_time: dto.endTime,
      capacity,
      booked_count: 0,
      price_tomans: priceTomans,
      status: ClassSessionStatus.SCHEDULED,
      cancellation_reason: null,
      created_at: now,
      updated_at: now,
    };

    if (this.db.isInMemory) {
      this.db.getTable('class_sessions').push(row);
      return this.mapSession(row);
    }

    const res = await this.db.query(
      `INSERT INTO class_sessions 
       (id, class_id, coach_id, venue_id, session_date, start_time, end_time, capacity, booked_count, price_tomans, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, NOW(), NOW()) RETURNING *`,
      [
        sessionId,
        coachClass.id,
        coach.id,
        coachClass.venueId,
        dto.sessionDate,
        dto.startTime,
        dto.endTime,
        capacity,
        priceTomans,
        ClassSessionStatus.SCHEDULED,
      ],
    );
    return this.mapSession(res.rows[0]);
  }

  /**
   * Coach cancels a scheduled session and marks bookings as CANCELLED.
   */
  async cancelSession(userId: string, sessionId: string, reason?: string): Promise<ClassSession> {
    const coach = await this.getVerifiedCoachForUser(userId);
    const session = await this.getSessionById(sessionId);

    if (session.coachId !== coach.id) {
      throw new ForbiddenException('شما مجاز به لغو این جلسه نیستید.');
    }

    return this.db.withTransaction(async (client) => {
      // 1. Update session status
      if (this.db.isInMemory) {
        const s = this.db.getTable('class_sessions').find((x: any) => x.id === sessionId);
        s.status = ClassSessionStatus.CANCELLED;
        s.cancellation_reason = reason || 'لغو توسط مربی';
        s.updated_at = new Date().toISOString();
      } else {
        await client.query(
          `UPDATE class_sessions 
           SET status = $1, cancellation_reason = $2, updated_at = NOW() 
           WHERE id = $3`,
          [ClassSessionStatus.CANCELLED, reason || 'لغو توسط مربی', sessionId],
        );
      }

      // 2. Fetch all confirmed bookings for this session to process refunds / quota restores
      let bookings: any[] = [];
      if (this.db.isInMemory) {
        bookings = this.db.getTable('class_bookings').filter((b: any) => b.session_id === sessionId && b.status === ClassBookingStatus.CONFIRMED);
      } else {
        const res = await client.query(
          'SELECT * FROM class_bookings WHERE session_id = $1 AND status = $2',
          [sessionId, ClassBookingStatus.CONFIRMED],
        );
        bookings = res.rows;
      }

      for (const booking of bookings) {
        if (booking.payment_type === 'COACH_MONTHLY_PLAN' && booking.coach_plan_enrollment_id) {
          // Restore 1 session to the monthly plan enrollment
          await this.restoreMonthlyPlanQuota(client, booking.coach_plan_enrollment_id, booking.id, 'بازگشت سهمیه به دلیل لغو جلسه توسط مربی');
        } else if (booking.payment_type === 'DIRECT_PAYMENT' && Number(booking.coach_earning_tomans) > 0) {
          // Debit coach payable ledger for the net earned amount
          await this.coachesService.debitCoachPayable(
            coach.id,
            Number(booking.coach_earning_tomans),
            booking.id,
            CoachPayableEntryType.REFUND_DEDUCTION,
            `استرداد هزینه رزرو به دلیل لغو جلسه توسط مربی (شناسه: ${booking.booking_code})`,
          );
        }

        // Update booking status to CANCELLED
        if (this.db.isInMemory) {
          booking.status = ClassBookingStatus.CANCELLED;
          booking.cancellation_reason = reason || 'لغو جلسه توسط مربی';
          booking.cancelled_at = new Date().toISOString();
        } else {
          await client.query(
            `UPDATE class_bookings 
             SET status = $1, cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW() 
             WHERE id = $3`,
            [ClassBookingStatus.CANCELLED, reason || 'لغو جلسه توسط مربی', booking.id],
          );
        }
      }

      return this.getSessionById(sessionId);
    });
  }

  /**
   * Coach defines or updates a Monthly Plan for their class.
   */
  async createMonthlyPlan(userId: string, dto: CreateCoachMonthlyPlanDto): Promise<CoachMonthlyPlan> {
    const coach = await this.getVerifiedCoachForUser(userId);
    const coachClass = await this.getClassById(dto.classId);

    if (coachClass.coachId !== coach.id) {
      throw new ForbiddenException('شما مجاز به تعریف پلن برای این کلاس نیستید.');
    }

    const planId = crypto.randomUUID();
    const now = new Date().toISOString();

    const row = {
      id: planId,
      coach_id: coach.id,
      class_id: coachClass.id,
      title: dto.title,
      description: dto.description || null,
      included_sessions: dto.includedSessions || 8,
      price_tomans: dto.priceTomans,
      validity_days: dto.validityDays || 30,
      is_active: true,
      created_at: now,
    };

    if (this.db.isInMemory) {
      this.db.getTable('coach_monthly_plans').push(row);
      // Ensure class has has_monthly_plan set to true
      const c = this.db.getTable('coach_classes').find((x: any) => x.id === coachClass.id);
      if (c) c.has_monthly_plan = true;
      return this.mapMonthlyPlan(row);
    }

    const res = await this.db.query(
      `INSERT INTO coach_monthly_plans 
       (id, coach_id, class_id, title, description, included_sessions, price_tomans, validity_days, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW()) RETURNING *`,
      [
        planId,
        coach.id,
        coachClass.id,
        dto.title,
        dto.description,
        dto.includedSessions || 8,
        dto.priceTomans,
        dto.validityDays || 30,
      ],
    );

    await this.db.query('UPDATE coach_classes SET has_monthly_plan = true WHERE id = $1', [coachClass.id]);
    return this.mapMonthlyPlan(res.rows[0]);
  }

  /**
   * Retrieves all classes created by the authenticated coach.
   */
  async getCoachClasses(userId: string): Promise<CoachClass[]> {
    const coach = await this.getVerifiedCoachForUser(userId);

    let classes: any[] = [];
    if (this.db.isInMemory) {
      classes = this.db.getTable('coach_classes').filter((c: any) => c.coach_id === coach.id);
    } else {
      const res = await this.db.query('SELECT * FROM coach_classes WHERE coach_id = $1 ORDER BY created_at DESC', [coach.id]);
      classes = res.rows;
    }

    return Promise.all(classes.map(c => this.getClassById(c.id)));
  }

  /**
   * Retrieves upcoming and past sessions created by the coach.
   */
  async getCoachSessions(userId: string): Promise<ClassSession[]> {
    const coach = await this.getVerifiedCoachForUser(userId);

    let sessions: any[] = [];
    if (this.db.isInMemory) {
      sessions = this.db.getTable('class_sessions')
        .filter((s: any) => s.coach_id === coach.id)
        .sort((a: any, b: any) => (`${a.session_date} ${a.start_time}` > `${b.session_date} ${b.start_time}` ? 1 : -1));
    } else {
      const res = await this.db.query(
        'SELECT * FROM class_sessions WHERE coach_id = $1 ORDER BY session_date DESC, start_time DESC',
        [coach.id],
      );
      sessions = res.rows;
    }

    return sessions.map(this.mapSession);
  }

  /**
   * Retrieves all booked attendees for a specific session.
   */
  async getSessionAttendees(userId: string, sessionId: string): Promise<ClassBooking[]> {
    const coach = await this.getVerifiedCoachForUser(userId);
    const session = await this.getSessionById(sessionId);

    if (session.coachId !== coach.id) {
      throw new ForbiddenException('شما دسترسی به لیست حاضرین این جلسه ندارید.');
    }

    let bookings: any[] = [];
    let users: any[] = [];

    if (this.db.isInMemory) {
      bookings = this.db.getTable('class_bookings').filter((b: any) => b.session_id === sessionId);
      users = this.db.getTable('users');
    } else {
      const res = await this.db.query(
        `SELECT b.*, u.full_name as user_name, u.phone as user_phone 
         FROM class_bookings b
         JOIN users u ON b.user_id = u.id
         WHERE b.session_id = $1
         ORDER BY b.created_at ASC`,
        [sessionId],
      );
      return res.rows.map(this.mapBooking);
    }

    const userMap = new Map(users.map((u: any) => [u.id, u]));
    return bookings.map((b: any) => {
      const user = userMap.get(b.user_id);
      return {
        ...this.mapBooking(b),
        userName: user?.full_name || 'کاربر گرامی',
        userPhone: user?.phone,
      };
    });
  }

  /**
   * Coach or gym reception marks attendee presence.
   */
  async markAttendance(
    userId: string,
    bookingId: string,
    status: ClassAttendanceStatus,
  ): Promise<ClassBooking> {
    return this.db.withTransaction(async (client) => {
      let booking: any = null;
      if (this.db.isInMemory) {
        booking = this.db.getTable('class_bookings').find((b: any) => b.id === bookingId);
      } else {
        const res = await client.query('SELECT * FROM class_bookings WHERE id = $1 FOR UPDATE', [bookingId]);
        booking = res.rows[0];
      }

      if (!booking) throw new NotFoundException('رزرو مورد نظر یافت نشد.');

      // Authorization check: User must be either:
      // 1. The session's coach
      // 2. An Admin / Super Admin
      // 3. Reception staff of the gym hosting the session
      const session = await this.getSessionById(booking.session_id);
      let isAuthorized = false;

      const coach = await this.coachesService.getByUserId(userId);
      if (coach && coach.id === session.coachId) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        let userRow: any = null;
        if (this.db.isInMemory) {
          userRow = this.db.getTable('users').find((u: any) => u.id === userId);
        } else {
          const res = await client.query('SELECT role, gym_id FROM users WHERE id = $1', [userId]);
          userRow = res.rows[0];
        }

        if (userRow) {
          if (userRow.role === UserRole.ADMIN || userRow.role === UserRole.SUPER_ADMIN) {
            isAuthorized = true;
          } else if (userRow.role === UserRole.GYM_STAFF && session.venueId) {
            let venueRow: any = null;
            if (this.db.isInMemory) {
              venueRow = this.db.getTable('class_venues').find((v: any) => v.id === session.venueId);
            } else {
              const vRes = await client.query('SELECT gym_id FROM class_venues WHERE id = $1', [session.venueId]);
              venueRow = vRes.rows[0];
            }
            if (venueRow && venueRow.gym_id && userRow.gym_id === venueRow.gym_id) {
              isAuthorized = true;
            }
          }
        }
      }

      if (!isAuthorized) {
        throw new ForbiddenException('شما مجاز به ثبت حضور و غیاب برای این جلسه نیستید.');
      }

      const now = new Date().toISOString();
      const attendedAt = status === ClassAttendanceStatus.ATTENDED ? now : null;

      if (this.db.isInMemory) {
        booking.attendance_status = status;
        booking.attended_at = attendedAt;
        booking.updated_at = now;
        return this.mapBooking(booking);
      }

      const res = await client.query(
        `UPDATE class_bookings 
         SET attendance_status = $1, attended_at = $2, updated_at = NOW() 
         WHERE id = $3 RETURNING *`,
        [status, attendedAt, bookingId],
      );
      return this.mapBooking(res.rows[0]);
    });
  }

  // ==========================================
  // 3. BOOKING, QUOTA & CONCURRENCY ENGINE
  // ==========================================

  /**
   * Completes a SINGLE SESSION booking atomically after payment verification (or free promo).
   * Strictly row-locks the session to prevent overbooking races.
   */
  async completeSingleSessionBooking(
    userId: string,
    sessionId: string,
    paymentTransactionId?: string,
    pricePaidTomans?: number,
  ): Promise<ClassBooking> {
    return this.db.withTransaction(async (client) => {
      // 1. Row-lock session to prevent concurrent overbooking
      let session: any = null;
      if (this.db.isInMemory) {
        session = this.db.getTable('class_sessions').find((s: any) => s.id === sessionId);
      } else {
        const res = await client.query('SELECT * FROM class_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        session = res.rows[0];
      }

      if (!session) throw new NotFoundException('جلسه کلاس مورد نظر یافت نشد.');
      if (session.status !== ClassSessionStatus.SCHEDULED) {
        throw new BadRequestException('این جلسه در وضعیت فعال و قابل رزرو قرار ندارد.');
      }

      const bookedCount = Number(session.booked_count || 0);
      const capacity = Number(session.capacity || 0);
      if (bookedCount >= capacity) {
        throw new BadRequestException('متأسفانه ظرفیت این جلسه تکمیل شده است.');
      }

      // Check if user already booked this session
      let existingBooking: any = null;
      if (this.db.isInMemory) {
        existingBooking = this.db.getTable('class_bookings').find(
          (b: any) => b.user_id === userId && b.session_id === sessionId && b.status === ClassBookingStatus.CONFIRMED,
        );
      } else {
        const checkRes = await client.query(
          'SELECT * FROM class_bookings WHERE user_id = $1 AND session_id = $2 AND status = $3',
          [userId, sessionId, ClassBookingStatus.CONFIRMED],
        );
        existingBooking = checkRes.rows[0];
      }

      if (existingBooking) {
        this.logger.warn(`User ${userId} already has confirmed booking ${existingBooking.id} for session ${sessionId}. Returning existing.`);
        return this.mapBooking(existingBooking);
      }

      // 2. Increment session booked_count
      const newBookedCount = bookedCount + 1;
      if (this.db.isInMemory) {
        session.booked_count = newBookedCount;
        session.updated_at = new Date().toISOString();
      } else {
        await client.query('UPDATE class_sessions SET booked_count = $1, updated_at = NOW() WHERE id = $2', [newBookedCount, sessionId]);
      }

      // 3. Calculate financial splits (Coach Earning vs. Gravity Commission)
      const actualPrice = pricePaidTomans !== undefined ? pricePaidTomans : Number(session.price_tomans || 0);
      const coach = await this.coachesService.getById(session.coach_id);
      const commissionRate = coach.commissionRate || 0.15;
      const gravityCommission = Math.round(actualPrice * commissionRate);
      const coachEarning = actualPrice - gravityCommission;

      // 4. Create class booking record
      const bookingId = crypto.randomUUID();
      const bookingCode = 'CLS-' + Math.floor(100000 + Math.random() * 900000);
      const qrToken = 'QRC_' + crypto.randomBytes(12).toString('hex');
      const now = new Date().toISOString();

      const bookingRow = {
        id: bookingId,
        booking_code: bookingCode,
        user_id: userId,
        session_id: sessionId,
        class_id: session.class_id,
        coach_id: session.coach_id,
        venue_id: session.venue_id,
        booking_type: 'SINGLE_SESSION',
        payment_type: 'DIRECT_PAYMENT',
        coach_plan_enrollment_id: null,
        payment_transaction_id: paymentTransactionId || null,
        price_paid_tomans: actualPrice,
        gravity_commission_tomans: gravityCommission,
        coach_earning_tomans: coachEarning,
        status: ClassBookingStatus.CONFIRMED,
        attendance_status: ClassAttendanceStatus.PENDING,
        attended_at: null,
        qr_token: qrToken,
        cancellation_reason: null,
        cancelled_at: null,
        created_at: now,
        updated_at: now,
      };

      if (this.db.isInMemory) {
        this.db.getTable('class_bookings').push(bookingRow);
      } else {
        await client.query(
          `INSERT INTO class_bookings 
           (id, booking_code, user_id, session_id, class_id, coach_id, venue_id, booking_type, payment_type, payment_transaction_id, price_paid_tomans, gravity_commission_tomans, coach_earning_tomans, status, attendance_status, qr_token, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`,
          [
            bookingId,
            bookingCode,
            userId,
            sessionId,
            session.class_id,
            session.coach_id,
            session.venue_id,
            'SINGLE_SESSION',
            'DIRECT_PAYMENT',
            paymentTransactionId || null,
            actualPrice,
            gravityCommission,
            coachEarning,
            ClassBookingStatus.CONFIRMED,
            ClassAttendanceStatus.PENDING,
            qrToken,
          ],
        );
      }

      // 5. Credit coach payable ledger
      if (coachEarning > 0) {
        await this.coachesService.creditCoachPayable(
          session.coach_id,
          coachEarning,
          bookingId,
          CoachPayableEntryType.CLASS_BOOKING_EARNING,
          `درآمد رزرو تک‌جلسه کلاس (کد رزرو: ${bookingCode})`,
        );
      }

      this.logger.log(`[Single Session Booked] Booking: ${bookingCode} | User: ${userId} | Session: ${sessionId} | Paid: ${actualPrice} Tomans | Coach Net: ${coachEarning}`);
      return this.mapBooking(bookingRow);
    });
  }

  /**
   * Completes a COACH MONTHLY PLAN enrollment after payment verification.
   * Allocates session quota and logs auditable ledger entry.
   */
  async completeCoachPlanEnrollment(
    userId: string,
    planId: string,
    paymentTransactionId?: string,
    pricePaidTomans?: number,
  ): Promise<CoachPlanEnrollment> {
    return this.db.withTransaction(async (client) => {
      let plan: any = null;
      if (this.db.isInMemory) {
        plan = this.db.getTable('coach_monthly_plans').find((p: any) => p.id === planId);
      } else {
        const res = await client.query('SELECT * FROM coach_monthly_plans WHERE id = $1', [planId]);
        plan = res.rows[0];
      }

      if (!plan) throw new NotFoundException('پلن ماهانه مربی یافت نشد.');

      const actualPrice = pricePaidTomans !== undefined ? pricePaidTomans : Number(plan.price_tomans);
      const coach = await this.coachesService.getById(plan.coach_id);
      const commissionRate = coach.commissionRate || 0.15;
      const gravityCommission = Math.round(actualPrice * commissionRate);
      const coachEarning = actualPrice - gravityCommission;

      const enrollmentId = crypto.randomUUID();
      const startsAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (plan.validity_days || 30) * 24 * 60 * 60 * 1000).toISOString();
      const totalSessions = Number(plan.included_sessions || 8);
      const now = new Date().toISOString();

      const enrollmentRow = {
        id: enrollmentId,
        user_id: userId,
        coach_id: plan.coach_id,
        class_id: plan.class_id,
        plan_id: planId,
        starts_at: startsAt,
        expires_at: expiresAt,
        total_sessions: totalSessions,
        used_sessions: 0,
        remaining_sessions: totalSessions,
        status: CoachPlanStatus.ACTIVE,
        created_at: now,
        updated_at: now,
      };

      if (this.db.isInMemory) {
        this.db.getTable('coach_plan_enrollments').push(enrollmentRow);
        // Log quota usage ledger
        this.db.getTable('coach_plan_usage_ledger').push({
          id: crypto.randomUUID(),
          enrollment_id: enrollmentId,
          user_id: userId,
          delta_sessions: totalSessions,
          remaining_after: totalSessions,
          action_type: CoachPlanUsageAction.PURCHASE_INITIAL,
          reference_booking_id: null,
          description: `خرید بسته ماهانه ${plan.title} (${totalSessions} جلسه)`,
          created_at: now,
        });
      } else {
        await client.query(
          `INSERT INTO coach_plan_enrollments 
           (id, user_id, coach_id, class_id, plan_id, starts_at, expires_at, total_sessions, used_sessions, remaining_sessions, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, NOW(), NOW())`,
          [
            enrollmentId,
            userId,
            plan.coach_id,
            plan.class_id,
            planId,
            startsAt,
            expiresAt,
            totalSessions,
            totalSessions,
            CoachPlanStatus.ACTIVE,
          ],
        );

        await client.query(
          `INSERT INTO coach_plan_usage_ledger 
           (id, enrollment_id, user_id, delta_sessions, remaining_after, action_type, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            crypto.randomUUID(),
            enrollmentId,
            userId,
            totalSessions,
            totalSessions,
            CoachPlanUsageAction.PURCHASE_INITIAL,
            `خرید بسته ماهانه ${plan.title} (${totalSessions} جلسه)`,
          ],
        );
      }

      // Credit coach payable ledger for the net earned amount
      if (coachEarning > 0) {
        await this.coachesService.creditCoachPayable(
          plan.coach_id,
          coachEarning,
          enrollmentId,
          CoachPayableEntryType.MONTHLY_PLAN_EARNING,
          `درآمد حاصل از فروش بسته ماهانه کلاس (پلن: ${plan.title})`,
        );
      }

      this.logger.log(`[Coach Plan Enrolled] User: ${userId} | Plan: ${plan.title} | Sessions: ${totalSessions} | Net Earned: ${coachEarning}`);
      return this.mapEnrollment(enrollmentRow);
    });
  }

  /**
   * Reserves a seat in a session using an active Coach Monthly Plan quota.
   * Atomically locks enrollment quota AND session capacity to guarantee zero concurrency anomalies.
   */
  async bookSessionUsingMonthlyPlan(
    userId: string,
    sessionId: string,
    enrollmentId: string,
  ): Promise<ClassBooking> {
    return this.db.withTransaction(async (client) => {
      // 1. Lock and validate enrollment
      let enrollment: any = null;
      if (this.db.isInMemory) {
        enrollment = this.db.getTable('coach_plan_enrollments').find((e: any) => e.id === enrollmentId);
      } else {
        const eRes = await client.query('SELECT * FROM coach_plan_enrollments WHERE id = $1 FOR UPDATE', [enrollmentId]);
        enrollment = eRes.rows[0];
      }

      if (!enrollment) throw new NotFoundException('اشتراک ماهانه مربی یافت نشد.');
      if (enrollment.user_id !== userId) {
        throw new ForbiddenException('این اشتراک متعلق به کاربر دیگری است.');
      }
      if (enrollment.status === CoachPlanStatus.EXHAUSTED || Number(enrollment.remaining_sessions) <= 0) {
        throw new BadRequestException('سهمیه جلسات باقی‌مانده این اشتراک به پایان رسیده است.');
      }
      if (new Date(enrollment.expires_at).getTime() < Date.now()) {
        throw new BadRequestException('مهلت اعتبار اشتراک ماهانه شما به پایان رسیده است.');
      }
      if (enrollment.status !== CoachPlanStatus.ACTIVE) {
        throw new BadRequestException('اشتراک ماهانه شما در وضعیت فعال قرار ندارد.');
      }

      // 2. Lock and validate session
      let session: any = null;
      if (this.db.isInMemory) {
        session = this.db.getTable('class_sessions').find((s: any) => s.id === sessionId);
      } else {
        const sRes = await client.query('SELECT * FROM class_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        session = sRes.rows[0];
      }

      if (!session) throw new NotFoundException('جلسه کلاس مورد نظر یافت نشد.');
      if (session.status !== ClassSessionStatus.SCHEDULED) {
        throw new BadRequestException('این جلسه در وضعیت فعال و قابل رزرو قرار ندارد.');
      }

      // Validate class/coach match: enrollment must match the class or coach
      if (enrollment.class_id && enrollment.class_id !== session.class_id) {
        throw new BadRequestException('این اشتراک ماهانه مخصوص کلاس دیگری از این مربی می‌باشد.');
      }
      if (enrollment.coach_id !== session.coach_id) {
        throw new BadRequestException('این اشتراک ماهانه متعلق به مربی دیگری است.');
      }

      const bookedCount = Number(session.booked_count || 0);
      const capacity = Number(session.capacity || 0);
      if (bookedCount >= capacity) {
        throw new BadRequestException('متأسفانه ظرفیت این جلسه تکمیل شده است.');
      }

      // Prevent duplicate booking
      let existingBooking: any = null;
      if (this.db.isInMemory) {
        existingBooking = this.db.getTable('class_bookings').find(
          (b: any) => b.user_id === userId && b.session_id === sessionId && b.status === ClassBookingStatus.CONFIRMED,
        );
      } else {
        const checkRes = await client.query(
          'SELECT * FROM class_bookings WHERE user_id = $1 AND session_id = $2 AND status = $3',
          [userId, sessionId, ClassBookingStatus.CONFIRMED],
        );
        existingBooking = checkRes.rows[0];
      }
      if (existingBooking) {
        throw new BadRequestException('شما قبلاً در این جلسه ثبت‌نام کرده‌اید.');
      }

      // 3. Deduct 1 session from enrollment quota
      const remainingAfter = Number(enrollment.remaining_sessions) - 1;
      const usedSessions = Number(enrollment.used_sessions || 0) + 1;
      const newEnrollmentStatus = remainingAfter === 0 ? CoachPlanStatus.EXHAUSTED : CoachPlanStatus.ACTIVE;
      const now = new Date().toISOString();

      if (this.db.isInMemory) {
        enrollment.remaining_sessions = remainingAfter;
        enrollment.used_sessions = usedSessions;
        enrollment.status = newEnrollmentStatus;
        enrollment.updated_at = now;
      } else {
        await client.query(
          `UPDATE coach_plan_enrollments 
           SET remaining_sessions = $1, used_sessions = $2, status = $3, updated_at = NOW() 
           WHERE id = $4`,
          [remainingAfter, usedSessions, newEnrollmentStatus, enrollmentId],
        );
      }

      // 4. Increment session booked count
      const newBookedCount = bookedCount + 1;
      if (this.db.isInMemory) {
        session.booked_count = newBookedCount;
        session.updated_at = now;
      } else {
        await client.query('UPDATE class_sessions SET booked_count = $1, updated_at = NOW() WHERE id = $2', [newBookedCount, sessionId]);
      }

      // 5. Create booking record
      const bookingId = crypto.randomUUID();
      const bookingCode = 'CLS-' + Math.floor(100000 + Math.random() * 900000);
      const qrToken = 'QRC_' + crypto.randomBytes(12).toString('hex');

      const bookingRow = {
        id: bookingId,
        booking_code: bookingCode,
        user_id: userId,
        session_id: sessionId,
        class_id: session.class_id,
        coach_id: session.coach_id,
        venue_id: session.venue_id,
        booking_type: 'PLAN_SESSION',
        payment_type: 'COACH_MONTHLY_PLAN',
        coach_plan_enrollment_id: enrollmentId,
        payment_transaction_id: null,
        price_paid_tomans: 0,
        gravity_commission_tomans: 0,
        coach_earning_tomans: 0,
        status: ClassBookingStatus.CONFIRMED,
        attendance_status: ClassAttendanceStatus.PENDING,
        attended_at: null,
        qr_token: qrToken,
        cancellation_reason: null,
        cancelled_at: null,
        created_at: now,
        updated_at: now,
      };

      if (this.db.isInMemory) {
        this.db.getTable('class_bookings').push(bookingRow);
        // Log quota deduction
        this.db.getTable('coach_plan_usage_ledger').push({
          id: crypto.randomUUID(),
          enrollment_id: enrollmentId,
          user_id: userId,
          delta_sessions: -1,
          remaining_after: remainingAfter,
          action_type: CoachPlanUsageAction.SESSION_BOOKING,
          reference_booking_id: bookingId,
          description: `رزرو جلسه با اشتراک ماهانه (کد رزرو: ${bookingCode})`,
          created_at: now,
        });
      } else {
        await client.query(
          `INSERT INTO class_bookings 
           (id, booking_code, user_id, session_id, class_id, coach_id, venue_id, booking_type, payment_type, coach_plan_enrollment_id, price_paid_tomans, gravity_commission_tomans, coach_earning_tomans, status, attendance_status, qr_token, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, 0, $11, $12, $13, NOW(), NOW())`,
          [
            bookingId,
            bookingCode,
            userId,
            sessionId,
            session.class_id,
            session.coach_id,
            session.venue_id,
            'PLAN_SESSION',
            'COACH_MONTHLY_PLAN',
            enrollmentId,
            ClassBookingStatus.CONFIRMED,
            ClassAttendanceStatus.PENDING,
            qrToken,
          ],
        );

        await client.query(
          `INSERT INTO coach_plan_usage_ledger 
           (id, enrollment_id, user_id, delta_sessions, remaining_after, action_type, reference_booking_id, description, created_at)
           VALUES ($1, $2, $3, -1, $4, $5, $6, $7, NOW())`,
          [
            crypto.randomUUID(),
            enrollmentId,
            userId,
            remainingAfter,
            CoachPlanUsageAction.SESSION_BOOKING,
            bookingId,
            `رزرو جلسه با اشتراک ماهانه (کد رزرو: ${bookingCode})`,
          ],
        );
      }

      this.logger.log(`[Session Booked via Monthly Plan] Booking: ${bookingCode} | Enrollment: ${enrollmentId} | Remaining Quota: ${remainingAfter}`);
      return this.mapBooking(bookingRow);
    });
  }

  /**
   * Member cancels a confirmed booking.
   * Restores quota if monthly plan, or triggers coach clawback/refund if single session.
   */
  async cancelBooking(userId: string, bookingId: string, reason?: string): Promise<ClassBooking> {
    return this.db.withTransaction(async (client) => {
      let booking: any = null;
      if (this.db.isInMemory) {
        booking = this.db.getTable('class_bookings').find((b: any) => b.id === bookingId);
      } else {
        const res = await client.query('SELECT * FROM class_bookings WHERE id = $1 FOR UPDATE', [bookingId]);
        booking = res.rows[0];
      }

      if (!booking) throw new NotFoundException('رزرو مورد نظر یافت نشد.');
      if (booking.user_id !== userId) {
        throw new ForbiddenException('شما مجاز به لغو رزرو سایر کاربران نیستید.');
      }
      if (booking.status !== ClassBookingStatus.CONFIRMED) {
        throw new BadRequestException('تنها رزروهای تأییدشده قابل لغو می‌باشند.');
      }

      // Check session start time and cancellation policy
      const session = await this.getSessionById(booking.session_id);
      const coachClass = await this.getClassById(booking.class_id);
      const sessionDateTime = new Date(`${session.sessionDate}T${session.startTime}`);
      const deadlineHours = coachClass.cancellationDeadlineHours || 2;
      const cancellationDeadline = new Date(sessionDateTime.getTime() - deadlineHours * 60 * 60 * 1000);

      if (Date.now() > cancellationDeadline.getTime()) {
        throw new BadRequestException(`مهلت لغو این جلسه به پایان رسیده است (حداکثر تا ${deadlineHours} ساعت قبل از شروع).`);
      }

      // 1. Decrement session booked count
      if (this.db.isInMemory) {
        const s = this.db.getTable('class_sessions').find((x: any) => x.id === booking.session_id);
        if (s && s.booked_count > 0) s.booked_count -= 1;
      } else {
        await client.query('UPDATE class_sessions SET booked_count = GREATEST(0, booked_count - 1), updated_at = NOW() WHERE id = $1', [booking.session_id]);
      }

      // 2. Handle refund / quota restoration
      if (booking.payment_type === 'COACH_MONTHLY_PLAN' && booking.coach_plan_enrollment_id) {
        await this.restoreMonthlyPlanQuota(client, booking.coach_plan_enrollment_id, booking.id, 'لغو رزرو توسط کاربر و بازگشت سهمیه');
      } else if (booking.payment_type === 'DIRECT_PAYMENT' && Number(booking.coach_earning_tomans) > 0) {
        await this.coachesService.debitCoachPayable(
          booking.coach_id,
          Number(booking.coach_earning_tomans),
          booking.id,
          CoachPayableEntryType.REFUND_DEDUCTION,
          `استرداد لغو رزرو توسط کاربر (کد رزرو: ${booking.booking_code})`,
        );
      }

      // 3. Mark booking as CANCELLED
      const now = new Date().toISOString();
      if (this.db.isInMemory) {
        booking.status = ClassBookingStatus.CANCELLED;
        booking.cancellation_reason = reason || 'لغو توسط کاربر';
        booking.cancelled_at = now;
        booking.updated_at = now;
        return this.mapBooking(booking);
      }

      const res = await client.query(
        `UPDATE class_bookings 
         SET status = $1, cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW() 
         WHERE id = $3 RETURNING *`,
        [ClassBookingStatus.CANCELLED, reason || 'لغو توسط کاربر', bookingId],
      );
      return this.mapBooking(res.rows[0]);
    });
  }

  /**
   * Helper to restore 1 session back to an enrollment quota.
   */
  private async restoreMonthlyPlanQuota(
    client: any,
    enrollmentId: string,
    bookingId: string,
    description: string,
  ): Promise<void> {
    if (this.db.isInMemory) {
      const e = this.db.getTable('coach_plan_enrollments').find((x: any) => x.id === enrollmentId);
      if (e) {
        e.remaining_sessions = Number(e.remaining_sessions) + 1;
        e.used_sessions = Math.max(0, Number(e.used_sessions) - 1);
        if (e.status === CoachPlanStatus.EXHAUSTED) {
          e.status = CoachPlanStatus.ACTIVE;
        }
        e.updated_at = new Date().toISOString();

        this.db.getTable('coach_plan_usage_ledger').push({
          id: crypto.randomUUID(),
          enrollment_id: enrollmentId,
          user_id: e.user_id,
          delta_sessions: 1,
          remaining_after: e.remaining_sessions,
          action_type: CoachPlanUsageAction.CANCELLATION_RESTORE,
          reference_booking_id: bookingId,
          description,
          created_at: new Date().toISOString(),
        });
      }
      return;
    }

    const eRes = await client.query('SELECT * FROM coach_plan_enrollments WHERE id = $1 FOR UPDATE', [enrollmentId]);
    const e = eRes.rows[0];
    if (e) {
      const newRemaining = Number(e.remaining_sessions) + 1;
      const newUsed = Math.max(0, Number(e.used_sessions) - 1);
      const newStatus = e.status === CoachPlanStatus.EXHAUSTED ? CoachPlanStatus.ACTIVE : e.status;

      await client.query(
        'UPDATE coach_plan_enrollments SET remaining_sessions = $1, used_sessions = $2, status = $3, updated_at = NOW() WHERE id = $4',
        [newRemaining, newUsed, newStatus, enrollmentId],
      );

      await client.query(
        `INSERT INTO coach_plan_usage_ledger 
         (id, enrollment_id, user_id, delta_sessions, remaining_after, action_type, reference_booking_id, description, created_at)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $7, NOW())`,
        [crypto.randomUUID(), enrollmentId, e.user_id, newRemaining, CoachPlanUsageAction.CANCELLATION_RESTORE, bookingId, description],
      );
    }
  }

  // ==========================================
  // 4. MEMBER BOOKINGS & PASSES (ACCOUNT)
  // ==========================================

  /**
   * Retrieves all class bookings for the member.
   */
  async getUserBookings(userId: string): Promise<ClassBooking[]> {
    let bookings: any[] = [];
    let classes: any[] = [];
    let sessions: any[] = [];
    let coaches: any[] = [];
    let venues: any[] = [];

    if (this.db.isInMemory) {
      bookings = this.db.getTable('class_bookings')
        .filter((b: any) => b.user_id === userId)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      classes = this.db.getTable('coach_classes');
      sessions = this.db.getTable('class_sessions');
      coaches = this.db.getTable('coaches');
      venues = this.db.getTable('class_venues');
    } else {
      const bRes = await this.db.query('SELECT * FROM class_bookings WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      bookings = bRes.rows;
      const [cRes, sRes, coRes, vRes] = await Promise.all([
        this.db.query('SELECT * FROM coach_classes'),
        this.db.query('SELECT * FROM class_sessions'),
        this.db.query('SELECT * FROM coaches'),
        this.db.query('SELECT * FROM class_venues'),
      ]);
      classes = cRes.rows;
      sessions = sRes.rows;
      coaches = coRes.rows;
      venues = vRes.rows;
    }

    const classMap = new Map(classes.map((c: any) => [c.id, c]));
    const sessionMap = new Map(sessions.map((s: any) => [s.id, s]));
    const coachMap = new Map(coaches.map((co: any) => [co.id, co]));
    const venueMap = new Map(venues.map((v: any) => [v.id, v]));

    return bookings.map((b: any) => {
      const cls = classMap.get(b.class_id);
      const ses = sessionMap.get(b.session_id);
      const co = coachMap.get(b.coach_id);
      const ven = venueMap.get(b.venue_id);

      return {
        ...this.mapBooking(b),
        classTitle: cls?.title,
        coachName: co?.display_name,
        venueName: ven?.name_fa,
        venueType: ven?.venue_type,
        session: ses ? this.mapSession(ses) : undefined,
      };
    });
  }

  /**
   * Retrieves all active and historical coach monthly plan enrollments for the member.
   */
  async getUserEnrollments(userId: string): Promise<CoachPlanEnrollment[]> {
    let enrollments: any[] = [];
    let classes: any[] = [];
    let coaches: any[] = [];
    let plans: any[] = [];

    if (this.db.isInMemory) {
      enrollments = this.db.getTable('coach_plan_enrollments')
        .filter((e: any) => e.user_id === userId)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      classes = this.db.getTable('coach_classes');
      coaches = this.db.getTable('coaches');
      plans = this.db.getTable('coach_monthly_plans');
    } else {
      const eRes = await this.db.query('SELECT * FROM coach_plan_enrollments WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      enrollments = eRes.rows;
      const [cRes, coRes, pRes] = await Promise.all([
        this.db.query('SELECT * FROM coach_classes'),
        this.db.query('SELECT * FROM coaches'),
        this.db.query('SELECT * FROM coach_monthly_plans'),
      ]);
      classes = cRes.rows;
      coaches = coRes.rows;
      plans = pRes.rows;
    }

    const classMap = new Map(classes.map((c: any) => [c.id, c]));
    const coachMap = new Map(coaches.map((co: any) => [co.id, co]));
    const planMap = new Map(plans.map((p: any) => [p.id, p]));

    return enrollments.map((e: any) => {
      const cls = classMap.get(e.class_id);
      const co = coachMap.get(e.coach_id);
      const plan = planMap.get(e.plan_id);

      return {
        ...this.mapEnrollment(e),
        classTitle: cls?.title,
        coachName: co?.display_name,
        planTitle: plan?.title,
      };
    });
  }

  /**
   * Verifies class QR check-in token at the door or venue.
   * Replay-protected and idempotent.
   */
  async verifyClassQrToken(token: string) {
    let booking: any = null;
    let user: any = null;
    let session: any = null;
    let cls: any = null;
    let venue: any = null;

    if (this.db.isInMemory) {
      booking = this.db.getTable('class_bookings').find((b: any) => b.qr_token === token);
      if (!booking) throw new NotFoundException('بارکد یا کد ورود کلاس نامعتبر است.');
      user = this.db.getTable('users').find((u: any) => u.id === booking.user_id);
      session = this.db.getTable('class_sessions').find((s: any) => s.id === booking.session_id);
      cls = this.db.getTable('coach_classes').find((c: any) => c.id === booking.class_id);
      venue = this.db.getTable('class_venues').find((v: any) => v.id === booking.venue_id);
    } else {
      const bRes = await this.db.query('SELECT * FROM class_bookings WHERE qr_token = $1', [token]);
      booking = bRes.rows[0];
      if (!booking) throw new NotFoundException('بارکد یا کد ورود کلاس نامعتبر است.');

      const [uRes, sRes, cRes, vRes] = await Promise.all([
        this.db.query('SELECT * FROM users WHERE id = $1', [booking.user_id]),
        this.db.query('SELECT * FROM class_sessions WHERE id = $1', [booking.session_id]),
        this.db.query('SELECT * FROM coach_classes WHERE id = $1', [booking.class_id]),
        this.db.query('SELECT * FROM class_venues WHERE id = $1', [booking.venue_id]),
      ]);
      user = uRes.rows[0];
      session = sRes.rows[0];
      cls = cRes.rows[0];
      venue = vRes.rows[0];
    }

    if (booking.status !== ClassBookingStatus.CONFIRMED) {
      throw new BadRequestException(`وضعیت این رزرو ${booking.status} است و امکان ورود وجود ندارد.`);
    }

    // Mark attended if not already attended
    const now = new Date().toISOString();
    if (booking.attendance_status !== ClassAttendanceStatus.ATTENDED) {
      if (this.db.isInMemory) {
        booking.attendance_status = ClassAttendanceStatus.ATTENDED;
        booking.attended_at = now;
        booking.updated_at = now;
      } else {
        await this.db.query(
          'UPDATE class_bookings SET attendance_status = $1, attended_at = NOW(), updated_at = NOW() WHERE id = $2',
          [ClassAttendanceStatus.ATTENDED, booking.id],
        );
      }
    }

    return {
      isValid: true,
      bookingCode: booking.booking_code,
      userName: user?.full_name || 'کاربر گرامی',
      userPhone: user?.phone,
      classTitle: cls?.title,
      sessionDate: session?.session_date,
      startTime: session?.start_time,
      venueName: venue?.name_fa,
      attendanceStatus: ClassAttendanceStatus.ATTENDED,
      attendedAt: booking.attended_at || now,
    };
  }

  // ==========================================
  // MAPPERS
  // ==========================================

  private mapCategory(r: any): ClassCategory {
    return {
      id: r.id,
      slug: r.slug,
      nameFa: r.name_fa,
      icon: r.icon,
      description: r.description,
      isActive: Boolean(r.is_active),
      sortOrder: Number(r.sort_order || 0),
    };
  }

  private mapVenue(r: any): ClassVenue {
    return {
      id: r.id,
      venueType: r.venue_type,
      gymId: r.gym_id,
      nameFa: r.name_fa,
      city: r.city,
      district: r.district,
      addressFa: r.address_fa,
      latitude: r.latitude ? Number(r.latitude) : null,
      longitude: r.longitude ? Number(r.longitude) : null,
      onlineMeetingUrl: r.online_meeting_url,
      createdByCoachId: r.created_by_coach_id,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    };
  }

  private mapClass(r: any): CoachClass {
    return {
      id: r.id,
      coachId: r.coach_id,
      categorySlug: r.category_slug,
      title: r.title,
      description: r.description,
      difficulty: r.difficulty,
      durationMinutes: Number(r.duration_minutes || 60),
      defaultCapacity: Number(r.default_capacity || 12),
      venueId: r.venue_id,
      singleSessionPriceTomans: Number(r.single_session_price_tomans || 0),
      hasMonthlyPlan: Boolean(r.has_monthly_plan),
      cancellationDeadlineHours: Number(r.cancellation_deadline_hours || 2),
      isActive: Boolean(r.is_active),
      isPublic: Boolean(r.is_public),
      coverImageUrl: r.cover_image_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapSession(r: any): ClassSession {
    const cap = Number(r.capacity || 0);
    const booked = Number(r.booked_count || 0);
    return {
      id: r.id,
      classId: r.class_id,
      coachId: r.coach_id,
      venueId: r.venue_id,
      sessionDate: r.session_date,
      startTime: r.start_time,
      endTime: r.end_time,
      capacity: cap,
      bookedCount: booked,
      availableSeats: Math.max(0, cap - booked),
      priceTomans: Number(r.price_tomans || 0),
      status: r.status,
      cancellationReason: r.cancellation_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapMonthlyPlan(r: any): CoachMonthlyPlan {
    return {
      id: r.id,
      coachId: r.coach_id,
      classId: r.class_id,
      title: r.title,
      description: r.description,
      includedSessions: Number(r.included_sessions || 8),
      priceTomans: Number(r.price_tomans || 0),
      validityDays: Number(r.validity_days || 30),
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    };
  }

  private mapEnrollment(r: any): CoachPlanEnrollment {
    return {
      id: r.id,
      userId: r.user_id,
      coachId: r.coach_id,
      classId: r.class_id,
      planId: r.plan_id,
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      totalSessions: Number(r.total_sessions || 0),
      usedSessions: Number(r.used_sessions || 0),
      remainingSessions: Number(r.remaining_sessions || 0),
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapBooking(r: any): ClassBooking {
    return {
      id: r.id,
      bookingCode: r.booking_code,
      userId: r.user_id,
      sessionId: r.session_id,
      classId: r.class_id,
      coachId: r.coach_id,
      venueId: r.venue_id,
      paymentMethod: r.payment_type === 'COACH_MONTHLY_PLAN' ? 'MONTHLY_PLAN_QUOTA' : 'DIRECT_PAYMENT',
      enrollmentId: r.coach_plan_enrollment_id,
      paymentTransactionId: r.payment_transaction_id,
      pricePaidTomans: Number(r.price_paid_tomans || 0),
      gravityCommissionTomans: Number(r.gravity_commission_tomans || 0),
      coachEarningTomans: Number(r.coach_earning_tomans || 0),
      status: r.status,
      attendanceStatus: r.attendance_status,
      attendedAt: r.attended_at,
      checkinToken: r.qr_token,
      cancellationReason: r.cancellation_reason,
      cancelledAt: r.cancelled_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapCoachBasic(r: any) {
    return {
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      bio: r.bio,
      avatarUrl: r.avatar_url,
      specialties: Array.isArray(r.specialties) ? r.specialties : (typeof r.specialties === 'string' ? JSON.parse(r.specialties) : []),
      sports: Array.isArray(r.sports) ? r.sports : (typeof r.sports === 'string' ? JSON.parse(r.sports) : []),
      experienceYears: Number(r.experience_years || 1),
      verificationStatus: r.verification_status,
      isActive: Boolean(r.is_active),
      commissionRate: Number(r.commission_rate || 0.15),
      payableBalanceTomans: Number(r.payable_balance_tomans || 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
