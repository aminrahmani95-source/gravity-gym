// scripts/verify-architectural-repair.mjs
// Verification of Full Architectural Repair:
// - Role Separation (Guest vs User vs Gym Staff vs Coach vs Admin)
// - Privilege Escalation Prevention (Self-service application stays USER with PENDING)
// - Admin Verification & Promotion to COACH
// - Coach Class & Session publishing authorization
// - Admin Staff Management & Platform Classes Overview

import Redis from 'ioredis';

const API_BASE = 'http://localhost:4000/api/v1';

async function resetRateLimits(phone) {
  try {
    const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      retryStrategy: () => null,
    });
    r.on('error', () => {});
    await r.del(`otp_rate_hour:${phone}`, `otp_cooldown:${phone}`);
    await r.quit();
  } catch {}
}

async function getJwtToken(phoneNumber) {
  await resetRateLimits(phoneNumber);
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

  return verifyRes.accessToken || verifyRes.token;
}

async function request(path, token = null, method = 'GET', body = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('====================================================');
  console.log('GRAVITY FULL ARCHITECTURAL REPAIR VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ PASS | ${name} ${details ? `(${details})` : ''}`);
    } else {
      console.error(`❌ FAIL | ${name} ${details ? `(${details})` : ''}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // 1. GUEST BOUNDARIES
  console.log('--- 1. Guest Boundaries ---');
  const guestCoachMe = await request('/coaches/me');
  assert('Guest calling /coaches/me gets 401', guestCoachMe.status === 401, `Status: ${guestCoachMe.status}`);

  const guestClassesMy = await request('/classes/coach/my-classes');
  assert('Guest calling /classes/coach/my-classes gets 401', guestClassesMy.status === 401, `Status: ${guestClassesMy.status}`);

  const guestAdminGyms = await request('/admin/gyms');
  assert('Guest calling /admin/gyms gets 401', guestAdminGyms.status === 401, `Status: ${guestAdminGyms.status}`);

  const guestAdminStaff = await request('/admin/staff');
  assert('Guest calling /admin/staff gets 401', guestAdminStaff.status === 401, `Status: ${guestAdminStaff.status}`);

  // 2. NORMAL USER BOUNDARIES
  console.log('\n--- 2. Normal USER Boundaries & Anti-Escalation ---');
  const testRunId = Math.floor(10000 + Math.random() * 90000);
  const userPhone = `0919${testRunId}11`;
  const userToken = await getJwtToken(userPhone);

  const userAdminGyms = await request('/admin/gyms', userToken);
  assert('User calling /admin/gyms gets 403', userAdminGyms.status === 403, `Status: ${userAdminGyms.status}`);

  const userAdminStaff = await request('/admin/staff', userToken);
  assert('User calling /admin/staff gets 403', userAdminStaff.status === 403, `Status: ${userAdminStaff.status}`);

  const userCoachMyClasses = await request('/classes/coach/my-classes', userToken);
  assert('User calling /classes/coach/my-classes gets 403', userCoachMyClasses.status === 403, `Status: ${userCoachMyClasses.status}`);

  const userCreateClass = await request('/classes', userToken, 'POST', {
    title: 'تست غیرمجاز کاربر عادی',
    categorySlug: 'fitness',
    description: 'توضیحات',
    durationMinutes: 60,
    defaultCapacity: 10,
    venueId: 'v-1',
    singleSessionPriceTomans: 100000,
  });
  assert('User calling POST /classes gets 403 Forbidden', userCreateClass.status === 403, `Status: ${userCreateClass.status}`);

  // 3. COACH APPLICATION LIFECYCLE (No self-promotion)
  console.log('\n--- 3. Coach Application Lifecycle (No Self-Escalation) ---');
  const applyRes = await request('/coaches/apply', userToken, 'POST', {
    displayName: 'مربی داوطلب تستی',
    bio: 'مربی بدنسازی و فیتنس با ۵ سال سابقه',
    sports: ['بدنسازی'],
    experienceYears: 5,
    shebaNumber: 'IR880120000000000000000001',
    bankAccountHolder: 'داوطلب تستی',
  });
  assert('Coach Application submits successfully (201)', applyRes.status === 201, `Status: ${applyRes.status}`);
  assert('Coach Application is in PENDING status', applyRes.data?.verificationStatus === 'PENDING', `Status: ${applyRes.data?.verificationStatus}`);
  assert('Coach is initially inactive', applyRes.data?.isActive === false);

  // Verify the user STILL cannot call POST /classes
  const userCreateClassAfterApply = await request('/classes', userToken, 'POST', {
    title: 'تست بعد از اپلای',
    categorySlug: 'fitness',
    description: 'توضیحات',
    durationMinutes: 60,
    defaultCapacity: 10,
    venueId: 'v-1',
    singleSessionPriceTomans: 100000,
  });
  assert('Applicant in PENDING status STILL gets 403 on POST /classes', userCreateClassAfterApply.status === 403);

  // 4. ADMIN APPROVAL & PROMOTION
  console.log('\n--- 4. Admin Verification & Privilege Granting ---');
  const adminToken = await getJwtToken('09120000001');

  // Verify coach application appears in admin roster
  const adminCoachesRes = await request('/coaches/admin/all', adminToken);
  assert('Admin can view all coaches', adminCoachesRes.ok && Array.isArray(adminCoachesRes.data));
  const applicantCoach = adminCoachesRes.data.find(c => c.id === applyRes.data.id);
  assert('Applicant appears in admin pending roster', applicantCoach && applicantCoach.verificationStatus === 'PENDING');

  // Admin approves the coach
  const verifyRes = await request(`/coaches/admin/${applicantCoach.id}/verify`, adminToken, 'PUT', {
    status: 'VERIFIED',
    commissionRate: 0.15,
  });
  assert('Admin successfully verifies coach', verifyRes.ok && verifyRes.data?.verificationStatus === 'VERIFIED');
  assert('Coach is now active', verifyRes.data?.isActive === true);

  // Re-fetch token for user so new role (COACH) is in JWT
  const verifiedCoachToken = await getJwtToken(userPhone);

  const verifiedCoachMyClasses = await request('/classes/coach/my-classes', verifiedCoachToken);
  assert('Verified Coach can access /classes/coach/my-classes (200)', verifiedCoachMyClasses.status === 200);

  // Verified coach publishes class
  const classCreateRes = await request('/classes', verifiedCoachToken, 'POST', {
    title: 'کلاس فانکشنال تأییدشده',
    categorySlug: 'fitness',
    description: 'تمرینات فانکشنال پیشرفته',
    difficulty: 'ALL_LEVELS',
    durationMinutes: 60,
    defaultCapacity: 15,
    venueId: 'venue-ext-1',
    singleSessionPriceTomans: 250000,
    hasMonthlyPlan: true,
    cancellationDeadlineHours: 2,
  });
  assert('Verified Coach publishes class successfully', classCreateRes.ok && !!classCreateRes.data?.id, `Class ID: ${classCreateRes.data?.id}`);

  // 5. ADMIN STAFF MANAGEMENT & CLASSES OVERVIEW
  console.log('\n--- 5. Admin Staff Management & Classes Overview ---');
  const staffPhone = `0919${testRunId}22`;
  const assignStaffRes = await request('/admin/staff', adminToken, 'POST', {
    phone: staffPhone,
    firstName: 'محسن',
    lastName: 'اکبری',
    assignedGymId: 'gym-plus-2',
  });
  assert('Admin assigns new gym staff', assignStaffRes.ok && assignStaffRes.data?.role === 'GYM_STAFF');

  const staffListRes = await request('/admin/staff', adminToken);
  assert('Admin retrieves staff list', staffListRes.ok && Array.isArray(staffListRes.data));
  const foundStaff = staffListRes.data.find(s => s.phone === staffPhone);
  assert('Assigned staff is present in list with gym details', foundStaff && foundStaff.assignedGymId === 'gym-plus-2');

  const classesOverviewRes = await request('/admin/classes', adminToken);
  assert('Admin retrieves platform classes overview', classesOverviewRes.ok && Array.isArray(classesOverviewRes.data));
  const foundClass = classesOverviewRes.data.find(c => c.title === 'کلاس فانکشنال تأییدشده');
  assert('Newly created class appears in platform-wide classes overview', !!foundClass);

  // 6. DIRECT COACH PROVISIONING BY ADMIN
  console.log('\n--- 6. Direct Coach Provisioning by Admin ---');
  const coachPhone = `0919${testRunId}33`;
  const directCoachRes = await request('/coaches/admin/create', adminToken, 'POST', {
    phone: coachPhone,
    fullName: 'کامران هدایتی',
    displayName: 'استاد هدایتی',
    sports: ['شنا', 'واترپلو'],
    experienceYears: 10,
    commissionRate: 0.12,
    shebaNumber: 'IR880120000000000000000002',
    bankAccountHolder: 'کامران هدایتی',
    bio: 'مربی بین‌المللی شنا',
  });
  assert('Admin directly provisions verified coach', directCoachRes.ok && directCoachRes.data?.verificationStatus === 'VERIFIED');
  assert('Directly provisioned coach is immediately active', directCoachRes.data?.isActive === true);

  console.log('\n====================================================');
  console.log(`TOTAL ARCHITECTURAL REPAIR CHECKS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${total - passed}`);
  console.log('RESULT: ALL ARCHITECTURAL REPAIR TESTS PASSED 100%');
  console.log('====================================================\n');
}

run().catch(err => {
  console.error('\n❌ ARCHITECTURAL REPAIR TEST FAILED:', err);
  process.exit(1);
});
