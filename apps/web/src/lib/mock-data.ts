// apps/web/src/lib/mock-data.ts
// Deterministic fallback dataset for static hosting (GitHub Pages)

export const MOCK_GYMS: any[] = [
  {
    id: 'gym-elite-4',
    nameFa: 'کلاب ورزشی هتل اسپیناس پالاس',
    tier: 'ELITE',
    accessMode: 'MIXED',
    city: 'تهران',
    district: 'سعادت آباد',
    addressFa: 'بیدستان یکم، هتل اسپیناس پالاس، طبقه -۲',
    latitude: 35.795,
    longitude: 51.365,
    geofenceRadiusMeters: 250,
    isActive: true,
    currentCreditCost: 14,
    facilities: ['استخر اختصاصی', 'سونا و جکوزی', 'مربی اختصاصی', 'پارکینگ VIP', 'بوفه سلامت'],
    sans: [
      { id: 'sans-1', dayOfWeek: 0, gender: 'FEMALE', startTime: '08:00', endTime: '14:00', capacity: 40, isPeak: false },
      { id: 'sans-2', dayOfWeek: 0, gender: 'MALE', startTime: '15:00', endTime: '23:00', capacity: 50, isPeak: true },
      { id: 'sans-3', dayOfWeek: 1, gender: 'FEMALE', startTime: '08:00', endTime: '14:00', capacity: 40, isPeak: false },
      { id: 'sans-4', dayOfWeek: 1, gender: 'MALE', startTime: '15:00', endTime: '23:00', capacity: 50, isPeak: true },
    ]
  },
  {
    id: 'gym-premium-3',
    nameFa: 'باشگاه اکسیژن رویال',
    tier: 'PREMIUM',
    accessMode: 'MIXED',
    city: 'تهران',
    district: 'سعادت آباد',
    addressFa: 'بلوار سرو غربی، خیابان صدف، مجتمع صدف',
    latitude: 35.789,
    longitude: 51.372,
    geofenceRadiusMeters: 150,
    isActive: true,
    currentCreditCost: 7,
    facilities: ['تجهیزات مدرن تکنوجیم', 'سونا خشک و بخار', 'کافه و بار پروتئین', 'رختکن اختصاصی'],
    sans: [
      { id: 'sans-5', dayOfWeek: 0, gender: 'FEMALE', startTime: '07:30', endTime: '13:30', capacity: 35, isPeak: false },
      { id: 'sans-6', dayOfWeek: 0, gender: 'MALE', startTime: '14:00', endTime: '22:30', capacity: 45, isPeak: true },
    ]
  },
  {
    id: 'gym-plus-2',
    nameFa: 'مجموعه ورزشی ستاره ونک',
    tier: 'PLUS',
    accessMode: 'MALE_ONLY',
    city: 'تهران',
    district: 'ونک',
    addressFa: 'میدان ونک، خیابان ملاصدرا، پلاک ۱۰',
    latitude: 35.758,
    longitude: 51.398,
    geofenceRadiusMeters: 150,
    isActive: true,
    currentCreditCost: 4,
    facilities: ['سالن وزنه‌برداری', 'دستگاه‌های هوازی', 'دوش و کمد اختصاصی'],
    sans: [
      { id: 'sans-7', dayOfWeek: 0, gender: 'MALE', startTime: '06:00', endTime: '23:00', capacity: 30, isPeak: false },
    ]
  },
  {
    id: 'gym-basic-1',
    nameFa: 'باشگاه بدنسازی کارو',
    tier: 'BASIC',
    accessMode: 'FEMALE_ONLY',
    city: 'تهران',
    district: 'نواب',
    addressFa: 'خیابان قزوین، خیابان عباسی، پلاک ۴۲',
    latitude: 35.672,
    longitude: 51.385,
    geofenceRadiusMeters: 200,
    isActive: true,
    currentCreditCost: 2,
    facilities: ['سالن فیتنس', 'تهویه مطبوع'],
    sans: [
      { id: 'sans-8', dayOfWeek: 0, gender: 'FEMALE', startTime: '08:00', endTime: '20:00', capacity: 25, isPeak: false },
    ]
  }
];

