// scripts/audit-idor-security.mjs
// Comprehensive IDOR, API Security & Data Safety Verification Audit

import Redis from 'ioredis';

const API_BASE = 'http://localhost:4000/api/v1';

const tokenCache = new Map();

async function resetTestRateLimits() {
  try {
    const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      retryStrategy: () => null,
    });
    r.on('error', () => {});
    await r.del(
      'otp_rate_hour:09120000001',
      'otp_rate_hour:09120000002',
      'otp_rate_hour:09120000003',
      'otp_rate_hour:09120000004',
      'otp_rate_hour:09120000005',
      'otp_rate_hour:09120000010',
      'otp_rate_hour:09120000020',
      'otp_cooldown:09120000001',
      'otp_cooldown:09120000002',
      'otp_cooldown:09120000003',
      'otp_cooldown:09120000004',
      'otp_cooldown:09120000005',
      'otp_cooldown:09120000010',
      'otp_cooldown:09120000020'
    );
    await r.quit();
  } catch {}
}

async function loginUser(phoneNumber) {
  if (tokenCache.has(phoneNumber)) {
    return tokenCache.get(phoneNumber);
  }

  const sendRes = await fetch(`${API_BASE}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  }).then(r => r.json());

  const debugCode = sendRes.debugCode || '12345';

  const verifyRes = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code: debugCode }),
  }).then(r => r.json());

  const token = verifyRes.accessToken || verifyRes.token;
  if (!token) {
    throw new Error(`Failed to obtain JWT token for ${phoneNumber}: ${JSON.stringify(verifyRes)}`);
  }

  const session = { token, user: verifyRes.user };
  tokenCache.set(phoneNumber, session);
  return session;
}

async function request(endpoint, token = null, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('====================================================');
  console.log('FINAL AUDIT 3 & 4: IDOR, API SECURITY & DATA SAFETY');
  console.log('====================================================\n');

  const results = [];

  function record(category, testName, expected, actual, passed, details = '') {
    results.push({ category, testName, expected, actual, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [${category}] ${testName} | Exp: ${expected} | Got: ${actual} ${details ? `(${details})` : ''}`);
  }

  // Reset test rate limits in local test environment
  await resetTestRateLimits();

  // Authenticate relevant personas
  const member = await loginUser('09120000003');
  const staff = await loginUser('09120000002');
  const admin = await loginUser('09120000005');
  const superAdmin = await loginUser('09120000001');

  const dummyGymPayload = {
    nameFa: 'باشگاه نفوذگر غیرمجاز',
    tier: 'BASIC',
    city: 'تهران',
    district: 'مرکز',
    addressFa: 'خیابان انقلاب',
    latitude: 35.7,
    longitude: 51.4,
    shebaNumber: 'IR770120000000000000000077',
    bankAccountHolder: 'حمله کننده',
  };

  // ---------------------------------------------------------------------------
  // AUDIT 3 — IDOR / API SECURITY TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 3.1: Unauthenticated Gym CRUD Operations (Must be 401) ---');
  {
    const res = await request('/admin/gyms', null, 'POST', dummyGymPayload);
    record('SECURITY', 'Unauthenticated POST /admin/gyms (Create)', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1', null, 'PUT', { nameFa: 'دستکاری غیرمجاز' });
    record('SECURITY', 'Unauthenticated PUT /admin/gyms/:id (Edit)', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1/status', null, 'PATCH', { isActive: false });
    record('SECURITY', 'Unauthenticated PATCH /admin/gyms/:id/status (Deactivate)', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1', null, 'DELETE');
    record('SECURITY', 'Unauthenticated DELETE /admin/gyms/:id (Remove)', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/admin/gyms', null, 'GET');
    record('SECURITY', 'Unauthenticated GET /admin/gyms (List)', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1', null, 'GET');
    record('SECURITY', 'Unauthenticated GET /admin/gyms/:id (Detail)', 401, res.status, res.status === 401);
  }

  console.log('\n--- AUDIT 3.2: USER Role Gym CRUD Attempts (Must be 403 Forbidden) ---');
  {
    const res = await request('/admin/gyms', member.token, 'POST', dummyGymPayload);
    record('SECURITY', 'USER POST /admin/gyms (Create)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1', member.token, 'PUT', { nameFa: 'هک کاربر عادی' });
    record('SECURITY', 'USER PUT /admin/gyms/:id (Edit)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1/status', member.token, 'PATCH', { isActive: false });
    record('SECURITY', 'USER PATCH /admin/gyms/:id/status (Deactivate)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1', member.token, 'DELETE');
    record('SECURITY', 'USER DELETE /admin/gyms/:id (Remove)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms', member.token, 'GET');
    record('SECURITY', 'USER GET /admin/gyms (List)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-basic-1', member.token, 'GET');
    record('SECURITY', 'USER GET /admin/gyms/:id (Detail)', 403, res.status, res.status === 403);
  }

  console.log('\n--- AUDIT 3.3: GYM_STAFF Role Arbitrary Gym CRUD Attempts (Must be 403 Forbidden) ---');
  {
    const res = await request('/admin/gyms', staff.token, 'POST', dummyGymPayload);
    record('SECURITY', 'GYM_STAFF POST /admin/gyms (Create)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-plus-2', staff.token, 'PUT', { nameFa: 'تغییر نام توسط متصدی' });
    record('SECURITY', 'GYM_STAFF PUT /admin/gyms/:id (Edit)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-plus-2/status', staff.token, 'PATCH', { isActive: false });
    record('SECURITY', 'GYM_STAFF PATCH /admin/gyms/:id/status (Deactivate)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-plus-2', staff.token, 'DELETE');
    record('SECURITY', 'GYM_STAFF DELETE /admin/gyms/:id (Remove)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms', staff.token, 'GET');
    record('SECURITY', 'GYM_STAFF GET /admin/gyms (List)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms/gym-plus-2', staff.token, 'GET');
    record('SECURITY', 'GYM_STAFF GET /admin/gyms/:id (Detail)', 403, res.status, res.status === 403);
  }

  console.log('\n--- AUDIT 3.4: IDOR & Boundary Checks (Non-existent / Invalid Gym IDs) ---');
  {
    const res = await request('/admin/gyms/non-existent-gym-id', superAdmin.token, 'GET');
    record('IDOR', 'SUPER_ADMIN GET /admin/gyms/non-existent-gym-id (404 Not Found)', 404, res.status, res.status === 404);
  }
  {
    const res = await request('/admin/gyms/non-existent-gym-id', superAdmin.token, 'PUT', { nameFa: 'تست' });
    record('IDOR', 'SUPER_ADMIN PUT /admin/gyms/non-existent-gym-id (404 Not Found)', 404, res.status, res.status === 404);
  }
  {
    const res = await request('/admin/gyms/non-existent-gym-id/status', superAdmin.token, 'PATCH', { isActive: false });
    record('IDOR', 'SUPER_ADMIN PATCH /admin/gyms/non-existent-gym-id/status (404 Not Found)', 404, res.status, res.status === 404);
  }
  {
    const res = await request('/admin/gyms/non-existent-gym-id', superAdmin.token, 'DELETE');
    record('IDOR', 'SUPER_ADMIN DELETE /admin/gyms/non-existent-gym-id (404 Not Found)', 404, res.status, res.status === 404);
  }

  // ---------------------------------------------------------------------------
  // AUDIT 4 — DATA SAFETY & FINANCIAL INVARIANT PRESERVATION
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 4: Data Safety & Historical Ledger Invariant ---');

  // Verify gym-elite-4 has staff, sans schedule and operational dossier
  const detailEspinas = await request('/admin/gyms/gym-elite-4', superAdmin.token, 'GET');
  record('DATA_SAFETY', 'gym-elite-4 operational dossier retrievable', 200, detailEspinas.status, detailEspinas.status === 200);
  record('DATA_SAFETY', 'gym-elite-4 assigned staff preserved', true, detailEspinas.data?.assignedStaff?.length > 0, detailEspinas.data?.assignedStaff?.length > 0, `Staff count: ${detailEspinas.data?.assignedStaff?.length}`);
  record('DATA_SAFETY', 'gym-elite-4 weekly sans schedule preserved', true, detailEspinas.data?.sans?.length > 0, detailEspinas.data?.sans?.length > 0, `Sans count: ${detailEspinas.data?.sans?.length}`);

  // Test Attempting to Delete a Gym with Financial History -> MUST ARCHIVE, NOT PURGE
  const removeEspinasRes = await request('/admin/gyms/gym-elite-4', superAdmin.token, 'DELETE');
  record('DATA_SAFETY', 'DELETE gym with financial records returns ARCHIVED action', 'ARCHIVED', removeEspinasRes.data?.action, removeEspinasRes.data?.action === 'ARCHIVED');
  record('DATA_SAFETY', 'DELETE response explains financial audit protection', true, removeEspinasRes.data?.message?.includes('بایگانی شد'), removeEspinasRes.data?.message?.includes('بایگانی شد'));

  // Verify historical records remain fully intact after archive
  const espinasAfterArchive = await request('/admin/gyms/gym-elite-4', superAdmin.token, 'GET');
  record('DATA_SAFETY', 'Archived gym records remain queryable in admin detail', 200, espinasAfterArchive.status, espinasAfterArchive.status === 200);
  record('DATA_SAFETY', 'Archived gym status is inactive (isActive = false)', false, espinasAfterArchive.data?.gym?.isActive, espinasAfterArchive.data?.gym?.isActive === false);

  // Reactivate gym to restore operational status
  const reactivateEspinas = await request('/admin/gyms/gym-elite-4/status', superAdmin.token, 'PATCH', { isActive: true });
  record('DATA_SAFETY', 'Reactivating gym restores isActive to true', true, reactivateEspinas.data?.isActive, reactivateEspinas.data?.isActive === true);

  // Clean Deletion on Zero-Reference Gym
  console.log('\n--- AUDIT 4.2: Clean Cascade Deletion on Zero-Reference Gym ---');
  const tempRunId = Math.floor(1000 + Math.random() * 9000);
  const tempSheba = `IR99012${String(tempRunId).padStart(4, '0')}0000000000000099`.slice(0, 26);
  const createTempGymRes = await request('/admin/gyms', superAdmin.token, 'POST', {
    nameFa: `باشگاه آزمایشی پاکسازی ${tempRunId}`,
    tier: 'BASIC',
    city: 'یزد',
    district: 'صفائیه',
    addressFa: 'خیابان تیمسار فلاحی',
    latitude: 31.85,
    longitude: 54.35,
    shebaNumber: tempSheba,
    bankAccountHolder: 'حساب آزمایشی',
  });
  const tempGymId = createTempGymRes.data?.id;
  record('DATA_SAFETY', 'Create temporary zero-reference gym', 201, createTempGymRes.status, createTempGymRes.status === 201);

  if (tempGymId) {
    // Add sans
    await request(`/admin/gyms/${tempGymId}/sans`, superAdmin.token, 'POST', {
      dayOfWeek: 1,
      gender: 'MALE',
      startTime: '09:00',
      endTime: '11:00',
      capacity: 20,
      isPeak: false,
    });

    // Delete zero-reference gym -> Must be DELETED
    const deleteTempRes = await request(`/admin/gyms/${tempGymId}`, superAdmin.token, 'DELETE');
    record('DATA_SAFETY', 'DELETE zero-reference gym returns DELETED action', 'DELETED', deleteTempRes.data?.action, deleteTempRes.data?.action === 'DELETED');

    // Verify completely deleted (404)
    const getDeleted = await request(`/admin/gyms/${tempGymId}`, superAdmin.token, 'GET');
    record('DATA_SAFETY', 'Deleted gym is completely purged from database (404 Not Found)', 404, getDeleted.status, getDeleted.status === 404);
  }

  // Check general platform invariants: Memberships, Credits, Economics
  console.log('\n--- AUDIT 4.3: Platform-Wide Data Invariants ---');
  const metricsRes = await request('/admin/dashboard-metrics', superAdmin.token, 'GET');
  record('DATA_SAFETY', 'Platform memberships and user counts intact', true, metricsRes.data?.overview?.totalUsers > 0, metricsRes.data?.overview?.totalUsers > 0, `Users: ${metricsRes.data?.overview?.totalUsers}`);
  record('DATA_SAFETY', 'Economic total revenue and payables defined', true, metricsRes.data?.economics?.totalRevenueTomans !== undefined, metricsRes.data?.economics?.totalRevenueTomans !== undefined, `Revenue: ${metricsRes.data?.economics?.totalRevenueTomans}`);

  const checkinsRes = await request('/admin/recent-checkins', superAdmin.token, 'GET');
  record('DATA_SAFETY', 'Recent check-in records intact', true, Array.isArray(checkinsRes.data), Array.isArray(checkinsRes.data), `Checkins: ${checkinsRes.data?.length}`);

  const settlementsRes = await request('/coaches/admin/settlements', superAdmin.token, 'GET');
  record('DATA_SAFETY', 'Coach settlement batches intact', true, Array.isArray(settlementsRes.data), Array.isArray(settlementsRes.data), `Batches: ${settlementsRes.data?.length}`);

  // ---------------------------------------------------------------------------
  // AUDIT 5 — COACH ISOLATION & OBJECT-LEVEL ATTENDANCE / BOOKING IDOR
  // ---------------------------------------------------------------------------
  console.log('\n--- AUDIT 5: Coach Isolation, Attendance & Booking IDOR ---');
  const coach1 = await loginUser('09120000010'); // Arash (owns class-1, session-1)
  const coach2 = await loginUser('09120000020'); // Mona (owns class-3)
  const member2 = await loginUser('09120000004'); // Another regular member

  // 5.1 Coach 2 cannot access Coach 1's session attendees roster
  const c2RosterRes = await request('/classes/sessions/session-1/attendees', coach2.token, 'GET');
  record('IDOR', 'Coach 2 blocked from viewing Coach 1 session roster (403 Forbidden)', 403, c2RosterRes.status, c2RosterRes.status === 403);

  // 5.2 Regular member cannot access session attendees roster
  const memberRosterRes = await request('/classes/sessions/session-1/attendees', member.token, 'GET');
  record('IDOR', 'Member blocked from viewing session roster (403 Forbidden)', 403, memberRosterRes.status, memberRosterRes.status === 403);

  // 5.3 Coach 1 can view their own session attendees roster
  const c1RosterRes = await request('/classes/sessions/session-1/attendees', coach1.token, 'GET');
  record('SECURITY', 'Coach 1 allowed to view own session roster (200 OK)', 200, c1RosterRes.status, c1RosterRes.status === 200);

  // 5.4 Coach 2 cannot modify Coach 1's class
  const c2EditClassRes = await request('/classes/class-1', coach2.token, 'PUT', { title: 'هک مربی' });
  record('IDOR', 'Coach 2 blocked from editing Coach 1 class (403 Forbidden)', 403, c2EditClassRes.status, c2EditClassRes.status === 403);

  // 5.5 Coach 2 cannot create session under Coach 1's class
  const c2CreateSessionRes = await request('/classes/class-1/sessions', coach2.token, 'POST', {
    venueId: 'venue-1',
    sessionDate: '2026-10-15',
    startTime: '10:00',
    endTime: '11:00',
  });
  record('IDOR', 'Coach 2 blocked from scheduling session under Coach 1 class (403 Forbidden)', 403, c2CreateSessionRes.status, c2CreateSessionRes.status === 403);

  // 5.6 Create a booking for member under session-1 using dedicated class payment
  const checkoutRes = await request('/payments/classes/checkout', member.token, 'POST', {
    purpose: 'CLASS_SINGLE_SESSION',
    referenceId: 'session-1',
  });
  let testBookingId = null;
  if (checkoutRes.ok && checkoutRes.data?.gatewayAuthority) {
    const verifyRes = await request('/payments/classes/verify', member.token, 'POST', {
      gatewayAuthority: checkoutRes.data.gatewayAuthority,
      status: 'OK',
    });
    testBookingId = verifyRes.data?.paymentId;
  } else {
    const myBookingsRes = await request('/classes/member/my-bookings', member.token, 'GET');
    const existing = myBookingsRes.data?.find((b) => b.sessionId === 'session-1');
    testBookingId = existing?.id;
  }

  record('SECURITY', 'Single session booking created for IDOR verification', true, !!testBookingId, !!testBookingId, `BookingId: ${testBookingId}`);

  if (testBookingId) {
    // 5.7 Regular member cannot mark attendance
    const memberAttendanceRes = await request(`/classes/bookings/${testBookingId}/attendance`, member.token, 'PUT', {
      status: 'ATTENDED',
    });
    record('IDOR', 'Member blocked from marking attendance (403 Forbidden)', 403, memberAttendanceRes.status, memberAttendanceRes.status === 403);

    // 5.8 Coach 2 cannot mark attendance on Coach 1's booking
    const c2AttendanceRes = await request(`/classes/bookings/${testBookingId}/attendance`, coach2.token, 'PUT', {
      status: 'ATTENDED',
    });
    record('IDOR', 'Coach 2 blocked from marking Coach 1 booking attendance (403 Forbidden)', 403, c2AttendanceRes.status, c2AttendanceRes.status === 403);

    // 5.9 Coach 1 CAN mark attendance on their own booking
    const c1AttendanceRes = await request(`/classes/bookings/${testBookingId}/attendance`, coach1.token, 'PUT', {
      status: 'ATTENDED',
    });
    record('SECURITY', 'Coach 1 allowed to mark attendance on own booking (200 OK)', 200, c1AttendanceRes.status, c1AttendanceRes.status === 200);

    // 5.10 Member 2 cannot cancel Member 1's booking
    const m2CancelRes = await request(`/classes/bookings/${testBookingId}/cancel`, member2.token, 'POST');
    record('IDOR', 'Member 2 blocked from cancelling Member 1 booking (403 Forbidden)', 403, m2CancelRes.status, m2CancelRes.status === 403);
  }

  // Summary
  console.log('\n====================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`TOTAL AUDIT SCENARIOS TESTED: ${results.length}`);
  console.log(`PASSED: ${results.filter(r => r.passed).length}`);
  console.log(`FAILED: ${results.filter(r => !r.passed).length}`);
  console.log(`RESULT: ${allPassed ? 'ALL IDOR, API SECURITY & DATA SAFETY CHECKS PASSED 100%' : 'FAILURES DETECTED'}`);
  console.log('====================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Audit execution failed:', err);
  process.exit(1);
});
