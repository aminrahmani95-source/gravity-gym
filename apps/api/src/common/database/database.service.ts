import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy, IDatabaseClient {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private isMemoryMode = false;
  private memoryTables: Map<string, any[]> = new Map();
  private readonly asyncLocalStorage = new AsyncLocalStorage<{ inTx: boolean; client?: any }>();

  async onModuleInit() {
    const dbUrl = process.env.DATABASE_URL;
    if (process.env.NODE_ENV === 'production') {
      if (!dbUrl) {
        throw new Error('FATAL SECURITY ERROR: DATABASE_URL is not set in production. In-memory engine fallback is strictly forbidden in production mode.');
      }
      try {
        this.pool = new Pool({
          connectionString: dbUrl,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 3000,
        });
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        this.logger.log('Connected to PostgreSQL database successfully in production mode.');
        return;
      } catch (err) {
        throw new Error(`FATAL SECURITY ERROR: PostgreSQL connection failed in production mode (${(err as Error).message}). Refusing to run in-memory fallback.`);
      }
    }

    if (dbUrl && process.env.NODE_ENV !== 'test' && process.env.USE_REAL_POSTGRES === 'true') {
      try {
        this.pool = new Pool({
          connectionString: dbUrl,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 3000,
        });
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        this.logger.log('Connected to PostgreSQL database successfully.');
        return;
      } catch (err) {
        if (this.pool) {
          await this.pool.end().catch(() => {});
          this.pool = null;
        }
        this.logger.warn(`PostgreSQL connection failed (${(err as Error).message}). Falling back to In-Memory relational engine for development/testing.`);
      }
    }

    this.initMemoryEngine();
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  get isInMemory(): boolean {
    return this.isMemoryMode;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; mode: 'postgresql' | 'in-memory'; error?: string }> {
    const start = Date.now();
    try {
      if (this.pool && !this.isMemoryMode) {
        const client = await this.pool.connect();
        try {
          await client.query('SELECT 1');
          return { ok: true, latencyMs: Date.now() - start, mode: 'postgresql' };
        } finally {
          client.release();
        }
      }
      return { ok: true, latencyMs: Date.now() - start, mode: 'in-memory' };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        mode: this.isMemoryMode ? 'in-memory' : 'postgresql',
        error: (err as Error).message,
      };
    }
  }

  private initMemoryEngine() {
    this.isMemoryMode = true;
    this.logger.log('In-Memory Relational Engine initialized with ACID transaction emulation.');
    
    // Initialize tables
    const tableNames = [
      'users', 'gyms', 'gym_branches', 'facilities', 'gym_facilities',
      'gym_sans', 'plans', 'subscriptions', 'payment_transactions', 'credit_ledger',
      'gym_pricing_overrides', 'checkins', 'gym_payable_ledger',
      'settlement_batches', 'system_configs', 'audit_logs', 'fraud_events',
      'coaches', 'class_categories', 'class_venues', 'coach_classes',
      'class_sessions', 'coach_monthly_plans', 'coach_plan_enrollments',
      'coach_plan_usage_ledger', 'class_bookings', 'coach_payable_ledger',
      'coach_settlement_batches'
    ];
    for (const t of tableNames) {
      this.memoryTables.set(t, []);
    }

    this.seedMemoryData();
  }

  private seedMemoryData() {
    // 1. System Configs (Single Source of Truth)
    this.getTable('system_configs').push(
      { key: 'global_max_payout_per_credit_ratio', value_json: { value: 32000 }, description: 'Golden Bounding threshold (standard plan derived ceiling)' },
      { key: 'default_rollover_percentage', value_json: { value: 0.10 }, description: 'Default rollover cap' },
      { key: 'default_max_rollover_credits', value_json: { value: 5 }, description: 'Max absolute rollover credits' },
      { key: 'default_cooldown_minutes', value_json: { value: 120 }, description: 'Cooldown minutes' },
      { key: 'default_club_monthly_visit_cap', value_json: { value: 4 }, description: 'Club monthly visit cap' },
      { key: 'impossible_velocity_kmh_threshold', value_json: { value: 70 }, description: 'Velocity limit' },
      { key: 'qr_validity_seconds', value_json: { value: 45 }, description: 'Cryptographic validity lifetime of dynamic QR tokens' },
      { key: 'qr_nonce_retention_seconds', value_json: { value: 90 }, description: 'Replay-prevention nonce retention TTL in Redis' },
      { key: 'otp_resend_cooldown_seconds', value_json: { value: 60 }, description: 'SMS OTP re-dispatch interval cooldown' },
      { key: 'otp_max_attempts', value_json: { value: 5 }, description: 'Maximum failed OTP verification attempts before invalidation' },
      { key: 'default_peak_multiplier', value_json: { value: 1.25 }, description: 'Default multiplier for peak Sans credit pricing' },
      { key: 'variable_cost_per_subscriber_tomans', value_json: { value: 40000 }, description: 'Monthly direct variable cost per active subscriber (VC_sub)' },
      { key: 'variable_cost_per_checkin_tomans', value_json: { value: 500 }, description: 'Direct operational and messaging friction per check-in (VC_checkin)' }
    );

    // 2. Facilities
    const facs = [
      { id: 'f-1', name_fa: 'وزنه‌های آزاد و بدنسازی', slug: 'free_weights', icon: 'dumbbell', is_premium: false },
      { id: 'f-2', name_fa: 'دستگاه‌های هوازی', slug: 'cardio', icon: 'activity', is_premium: false },
      { id: 'f-3', name_fa: 'سونا خشک و بخار', slug: 'sauna', icon: 'flame', is_premium: true },
      { id: 'f-4', name_fa: 'استخر المپیک', slug: 'olympic_pool', icon: 'pool', is_premium: true }
    ];
    this.getTable('facilities').push(...facs);

    // 3. Plans
    this.getTable('plans').push(
      {
        id: 'plan-1',
        slug: 'starter_15',
        title_fa: 'پلن برنزی - ۱۵ اعتبار',
        price_tomans: 550000,
        credits_awarded: 15,
        validity_days: 30,
        rollover_percentage: 0.10,
        max_rollover_credits: 2,
        is_active: true,
        sort_order: 1
      },
      {
        id: 'plan-2',
        slug: 'standard_30',
        title_fa: 'پلن نقره‌ای - ۳۰ اعتبار',
        price_tomans: 1000000,
        credits_awarded: 30,
        validity_days: 30,
        rollover_percentage: 0.10,
        max_rollover_credits: 5,
        is_active: true,
        sort_order: 2
      },
      {
        id: 'plan-3',
        slug: 'pro_60',
        title_fa: 'پلن طلایی - ۶۰ اعتبار',
        price_tomans: 1900000,
        credits_awarded: 60,
        validity_days: 30,
        rollover_percentage: 0.10,
        max_rollover_credits: 10,
        is_active: true,
        sort_order: 3
      }
    );

    // 4. Users (Admin, Staff, Member)
    this.getTable('users').push(
      {
        id: 'user-admin',
        phone_number: '09120000001',
        first_name: 'مدیر',
        last_name: 'سیستم',
        gender: 'MALE',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'user-admin-ops',
        phone_number: '09120000005',
        first_name: 'پویا',
        last_name: 'سلیمانی (مدیر اجرایی)',
        gender: 'MALE',
        national_code: '1234567891',
        role: 'ADMIN',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'user-staff',
        phone_number: '09120000002',
        first_name: 'رضا',
        last_name: 'محمدی (پذیرش اسپیناس)',
        gender: 'MALE',
        role: 'GYM_STAFF',
        assigned_gym_id: 'gym-elite-4',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'user-member-1',
        phone_number: '09120000003',
        first_name: 'علی',
        last_name: 'احمدی',
        gender: 'MALE',
        national_code: '0012345678',
        role: 'USER',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'user-member-2',
        phone_number: '09120000004',
        first_name: 'سارا',
        last_name: 'کرمی',
        gender: 'FEMALE',
        national_code: '0087654321',
        role: 'USER',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      }
    );

    // 5. Gyms
    this.getTable('gyms').push(
      {
        id: 'gym-basic-1',
        name_fa: 'باشگاه بدنسازی کارو',
        tier: 'BASIC',
        access_mode: 'FEMALE_ONLY',
        city: 'تهران',
        district: 'نواب',
        address_fa: 'خیابان قزوین، خیابان عباسی، پلاک ۴۲',
        latitude: 35.672000,
        longitude: 51.385000,
        geofence_radius_meters: 200,
        sheba_number: 'IR430120000000000000000001',
        bank_account_holder: 'محمد رستمی',
        is_active: true
      },
      {
        id: 'gym-plus-2',
        name_fa: 'مجموعه ورزشی ستاره ونک',
        tier: 'PLUS',
        access_mode: 'MALE_ONLY',
        city: 'تهران',
        district: 'ونک',
        address_fa: 'میدان ونک، خیابان ملاصدرا، پلاک ۱۰',
        latitude: 35.758000,
        longitude: 51.398000,
        geofence_radius_meters: 150,
        sheba_number: 'IR160120000000000000000002',
        bank_account_holder: 'ستاره ورزش ایرانیان',
        is_active: true
      },
      {
        id: 'gym-premium-3',
        name_fa: 'باشگاه اکسیژن رویال',
        tier: 'PREMIUM',
        access_mode: 'MIXED',
        city: 'تهران',
        district: 'سعادت آباد',
        address_fa: 'بلوار سرو غربی، خیابان صدف، مجتمع صدف',
        latitude: 35.789000,
        longitude: 51.372000,
        geofence_radius_meters: 150,
        sheba_number: 'IR860120000000000000000003',
        bank_account_holder: 'باشگاه اکسیژن پارس',
        is_active: true
      },
      {
        id: 'gym-elite-4',
        name_fa: 'کلاب ورزشی هتل اسپیناس پالاس',
        tier: 'ELITE',
        access_mode: 'MIXED',
        city: 'تهران',
        district: 'سعادت آباد',
        address_fa: 'بیدستان یکم، هتل اسپیناس پالاس، طبقه -۲',
        latitude: 35.795000,
        longitude: 51.365000,
        geofence_radius_meters: 250,
        sheba_number: 'IR590120000000000000000004',
        bank_account_holder: 'هتل بین المللی اسپیناس',
        is_active: true
      }
    );

    // 6. Pricing Overrides
    this.getTable('gym_pricing_overrides').push(
      {
        id: 'po-1',
        gym_id: 'gym-basic-1',
        credit_cost: 2,
        monetary_payout_tomans: 30000,
        offpeak_credit_cost: 2,
        peak_credit_cost: 2,
        effective_from: new Date().toISOString()
      },
      {
        id: 'po-2',
        gym_id: 'gym-plus-2',
        credit_cost: 4,
        monetary_payout_tomans: 65000,
        offpeak_credit_cost: 3,
        peak_credit_cost: 5,
        effective_from: new Date().toISOString()
      },
      {
        id: 'po-3',
        gym_id: 'gym-premium-3',
        credit_cost: 7,
        monetary_payout_tomans: 115000,
        offpeak_credit_cost: 6,
        peak_credit_cost: 8,
        effective_from: new Date().toISOString()
      },
      {
        id: 'po-4',
        gym_id: 'gym-elite-4',
        credit_cost: 14,
        monetary_payout_tomans: 230000,
        offpeak_credit_cost: 12,
        peak_credit_cost: 16,
        effective_from: new Date().toISOString()
      }
    );

    // 7. Operating Sans (Saturday to Friday)
    const sansTable = this.getTable('gym_sans');

    // Basic 1: FEMALE_ONLY (All 7 days: 06:00 - 23:59:59)
    for (let day = 0; day <= 6; day++) {
      sansTable.push({
        id: `sans-gym-basic-1-${day}-f`,
        gym_id: 'gym-basic-1',
        day_of_week: day,
        gender: 'FEMALE',
        start_time: '06:00:00',
        end_time: '23:59:59',
        capacity: 35,
        is_peak: day === 0 || day === 2
      });
    }

    // Plus 2: MALE_ONLY (All 7 days: 06:00 - 23:59:59 and late night 00:00 - 05:00)
    for (let day = 0; day <= 6; day++) {
      sansTable.push({
        id: `sans-gym-plus-2-${day}-m`,
        gym_id: 'gym-plus-2',
        day_of_week: day,
        gender: 'MALE',
        start_time: '06:00:00',
        end_time: '23:59:59',
        capacity: 45,
        is_peak: true
      });
      sansTable.push({
        id: `sans-gym-plus-2-${day}-m-night`,
        gym_id: 'gym-plus-2',
        day_of_week: day,
        gender: 'MALE',
        start_time: '00:00:00',
        end_time: '05:00:00',
        capacity: 25,
        is_peak: false
      });
    }

    // Premium 3 & Elite 4: MIXED (Segregated daily shifts)
    for (const gid of ['gym-premium-3', 'gym-elite-4']) {
      for (let day = 0; day <= 6; day++) {
        // Female Sans: 08:00 - 14:00
        sansTable.push({
          id: `sans-${gid}-${day}-f`,
          gym_id: gid,
          day_of_week: day,
          gender: 'FEMALE',
          start_time: '06:00:00',
          end_time: '14:00:00',
          capacity: 30,
          is_peak: day === 0 || day === 2
        });
        // Male Sans: 14:00 - 23:59:59
        sansTable.push({
          id: `sans-${gid}-${day}-m`,
          gym_id: gid,
          day_of_week: day,
          gender: 'MALE',
          start_time: '14:00:00',
          end_time: '23:59:59',
          capacity: 40,
          is_peak: true
        });
        // Male Late Night Sans: 00:00:00 - 05:00:00
        sansTable.push({
          id: `sans-${gid}-${day}-m-night`,
          gym_id: gid,
          day_of_week: day,
          gender: 'MALE',
          start_time: '00:00:00',
          end_time: '05:00:00',
          capacity: 30,
          is_peak: true
        });
      }
    }

    // 8. Coach Class Categories
    const categories = [
      { id: 'cat-1', slug: 'fitness', name_fa: 'تناسب اندام و فیتنس', icon: 'zap', description: 'تمرینات چربی‌سوزی، استقامت و فرم‌دهی عضلانی', is_active: true, sort_order: 1 },
      { id: 'cat-2', slug: 'trx', name_fa: 'تی‌آر‌ایکس (TRX)', icon: 'activity', description: 'تمرینات معلق تعلیقی با وزن بدن برای تقویت میان‌تنه و انعطاف', is_active: true, sort_order: 2 },
      { id: 'cat-3', slug: 'pilates', name_fa: 'پیلاتس (Pilates)', icon: 'heart', description: 'تمرینات کنترل بدن، تعادل، عضلات عمقی و حرکات اصلاحی', is_active: true, sort_order: 3 },
      { id: 'cat-4', slug: 'yoga', name_fa: 'یوگا و مدیتیشن', icon: 'sun', description: 'آرامش ذهن، انعطاف‌پذیری و تمرینات تنفسی و وینیاسا', is_active: true, sort_order: 4 },
      { id: 'cat-5', slug: 'crossfit', name_fa: 'کراس‌فیت و کراس‌ترنینگ', icon: 'flame', description: 'تمرینات قدرتی و پرشدت ترکیبی', is_active: true, sort_order: 5 },
      { id: 'cat-6', slug: 'bodybuilding', name_fa: 'پرورش اندام و وزنه', icon: 'dumbbell', description: 'افزایش حجم و قدرت عضلانی تحت نظر مربی تخصصی', is_active: true, sort_order: 6 },
      { id: 'cat-7', slug: 'functional', name_fa: 'تمرینات فانکشنال', icon: 'target', description: 'حرکات کاربردی تقویت سیستم حرکتی و مهارت‌های بدنی', is_active: true, sort_order: 7 },
      { id: 'cat-8', slug: 'boxing', name_fa: 'بوکس و هنرهای رزمی', icon: 'shield', description: 'آموزش ضربات، دفاع، چابکی و تخلیه هیجان', is_active: true, sort_order: 8 }
    ];
    this.getTable('class_categories').push(...categories);

    // 9. Coach Users & Coach Profiles
    const nowIso = new Date().toISOString();
    this.getTable('users').push(
      {
        id: 'user-coach-1',
        phone_number: '09120000010',
        first_name: 'آرش',
        last_name: 'توانگر',
        gender: 'MALE',
        role: 'COACH',
        status: 'ACTIVE',
        created_at: nowIso
      },
      {
        id: 'user-coach-2',
        phone_number: '09120000020',
        first_name: 'مونا',
        last_name: 'راد',
        gender: 'FEMALE',
        role: 'COACH',
        status: 'ACTIVE',
        created_at: nowIso
      },
      {
        id: 'user-coach-3',
        phone_number: '09120000030',
        first_name: 'نوید',
        last_name: 'شایان',
        gender: 'MALE',
        role: 'USER',
        status: 'ACTIVE',
        created_at: nowIso
      }
    );

    this.getTable('coaches').push(
      {
        id: 'coach-1',
        user_id: 'user-coach-1',
        display_name: 'آرش توانگر',
        bio: 'مربی بین‌المللی بدنسازی و فیتنس با ۱۰ سال سابقه درخشان در آماده‌سازی بدنی و لاغری تضمینی.',
        avatar_url: '/coaches/arash.jpg',
        specialties: ['fitness', 'trx', 'functional'],
        sports: ['بدنسازی', 'تی‌آر‌ایکس', 'آمادگی جسمانی'],
        experience_years: 10,
        verification_status: 'VERIFIED',
        is_active: true,
        sheba_number: 'IR120120000000000000000010',
        bank_account_holder: 'آرش توانگر',
        contact_phone: '09120000010',
        commission_rate: 0.15,
        payable_balance_tomans: 1200000,
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'coach-2',
        user_id: 'user-coach-2',
        display_name: 'مونا راد',
        bio: 'مدرس ارشد پیلاتس و یوگا، متخصص تمرینات پاسچر، تسکین کمردرد و افزایش شادابی و انعطاف بانوان.',
        avatar_url: '/coaches/mona.jpg',
        specialties: ['pilates', 'yoga', 'corrective'],
        sports: ['پیلاتس', 'یوگا'],
        experience_years: 7,
        verification_status: 'VERIFIED',
        is_active: true,
        sheba_number: 'IR120120000000000000000020',
        bank_account_holder: 'مونا راد',
        contact_phone: '09120000020',
        commission_rate: 0.15,
        payable_balance_tomans: 850000,
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'coach-3',
        user_id: 'user-coach-3',
        display_name: 'نوید شایان',
        bio: 'مربی جوان کراس‌فیت و پاورلیفتینگ متمرکز بر تکنیک‌های وزنه‌برداری المپیکی.',
        avatar_url: '/coaches/navid.jpg',
        specialties: ['crossfit'],
        sports: ['کراس‌فیت'],
        experience_years: 4,
        verification_status: 'PENDING',
        is_active: false,
        sheba_number: 'IR120120000000000000000030',
        bank_account_holder: 'نوید شایان',
        contact_phone: '09120000030',
        commission_rate: 0.15,
        payable_balance_tomans: 0,
        created_at: nowIso,
        updated_at: nowIso
      }
    );

    // 10. Class Venues (Gravity Gym, External Gym, Independent, Online)
    this.getTable('class_venues').push(
      {
        id: 'venue-1',
        venue_type: 'GRAVITY_GYM',
        gym_id: 'gym-elite-4',
        name_fa: 'کلاب ورزشی هتل اسپیناس پالاس (سالن گروهی)',
        city: 'تهران',
        district: 'سعادت آباد',
        address_fa: 'بیدستان یکم، هتل اسپیناس پالاس، طبقه -۲',
        latitude: 35.795,
        longitude: 51.365,
        is_active: true,
        created_at: nowIso
      },
      {
        id: 'venue-2',
        venue_type: 'EXTERNAL_GYM',
        gym_id: null,
        name_fa: 'آکادمی ورزشی آروین (مجموعه مستقل همکار)',
        city: 'تهران',
        district: 'شهرک غرب',
        address_fa: 'بلوار فرحزادی، بالاتر از بلوار دادمان، پلاک ۲۵',
        latitude: 35.772,
        longitude: 51.368,
        is_active: true,
        created_at: nowIso
      },
      {
        id: 'venue-3',
        venue_type: 'INDEPENDENT_VENUE',
        gym_id: null,
        name_fa: 'استودیو تخصصی پیلاتس نیاوران',
        city: 'تهران',
        district: 'نیاوران',
        address_fa: 'خیابان باهنر، نرسیده به میدان نیاوران، ساختمان صبا، پلاک ۱۸',
        latitude: 35.815,
        longitude: 51.468,
        is_active: true,
        created_at: nowIso
      },
      {
        id: 'venue-4',
        venue_type: 'ONLINE',
        gym_id: null,
        name_fa: 'کلاس آنلاین و زنده اسکای‌روم گراویتی',
        city: 'تهران',
        district: null,
        address_fa: 'پلتفرم آنلاین ویدئوکنفرانس اختصاصی',
        online_meeting_url: 'https://meet.gravity-fitness.ir/classes/online-live',
        is_active: true,
        created_at: nowIso
      }
    );

    // 11. Coach Classes
    this.getTable('coach_classes').push(
      {
        id: 'class-1',
        coach_id: 'coach-1',
        category_slug: 'fitness',
        title: 'تناسب اندام و چربی‌سوزی پیشرفته با آرش',
        description: 'تمرینات جامع متابولیک با ترکیبی از اینتروال‌های پرشدت (HIIT) و فرم‌دهی کل عضلات بدن، با برنامه‌ریزی اختصاصی برای لاغری و تناسب اندام تضمینی.',
        difficulty: 'ALL_LEVELS',
        duration_minutes: 60,
        default_capacity: 15,
        venue_id: 'venue-1',
        single_session_price_tomans: 300000,
        has_monthly_plan: true,
        cancellation_deadline_hours: 12,
        is_active: true,
        is_public: true,
        cover_image_url: '/classes/fitness-fatburn.jpg',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'class-2',
        coach_id: 'coach-1',
        category_slug: 'trx',
        title: 'تی‌آر‌ایکس و تمرینات فانکشنال پیشرفته',
        description: 'تمرینات معلق TRX با تمرکز بر ثبات ناحیه مرکزی بدن (Core)، افزایش استقامت عضلانی و هماهنگی عصبی عضلانی در سالن استاندارد آروین.',
        difficulty: 'INTERMEDIATE',
        duration_minutes: 60,
        default_capacity: 10,
        venue_id: 'venue-2',
        single_session_price_tomans: 350000,
        has_monthly_plan: true,
        cancellation_deadline_hours: 12,
        is_active: true,
        is_public: true,
        cover_image_url: '/classes/trx-power.jpg',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'class-3',
        coach_id: 'coach-2',
        category_slug: 'pilates',
        title: 'پیلاتس کلاسیک و حرکات اصلاحی با مونا',
        description: 'کلاس تخصصی پیلاتس متمرکز بر اصلاح گودی کمر، تقویت ستون فقرات، تنفس دیافراگمی و افزایش انعطاف‌پذیری در استودیوی دنج و آرام نیاوران.',
        difficulty: 'ALL_LEVELS',
        duration_minutes: 60,
        default_capacity: 12,
        venue_id: 'venue-3',
        single_session_price_tomans: 280000,
        has_monthly_plan: true,
        cancellation_deadline_hours: 8,
        is_active: true,
        is_public: true,
        cover_image_url: '/classes/pilates-reformer.jpg',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'class-4',
        coach_id: 'coach-2',
        category_slug: 'yoga',
        title: 'یوگا وینیاسا و مدیتیشن آرامش آنلاین',
        description: 'کلاس آنلاین تعاملی یوگا برای رهایی از استرس روزمره، بهبود تمرکز، جریان انرژی مثبت و افزایش آرامش ذهن در محیط منزل.',
        difficulty: 'ALL_LEVELS',
        duration_minutes: 75,
        default_capacity: 30,
        venue_id: 'venue-4',
        single_session_price_tomans: 180000,
        has_monthly_plan: false,
        cancellation_deadline_hours: 6,
        is_active: true,
        is_public: true,
        cover_image_url: '/classes/yoga-flow.jpg',
        created_at: nowIso,
        updated_at: nowIso
      }
    );

    // 12. Coach Monthly Plans
    this.getTable('coach_monthly_plans').push(
      {
        id: 'cmp-1',
        coach_id: 'coach-1',
        class_id: 'class-1',
        title: 'اشتراک ماهانه ۱۲ جلسه فیتنس آرش',
        description: '۱۲ جلسه تمرین در طول ۳۰ روز تقویمی با مربی آرش توانگر (تک‌جلسه ۳۰۰ هزار تومان، در اشتراک ماهانه جلسه‌ای فقط ۲۴۱ هزار تومان).',
        included_sessions: 12,
        price_tomans: 2900000,
        validity_days: 30,
        is_active: true,
        created_at: nowIso
      },
      {
        id: 'cmp-2',
        coach_id: 'coach-1',
        class_id: 'class-2',
        title: 'اشتراک ماهانه ۸ جلسه تی‌آر‌ایکس آرش',
        description: '۸ جلسه فشرده دو جلسه در هفته تمرینات تی‌آر‌ایکس در آکادمی آروین.',
        included_sessions: 8,
        price_tomans: 2400000,
        validity_days: 30,
        is_active: true,
        created_at: nowIso
      },
      {
        id: 'cmp-3',
        coach_id: 'coach-2',
        class_id: 'class-3',
        title: 'اشتراک ماهانه ۱۲ جلسه پیلاتس مونا',
        description: '۱۲ جلسه پیلاتس کلاسیک و اصلاحی در استودیو نیاوران همراه با مشاوره پوسچر.',
        included_sessions: 12,
        price_tomans: 2600000,
        validity_days: 30,
        is_active: true,
        created_at: nowIso
      }
    );

    // 13. Class Scheduled Sessions
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];
    const twoDaysLater = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().split('T')[0];

    this.getTable('class_sessions').push(
      {
        id: 'session-1',
        class_id: 'class-1',
        coach_id: 'coach-1',
        venue_id: 'venue-1',
        session_date: tomorrow,
        start_time: '18:00:00',
        end_time: '19:00:00',
        capacity: 15,
        booked_count: 3,
        price_tomans: 300000,
        status: 'SCHEDULED',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'session-2',
        class_id: 'class-1',
        coach_id: 'coach-1',
        venue_id: 'venue-1',
        session_date: threeDaysLater,
        start_time: '18:00:00',
        end_time: '19:00:00',
        capacity: 15,
        booked_count: 0,
        price_tomans: 300000,
        status: 'SCHEDULED',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'session-3',
        class_id: 'class-2',
        coach_id: 'coach-1',
        venue_id: 'venue-2',
        session_date: tomorrow,
        start_time: '19:30:00',
        end_time: '20:30:00',
        capacity: 10,
        booked_count: 2,
        price_tomans: 350000,
        status: 'SCHEDULED',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'session-4',
        class_id: 'class-3',
        coach_id: 'coach-2',
        venue_id: 'venue-3',
        session_date: tomorrow,
        start_time: '10:00:00',
        end_time: '11:00:00',
        capacity: 12,
        booked_count: 4,
        price_tomans: 280000,
        status: 'SCHEDULED',
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: 'session-5',
        class_id: 'class-4',
        coach_id: 'coach-2',
        venue_id: 'venue-4',
        session_date: twoDaysLater,
        start_time: '20:00:00',
        end_time: '21:15:00',
        capacity: 30,
        booked_count: 10,
        price_tomans: 180000,
        status: 'SCHEDULED',
        created_at: nowIso,
        updated_at: nowIso
      }
    );
  }

  getTable(name: string): any[] {
    if (!this.memoryTables.has(name)) {
      this.memoryTables.set(name, []);
    }
    return this.memoryTables.get(name)!;
  }

  private queryCount = 0;

  getQueryCount(): number {
    return this.queryCount;
  }

  resetQueryCount(): void {
    this.queryCount = 0;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    this.queryCount++;
    const activeTx = this.asyncLocalStorage.getStore();
    if (activeTx?.inTx && activeTx.client && activeTx.client !== this) {
      const res = await activeTx.client.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
    }
    if (this.pool && !this.isMemoryMode) {
      const res = await this.pool.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
    }

    // In-memory query interpreter for testing & development
    return this.executeMemoryQuery<T>(sql, params);
  }

  private memoryTransactionQueue: Promise<void> = Promise.resolve();

  async withTransaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const activeTx = this.asyncLocalStorage.getStore();
    if (activeTx?.inTx) {
      // Re-entrant nested transaction: execute directly within parent transaction context
      return callback(activeTx.client || this);
    }

    if (this.pool && !this.isMemoryMode) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await this.asyncLocalStorage.run({ inTx: true, client }, () => callback(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory transaction serialization (ACID Isolation)
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousQueue = this.memoryTransactionQueue;
    this.memoryTransactionQueue = (async () => {
      try {
        await previousQueue;
      } catch {
        // continue
      }
      await lockPromise;
    })();

    try {
      await previousQueue;
    } catch {
      // continue
    }

    try {
      const backup = new Map<string, string>();
      for (const [key, val] of this.memoryTables.entries()) {
        backup.set(key, JSON.stringify(val));
      }

      try {
        return await this.asyncLocalStorage.run({ inTx: true, client: this }, () => callback(this));
      } catch (err) {
        // Rollback memory state
        for (const [key, json] of backup.entries()) {
          this.memoryTables.set(key, JSON.parse(json));
        }
        throw err;
      }
    } finally {
      releaseLock!();
    }
  }

  private executeMemoryQuery<T = any>(sql: string, params: any[]): QueryResult<T> {
    let cleanSql = sql.trim().replace(/\s+/g, ' ');
    // Strip trailing FOR UPDATE / FOR SHARE locks in memory mode
    cleanSql = cleanSql.replace(/\s+FOR\s+UPDATE(?:\s+OF\s+[a-z_]+)?(?:\s+NOWAIT|\s+SKIP\s+LOCKED)?$/i, '');
    
    // Handle INSERT INTO <table> ...
    const insertMatch = cleanSql.match(/INSERT INTO ([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1].toLowerCase();
      const cols = insertMatch[2].split(',').map(c => c.trim().toLowerCase());
      const row: any = { id: crypto.randomUUID(), created_at: new Date().toISOString() };
      
      cols.forEach((col, idx) => {
        row[col] = params[idx] !== undefined ? params[idx] : null;
      });

      // Emulate DB-level UNIQUE constraint on phone_number for users
      if (table === 'users' && row.phone_number) {
        const existing = this.getTable('users').some(r => r.phone_number === row.phone_number);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "users_phone_number_key"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'users_phone_number_key';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on national_code for users
      if (table === 'users' && row.national_code) {
        const existing = this.getTable('users').some(r => r.national_code === row.national_code);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "users_national_code_key"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'users_national_code_key';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on authority for payment_transactions
      if (table === 'payment_transactions' && row.authority) {
        const existing = this.getTable('payment_transactions').some(r => r.authority === row.authority);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_payment_transactions_authority"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_payment_transactions_authority';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on qr_nonce for checkins
      if (table === 'checkins' && row.qr_nonce) {
        const existing = this.getTable('checkins').some(r => r.qr_nonce === row.qr_nonce);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_checkins_qr_nonce"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_checkins_qr_nonce';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on reference_id for checkin debit on credit_ledger
      if (table === 'credit_ledger' && row.entry_type === 'CHECKIN_DEBIT' && row.reference_id) {
        const existing = this.getTable('credit_ledger').some(r => r.entry_type === 'CHECKIN_DEBIT' && r.reference_id === row.reference_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_credit_ledger_checkin_debit"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_credit_ledger_checkin_debit';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on reference_id for plan purchase on credit_ledger
      if (table === 'credit_ledger' && row.entry_type === 'PLAN_PURCHASE' && row.reference_id) {
        const existing = this.getTable('credit_ledger').some(r => r.entry_type === 'PLAN_PURCHASE' && r.reference_id === row.reference_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_credit_ledger_plan_purchase"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_credit_ledger_plan_purchase';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on reference_id for topup purchase on credit_ledger
      if (table === 'credit_ledger' && row.entry_type === 'TOPUP_PURCHASE' && row.reference_id) {
        const existing = this.getTable('credit_ledger').some(r => r.entry_type === 'TOPUP_PURCHASE' && r.reference_id === row.reference_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_credit_ledger_topup_purchase"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_credit_ledger_topup_purchase';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on reference_id for expiration excess on credit_ledger
      if (table === 'credit_ledger' && row.entry_type === 'CREDIT_EXPIRATION_EXCESS' && row.reference_id) {
        const existing = this.getTable('credit_ledger').some(r => r.entry_type === 'CREDIT_EXPIRATION_EXCESS' && r.reference_id === row.reference_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_credit_ledger_expiration_excess"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_credit_ledger_expiration_excess';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on reference_id for refund debit on credit_ledger
      if (table === 'credit_ledger' && row.entry_type === 'REFUND_DEBIT' && row.reference_id) {
        const existing = this.getTable('credit_ledger').some(r => r.entry_type === 'REFUND_DEBIT' && r.reference_id === row.reference_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_credit_ledger_refund_debit"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_credit_ledger_refund_debit';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on checkin_id for checkin earning on gym_payable_ledger
      if (table === 'gym_payable_ledger' && row.entry_type === 'CHECKIN_EARNING' && row.checkin_id) {
        const existing = this.getTable('gym_payable_ledger').some(r => r.entry_type === 'CHECKIN_EARNING' && r.checkin_id === row.checkin_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_gym_payable_checkin_earning"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_gym_payable_checkin_earning';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on settlement_id for payout disbursement on gym_payable_ledger
      if (table === 'gym_payable_ledger' && row.entry_type === 'DISBURSEMENT_PAYA' && row.settlement_id) {
        const existing = this.getTable('gym_payable_ledger').some(r => r.entry_type === 'DISBURSEMENT_PAYA' && r.settlement_id === row.settlement_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_gym_payable_settlement_disbursement"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_gym_payable_settlement_disbursement';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on (gym_id, cycle_start, cycle_end) for settlement_batches
      if (table === 'settlement_batches' && row.gym_id && row.cycle_start && row.cycle_end) {
        const existing = this.getTable('settlement_batches').some(r =>
          r.gym_id === row.gym_id &&
          r.cycle_start === row.cycle_start &&
          r.cycle_end === row.cycle_end &&
          r.status !== 'REJECTED'
        );
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_settlement_batches_gym_cycle"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_settlement_batches_gym_cycle';
          throw err;
        }
      }

      // Emulate DB-level CHECK constraint on gym_payable_ledger (balance_after >= 0)
      if (table === 'gym_payable_ledger' && row.balance_after !== undefined && Number(row.balance_after) < 0) {
        const err = new Error('new row for relation "gym_payable_ledger" violates check constraint "chk_gym_payable_balance_after"') as Error & { code?: string; constraint?: string };
        err.code = '23514';
        err.constraint = 'chk_gym_payable_balance_after';
        throw err;
      }

      // Emulate DB-level UNIQUE constraint on user_id for coaches
      if (table === 'coaches' && row.user_id) {
        const existing = this.getTable('coaches').some(r => r.user_id === row.user_id);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "coaches_user_id_key"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'coaches_user_id_key';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on slug for class_categories
      if (table === 'class_categories' && row.slug) {
        const existing = this.getTable('class_categories').some(r => r.slug === row.slug);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "class_categories_slug_key"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'class_categories_slug_key';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on (class_id, session_date, start_time) for class_sessions
      if (table === 'class_sessions' && row.class_id && row.session_date && row.start_time) {
        const existing = this.getTable('class_sessions').some(r =>
          r.class_id === row.class_id &&
          r.session_date === row.session_date &&
          r.start_time === row.start_time &&
          r.status !== 'CANCELLED'
        );
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_class_sessions_slot"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_class_sessions_slot';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on booking_code for class_bookings
      if (table === 'class_bookings' && row.booking_code) {
        const existing = this.getTable('class_bookings').some(r => r.booking_code === row.booking_code);
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_class_bookings_code"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_class_bookings_code';
          throw err;
        }
      }

      // Emulate DB-level UNIQUE constraint on (user_id, session_id) for active class_bookings
      if (table === 'class_bookings' && row.user_id && row.session_id) {
        const existing = this.getTable('class_bookings').some(r =>
          r.user_id === row.user_id &&
          r.session_id === row.session_id &&
          r.status !== 'CANCELLED' &&
          r.status !== 'REFUNDED'
        );
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_user_session_active_booking"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_user_session_active_booking';
          throw err;
        }
      }

      // Emulate DB-level CHECK constraint on coach_payable_ledger (balance_after >= 0)
      if (table === 'coach_payable_ledger' && row.balance_after !== undefined && Number(row.balance_after) < 0) {
        const err = new Error('new row for relation "coach_payable_ledger" violates check constraint "chk_coach_payable_balance_after"') as Error & { code?: string; constraint?: string };
        err.code = '23514';
        err.constraint = 'chk_coach_payable_balance_after';
        throw err;
      }

      // Emulate DB-level CHECK constraint on coach_plan_usage_ledger (remaining_after >= 0)
      if (table === 'coach_plan_usage_ledger' && row.remaining_after !== undefined && Number(row.remaining_after) < 0) {
        const err = new Error('new row for relation "coach_plan_usage_ledger" violates check constraint "chk_coach_plan_usage_remaining"') as Error & { code?: string; constraint?: string };
        err.code = '23514';
        err.constraint = 'chk_coach_plan_usage_remaining';
        throw err;
      }

      // Emulate DB-level UNIQUE constraint on (coach_id, cycle_start, cycle_end) for coach_settlement_batches
      if (table === 'coach_settlement_batches' && row.coach_id && row.cycle_start && row.cycle_end) {
        const existing = this.getTable('coach_settlement_batches').some(r =>
          r.coach_id === row.coach_id &&
          r.cycle_start === row.cycle_start &&
          r.cycle_end === row.cycle_end &&
          r.status !== 'REJECTED'
        );
        if (existing) {
          const err = new Error('duplicate key value violates unique constraint "uq_coach_settlement_cycle"') as Error & { code?: string; constraint?: string };
          err.code = '23505';
          err.constraint = 'uq_coach_settlement_cycle';
          throw err;
        }
      }

      this.getTable(table).push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    // Handle DELETE FROM <table> WHERE ...
    const deleteMatch = cleanSql.match(/DELETE FROM ([a-z_]+)(?:\s+WHERE\s+(.+?))?$/i);
    if (deleteMatch) {
      const table = deleteMatch[1].toLowerCase();
      const whereClause = deleteMatch[2];
      const records = this.getTable(table);
      if (!whereClause) {
        const count = records.length;
        this.memoryTables.set(table, []);
        return { rows: [] as T[], rowCount: count };
      }

      const initialCount = records.length;
      const remaining = records.filter(row => {
        const parts = whereClause.split(/\s+AND\s+/i);
        const matches = parts.every(part => this.evalWherePart(row, part, params));
        return !matches;
      });

      this.memoryTables.set(table, remaining);
      return { rows: [] as T[], rowCount: initialCount - remaining.length };
    }

    // Handle UPDATE <table> SET col1 = $1... WHERE col2 = $2...
    const updateMatch = cleanSql.match(/UPDATE ([a-z_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+?)$/i);
    if (updateMatch) {
      const table = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const records = this.getTable(table);
      
      let updatedCount = 0;
      records.forEach(row => {
        const parts = whereClause.split(/\s+AND\s+/i);
        const matches = parts.every(part => {
          const eqMatch = part.match(/([a-z_]+)\s*=\s*\$(\d+)/i);
          if (eqMatch) {
            const col = eqMatch[1].toLowerCase();
            const paramIdx = parseInt(eqMatch[2], 10) - 1;
            return row[col] === params[paramIdx];
          }
          const neqMatch = part.match(/([a-z_]+)\s*!=\s*\$(\d+)/i);
          if (neqMatch) {
            const col = neqMatch[1].toLowerCase();
            const paramIdx = parseInt(neqMatch[2], 10) - 1;
            return row[col] !== params[paramIdx];
          }
          return true;
        });

        if (matches) {
          const setAssignments = setClause.split(/,(?![^(]*\))/);
          setAssignments.forEach(assign => {
            const m = assign.trim().match(/([a-z_]+)\s*=\s*(.+)/i);
            if (m) {
              const col = m[1].toLowerCase();
              const valExpr = m[2].trim();
              if (valExpr.toUpperCase() === 'NOW()') {
                row[col] = new Date().toISOString();
              } else {
                const paramMatch = valExpr.match(/^\$(\d+)$/);
                if (paramMatch) {
                  const paramIdx = parseInt(paramMatch[1], 10) - 1;
                  row[col] = params[paramIdx];
                }
              }
            }
          });
          updatedCount++;
        }
      });

      return { rows: [] as T[], rowCount: updatedCount };
    }

    // Handle 2-table JOIN queries: SELECT ... FROM <table> [alias] JOIN <table2> [alias] ON <col1> = <col2> ...
    const joinMatch = cleanSql.match(/SELECT\s+(.+?)\s+FROM\s+([a-z_]+)(?:\s+[a-z_]+)?\s+JOIN\s+([a-z_]+)(?:\s+[a-z_]+)?\s+ON\s+([a-z_.]+)\s*=\s*([a-z_.]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
    if (joinMatch) {
      const t1 = joinMatch[2].toLowerCase();
      const t2 = joinMatch[3].toLowerCase();
      const col1 = joinMatch[4].split('.').pop()!.toLowerCase();
      const col2 = joinMatch[5].split('.').pop()!.toLowerCase();
      const records1 = this.getTable(t1);
      const records2 = this.getTable(t2);

      let joinedRecords: any[] = [];
      for (const r1 of records1) {
        for (const r2 of records2) {
          if (r1[col1] === r2[col2]) {
            joinedRecords.push({
              ...r2,
              ...r1,
              plan_title: r2.title_fa || r1.title_fa,
              gym_name: r2.name_fa || r1.name_fa,
              gym_tier: r2.tier || r1.tier,
            });
          }
        }
      }

      const whereClause = joinMatch[6];
      if (whereClause) {
        joinedRecords = joinedRecords.filter(row => {
          const parts = whereClause.split(/\s+AND\s+/i);
          return parts.every(part => this.evalWherePart(row, part, params));
        });
      }

      const projection = joinMatch[1].trim();
      const countMatch = projection.match(/^COUNT\(\*\)(?:\s+as\s+([a-z0-9_]+))?$/i);
      if (countMatch) {
        const alias = countMatch[1] || 'count';
        return { rows: [{ [alias]: joinedRecords.length }] as any, rowCount: 1 };
      }
      const sumMatch = projection.match(/^(?:COALESCE\()?SUM\(([a-z0-9_.]+)\)(?:,\s*0\))?(?:\s+as\s+([a-z0-9_]+))?$/i);
      if (sumMatch) {
        const col = sumMatch[1].split('.').pop()!.toLowerCase();
        const alias = sumMatch[2] || 'sum';
        const total = joinedRecords.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
        return { rows: [{ [alias]: total }] as any, rowCount: 1 };
      }

      const orderByClause = joinMatch[7];
      if (orderByClause) {
        const orderParts = orderByClause.split(',').map(s => s.trim());
        joinedRecords.sort((a, b) => {
          for (const part of orderParts) {
            const [rawCol, rawDir] = part.split(/\s+/);
            const col = rawCol.split('.').pop()!.toLowerCase();
            const dir = (rawDir || 'ASC').toUpperCase();
            const valA = a[col];
            const valB = b[col];
            if (valA === valB) continue;
            if (valA === undefined || valA === null) return dir === 'ASC' ? 1 : -1;
            if (valB === undefined || valB === null) return dir === 'ASC' ? -1 : 1;

            let cmp = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
              cmp = valA - valB;
            } else if (!isNaN(Date.parse(valA)) && !isNaN(Date.parse(valB)) && typeof valA === 'string' && (valA.includes('-') || valA.includes(':'))) {
              cmp = new Date(valA).getTime() - new Date(valB).getTime();
            } else {
              cmp = String(valA).localeCompare(String(valB));
            }
            if (cmp !== 0) {
              return dir === 'DESC' ? -cmp : cmp;
            }
          }
          return 0;
        });
      }

      const limitVal = joinMatch[8];
      if (limitVal) {
        joinedRecords = joinedRecords.slice(0, parseInt(limitVal, 10));
      }

      return { rows: joinedRecords as T[], rowCount: joinedRecords.length };
    }

    // Handle single table SELECT FROM <table> ...
    const selectMatch = cleanSql.match(/SELECT\s+(.+?)\s+FROM\s+([a-z_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
    if (selectMatch) {
      const projection = selectMatch[1].trim();
      const table = selectMatch[2].toLowerCase();
      let records = [...this.getTable(table)];

      // WHERE filter supporting $params, booleans, dates, and comparison operators
      const whereClause = selectMatch[3];
      if (whereClause) {
        records = records.filter(row => {
          const parts = whereClause.split(/\s+AND\s+/i);
          return parts.every(part => this.evalWherePart(row, part, params));
        });
      }

      // Projections: COUNT(*) or SUM(...)
      const countMatch = projection.match(/^COUNT\(\*\)(?:\s+as\s+([a-z0-9_]+))?$/i);
      if (countMatch) {
        const alias = countMatch[1] || 'count';
        return { rows: [{ [alias]: records.length }] as any, rowCount: 1 };
      }
      const sumMatch = projection.match(/^(?:COALESCE\()?SUM\(([a-z0-9_.]+)\)(?:,\s*0\))?(?:\s+as\s+([a-z0-9_]+))?$/i);
      if (sumMatch) {
        const col = sumMatch[1].split('.').pop()!.toLowerCase();
        const alias = sumMatch[2] || 'sum';
        const total = records.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
        return { rows: [{ [alias]: total }] as any, rowCount: 1 };
      }

      // ORDER BY sorting supporting multi-column ASC/DESC
      const orderByClause = selectMatch[4];
      if (orderByClause) {
        const orderParts = orderByClause.split(',').map(s => s.trim());
        records.sort((a, b) => {
          for (const part of orderParts) {
            const [rawCol, rawDir] = part.split(/\s+/);
            const col = rawCol.split('.').pop()!.toLowerCase();
            const dir = (rawDir || 'ASC').toUpperCase();
            const valA = a[col];
            const valB = b[col];
            if (valA === valB) continue;
            if (valA === undefined || valA === null) return dir === 'ASC' ? 1 : -1;
            if (valB === undefined || valB === null) return dir === 'ASC' ? -1 : 1;

            let cmp = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
              cmp = valA - valB;
            } else if (!isNaN(Date.parse(valA)) && !isNaN(Date.parse(valB)) && typeof valA === 'string' && (valA.includes('-') || valA.includes(':'))) {
              cmp = new Date(valA).getTime() - new Date(valB).getTime();
            } else {
              cmp = String(valA).localeCompare(String(valB));
            }
            if (cmp !== 0) {
              return dir === 'DESC' ? -cmp : cmp;
            }
          }
          return 0;
        });
      }

      // LIMIT
      const limitVal = selectMatch[5];
      if (limitVal) {
        records = records.slice(0, parseInt(limitVal, 10));
      }

      return { rows: records as T[], rowCount: records.length };
    }

    // Generic fallback for custom queries
    return { rows: [], rowCount: 0 };
  }

  private evalWherePart(row: any, part: string, params: any[]): boolean {
    const trimmed = part.trim();
    if (!trimmed) return true;

    const opMatch = trimmed.match(/([a-z_.]+)\s*(>=|<=|!=|=|>|<)\s*(.+)/i);
    if (!opMatch) return true;

    const col = opMatch[1].split('.').pop()!.toLowerCase();
    const op = opMatch[2];
    const rawVal = opMatch[3].trim();

    let targetVal: any;
    if (rawVal.startsWith('$')) {
      const idx = parseInt(rawVal.slice(1), 10) - 1;
      targetVal = params[idx];
    } else if (rawVal.toLowerCase() === 'true') {
      targetVal = true;
    } else if (rawVal.toLowerCase() === 'false') {
      targetVal = false;
    } else if (rawVal.toUpperCase() === 'NOW()') {
      targetVal = new Date().toISOString();
    } else if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
      targetVal = rawVal.slice(1, -1);
    } else if (!isNaN(Number(rawVal))) {
      targetVal = Number(rawVal);
    } else {
      targetVal = rawVal;
    }

    const rowVal = row[col];
    if (rowVal === undefined || rowVal === null) {
      if (op === '!=') return targetVal !== null && targetVal !== undefined;
      return false;
    }

    // Date comparison: only for actual ISO date (YYYY-MM-DD...) or time (HH:MM...) strings
    const isDatePattern = /^\d{4}-\d{2}-\d{2}/;
    const isTimePattern = /^\d{2}:\d{2}/;
    if (
      typeof rowVal === 'string' &&
      typeof targetVal === 'string' &&
      (isDatePattern.test(rowVal) || isTimePattern.test(rowVal)) &&
      (isDatePattern.test(targetVal) || isTimePattern.test(targetVal)) &&
      !isNaN(Date.parse(rowVal)) &&
      !isNaN(Date.parse(targetVal))
    ) {
      const timeRow = new Date(rowVal).getTime();
      const timeTarget = new Date(targetVal).getTime();
      switch (op) {
        case '=': return timeRow === timeTarget;
        case '!=': return timeRow !== timeTarget;
        case '>=': return timeRow >= timeTarget;
        case '<=': return timeRow <= timeTarget;
        case '>': return timeRow > timeTarget;
        case '<': return timeRow < timeTarget;
      }
    }

    // Number comparison
    if (typeof rowVal === 'number' || typeof targetVal === 'number') {
      const numRow = Number(rowVal);
      const numTarget = Number(targetVal);
      switch (op) {
        case '=': return numRow === numTarget;
        case '!=': return numRow !== numTarget;
        case '>=': return numRow >= numTarget;
        case '<=': return numRow <= numTarget;
        case '>': return numRow > numTarget;
        case '<': return numRow < numTarget;
      }
    }

    // Standard string / boolean comparison
    switch (op) {
      case '=': return rowVal === targetVal;
      case '!=': return rowVal !== targetVal;
      case '>=': return rowVal >= targetVal;
      case '<=': return rowVal <= targetVal;
      case '>': return rowVal > targetVal;
      case '<': return rowVal < targetVal;
      default: return true;
    }
  }
}