export const MOCK_PLANS: any[] = [
  {
    id: 'plan-1',
    slug: 'starter_15',
    titleFa: 'پلن برنزی - ۱۵ اعتبار',
    priceTomans: 550000,
    creditsAwarded: 15,
    validityDays: 30,
    rolloverPercentage: 0.10,
    maxRolloverCredits: 2,
    isActive: true,
    sortOrder: 1,
    descriptionFa: 'مناسب برای شروع تمرین و استفاده هفتگی ۱ تا ۲ جلسه در باشگاه‌های پایه و پلاس.'
  },
  {
    id: 'plan-2',
    slug: 'standard_30',
    titleFa: 'پلن نقره‌ای - ۳۰ اعتبار',
    priceTomans: 1000000,
    creditsAwarded: 30,
    validityDays: 30,
    rolloverPercentage: 0.10,
    maxRolloverCredits: 5,
    isActive: true,
    sortOrder: 2,
    isPopular: true,
    descriptionFa: 'محبوب‌ترین بسته برای ۳ تا ۴ جلسه تمرین در هفته با دسترسی به کلیه باشگاه‌های پریمیوم.'
  },
  {
    id: 'plan-3',
    slug: 'pro_60',
    titleFa: 'پلن طلایی - ۶۰ اعتبار',
    priceTomans: 1900000,
    creditsAwarded: 60,
    validityDays: 30,
    rolloverPercentage: 0.10,
    maxRolloverCredits: 10,
    isActive: true,
    sortOrder: 3,
    descriptionFa: 'حرفه‌ای‌ترین اشتراک با دسترسی نامحدود به کلوپ‌های الیت و جلسات اختصاصی مربیان بین‌المللی.'
  }
];

export const MOCK_CLASSES: any[] = [
  {
    id: 'class-1',
    title: 'تمرینات کراس‌فیت و آماده‌سازی جسمانی پیشرفته',
    coachId: 'coach-1',
    coachName: 'استاد بهزاد فیاض',
    coach: {
      id: 'coach-1',
      displayName: 'استاد بهزاد فیاض',
      sports: ['کراس‌فیت', 'فیتنس'],
      experienceYears: 8,
    },
    categorySlug: 'crossfit',
    categoryNameFa: 'کراس‌فیت',
    description: 'دوره فشرده افزایش توان هوازی، استقامت عضلانی و چربی‌سوزی با متد به‌روز بین‌المللی.',
    durationMinutes: 75,
    defaultCapacity: 12,
    difficulty: 'INTERMEDIATE',
    venueType: 'IN_PERSON',
    venueName: 'مجموعه ورزشی ستاره ونک',
    venue: {
      id: 'v-3',
      nameFa: 'مجموعه ورزشی ستاره ونک',
      district: 'ونک',
      addressFa: 'میدان ونک، خیابان ملاصدرا، پلاک ۱۰',
      venueType: 'IN_PERSON',
    },
    singleSessionPriceTomans: 180000,
    hasMonthlyPlan: true,
    monthlyPlanPriceTomans: 1200000,
    sessionsCount: 8,
    monthlyPlan: {
      id: 'mp-1',
      title: 'بسته طلایی ماهانه کراس‌فیت (۸ جلسه)',
      priceTomans: 1200000,
      sessionsCount: 8,
      validityDays: 30,
    },
  },
  {
    id: 'class-2',
    title: 'پیلاتس تخصصی و اصلاح وضعیت بدنی',
    coachId: 'coach-2',
    coachName: 'مریم سهرابی',
    coach: {
      id: 'coach-2',
      displayName: 'مریم سهرابی',
      sports: ['پیلاتس', 'یوگا'],
      experienceYears: 6,
    },
    categorySlug: 'pilates',
    categoryNameFa: 'پیلاتس',
    description: 'تقویت عضلات مرکزی، اصلاح پاسچر، افزایش انعطاف‌پذیری و کاهش دردهای کمری و مفصلی.',
    durationMinutes: 60,
    defaultCapacity: 15,
    difficulty: 'ALL_LEVELS',
    venueType: 'IN_PERSON',
    venueName: 'باشگاه اکسیژن رویال',
    venue: {
      id: 'v-2',
      nameFa: 'باشگاه اکسیژن رویال',
      district: 'سعادت‌آباد',
      addressFa: 'بلوار سرو غربی، خیابان صدف',
      venueType: 'IN_PERSON',
    },
    singleSessionPriceTomans: 150000,
    hasMonthlyPlan: true,
    monthlyPlanPriceTomans: 950000,
    sessionsCount: 12,
    monthlyPlan: {
      id: 'mp-2',
      title: 'بسته ماهانه پیلاتس (۱۲ جلسه)',
      priceTomans: 950000,
      sessionsCount: 12,
      validityDays: 30,
    },
  }
];

export const MOCK_CATEGORIES = [
  { id: 'cat-1', slug: 'fitness', nameFa: 'فیتنس و تناسب اندام' },
  { id: 'cat-2', slug: 'crossfit', nameFa: 'کراس‌فیت' },
  { id: 'cat-3', slug: 'pilates', nameFa: 'پیلاتس و حرکات اصلاحی' },
  { id: 'cat-4', slug: 'swimming', nameFa: 'شنا و ورزش‌های آبی' },
  { id: 'cat-5', slug: 'bodybuilding', nameFa: 'بدنسازی و پرورش اندام' },
];

export const MOCK_VENUES = [
  { id: 'v-1', nameFa: 'کلاب ورزشی هتل اسپیناس پالاس', district: 'سعادت‌آباد', venueType: 'GRAVITY_GYM' },
  { id: 'v-2', nameFa: 'باشگاه اکسیژن رویال', district: 'سعادت‌آباد', venueType: 'PARTNER_GYM' },
  { id: 'v-3', nameFa: 'مجموعه ورزشی ستاره ونک', district: 'ونک', venueType: 'PARTNER_GYM' },
];

export const MOCK_SESSIONS = [
  {
    id: 'sess-1',
    classId: 'class-1',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 86400000 + 75 * 60000).toISOString(),
    capacity: 12,
    reservedSeats: 4,
    availableSeats: 8,
    status: 'SCHEDULED',
    instructorName: 'استاد بهزاد فیاض',
  },
  {
    id: 'sess-2',
    classId: 'class-1',
    startTime: new Date(Date.now() + 86400000 * 3).toISOString(),
    endTime: new Date(Date.now() + 86400000 * 3 + 75 * 60000).toISOString(),
    capacity: 12,
    reservedSeats: 6,
    availableSeats: 6,
    status: 'SCHEDULED',
    instructorName: 'استاد بهزاد فیاض',
  },
];

export function getMockFallback(endpoint: string): any | null {
  const cleanEndpoint = endpoint.split('?')[0];

  // Specific exact routes first
  if (cleanEndpoint === '/classes/categories') return MOCK_CATEGORIES;
  if (cleanEndpoint === '/classes/venues') return MOCK_VENUES;
  if (cleanEndpoint === '/classes/member/my-plans') return [];

  // Parametric class routes
  if (cleanEndpoint.startsWith('/classes/') && cleanEndpoint.endsWith('/sessions')) {
    return MOCK_SESSIONS;
  }
  if (cleanEndpoint.startsWith('/classes/')) {
    const id = cleanEndpoint.replace('/classes/', '').split('/')[0];
    return MOCK_CLASSES.find(c => c.id === id) || MOCK_CLASSES[0];
  }
  if (cleanEndpoint === '/classes') return MOCK_CLASSES;

  // Gym routes
  if (cleanEndpoint.startsWith('/gyms/') && cleanEndpoint.endsWith('/sans')) {
    const id = cleanEndpoint.replace('/gyms/', '').split('/')[0];
    const found = MOCK_GYMS.find(g => g.id === id) || MOCK_GYMS[0];
    return found?.sans || [];
  }
  if (cleanEndpoint.startsWith('/gyms/')) {
    const id = cleanEndpoint.replace('/gyms/', '').split('/')[0];
    return MOCK_GYMS.find(g => g.id === id) || MOCK_GYMS[0];
  }
  if (cleanEndpoint === '/gyms') return MOCK_GYMS;

  // Plan routes
  if (cleanEndpoint === '/plans') return MOCK_PLANS;

  // Economics & Admin
  if (cleanEndpoint === '/economics/rules') {
    return {
      globalMaxPayoutPerCreditRatio: 32000,
      variableCostPerCheckinTomans: 500,
      defaultRolloverPercentage: 0.10,
      defaultMaxRolloverCredits: 5,
    };
  }
  if (cleanEndpoint === '/admin/dashboard-metrics') {
    return {
      totalUsers: 14,
      activeSubscriptions: 8,
      totalRevenueTomans: 12500000,
      totalGymPayablesTomans: 4800000,
      settledBatchesCount: 6,
      networkMarginRate: 0.38,
    };
  }
  if (cleanEndpoint === '/admin/gyms') return MOCK_GYMS;
  if (cleanEndpoint === '/admin/classes') return MOCK_CLASSES;
  if (cleanEndpoint === '/admin/coaches') {
    return [
      { id: 'coach-1', displayName: 'استاد بهزاد فیاض', verificationStatus: 'VERIFIED', isActive: true, sports: ['کراس‌فیت', 'فیتنس'] }
    ];
  }
  if (cleanEndpoint === '/admin/staff') {
    return [
      { id: 'staff-1', firstName: 'رضا', lastName: 'محمدی', assignedGymId: 'gym-elite-4', phone: '09120000002', role: 'GYM_STAFF' }
    ];
  }
  if (cleanEndpoint === '/admin/recent-checkins') return [];
  if (cleanEndpoint === '/auth/otp/send') return { success: true, debugCode: '12345' };
  if (cleanEndpoint === '/auth/otp/verify') {
    return {
      accessToken: 'mock_jwt_token',
      user: {
        id: 'user-admin',
        firstName: 'مدیر',
        lastName: 'سیستم',
        role: 'SUPER_ADMIN',
        phoneNumber: '09120000001',
      },
    };
  }
  if (cleanEndpoint === '/users/me') {
    return {
      id: 'user-admin',
      firstName: 'مدیر',
      lastName: 'سیستم',
      role: 'SUPER_ADMIN',
      phoneNumber: '09120000001',
      currentCredits: 30,
    };
  }
  if (cleanEndpoint === '/wallet/summary') {
    return { balance: 30, totalEarned: 30, totalSpent: 0, transactions: [] };
  }

  return null;
}
