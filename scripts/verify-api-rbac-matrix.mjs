// scripts/verify-api-rbac-matrix.mjs
// Comprehensive live HTTP verification of backend RBAC and API protection

const API_BASE = 'http://localhost:4000/api/v1';

async function loginUser(phoneNumber) {
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

  return { token, user: verifyRes.user };
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
  console.log('LIVE BACKEND API RBAC MATRIX VERIFICATION');
  console.log('====================================================\n');

  const results = [];

  function record(scenario, expected, actual, passed, details = '') {
    results.push({ scenario, expected, actual, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | ${scenario} | Exp: ${expected} | Got: ${actual} ${details ? `(${details})` : ''}`);
  }

  // 1. Guest Scenarios (No Token)
  console.log('\n--- 1. GUEST SCENARIOS (UNAUTHENTICATED) ---');
  {
    const res = await request('/admin/dashboard-metrics');
    record('Guest -> GET /admin/dashboard-metrics', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/admin/gyms');
    record('Guest -> GET /admin/gyms', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/settlements/generate-batch/gym-basic-1', null, 'POST', {
      cycleStart: '2026-09-01',
      cycleEnd: '2026-09-30'
    });
    record('Guest -> POST /settlements/generate-batch/gym-basic-1', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/economics/gym-pricing/gym-basic-1', null, 'PUT', {
      creditCost: 5,
      monetaryPayoutTomans: 70000
    });
    record('Guest -> PUT /economics/gym-pricing/gym-basic-1', 401, res.status, res.status === 401);
  }
  {
    const res = await request('/checkin/reception-verify', null, 'POST', { qrToken: 'dummy' });
    record('Guest -> POST /checkin/reception-verify', 401, res.status, res.status === 401);
  }

  // 2. USER Member Scenarios (09120000003)
  console.log('\n--- 2. USER MEMBER SCENARIOS (09120000003) ---');
  const member = await loginUser('09120000003');
  console.log(`Authenticated as USER: ${member.user.firstName} ${member.user.lastName} (Role: ${member.user.role})`);
  {
    const res = await request('/admin/dashboard-metrics', member.token);
    record('USER -> GET /admin/dashboard-metrics', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms', member.token);
    record('USER -> GET /admin/gyms', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/recent-checkins', member.token);
    record('USER -> GET /admin/recent-checkins', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/settlements/generate-batch/gym-basic-1', member.token, 'POST', {
      cycleStart: '2026-09-01',
      cycleEnd: '2026-09-30'
    });
    record('USER -> POST /settlements/generate-batch', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/economics/gym-pricing/gym-basic-1', member.token, 'PUT', {
      creditCost: 5,
      monetaryPayoutTomans: 70000
    });
    record('USER -> PUT /economics/gym-pricing', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/checkin/reception-verify', member.token, 'POST', { qrToken: 'dummy' });
    record('USER -> POST /checkin/reception-verify', 403, res.status, res.status === 403);
  }

  // 3. GYM_STAFF Scenarios (09120000002)
  console.log('\n--- 3. GYM_STAFF SCENARIOS (09120000002) ---');
  const staff = await loginUser('09120000002');
  console.log(`Authenticated as GYM_STAFF: ${staff.user.firstName} ${staff.user.lastName} (Role: ${staff.user.role})`);
  {
    const res = await request('/admin/dashboard-metrics', staff.token);
    record('GYM_STAFF -> GET /admin/dashboard-metrics (MUST BE FORBIDDEN)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/gyms', staff.token);
    record('GYM_STAFF -> GET /admin/gyms (MUST BE FORBIDDEN)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/admin/recent-checkins', staff.token);
    record('GYM_STAFF -> GET /admin/recent-checkins (MUST BE FORBIDDEN)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/settlements/generate-batch/gym-basic-1', staff.token, 'POST', {
      cycleStart: '2026-09-01',
      cycleEnd: '2026-09-30'
    });
    record('GYM_STAFF -> POST /settlements/generate-batch (MUST BE FORBIDDEN)', 403, res.status, res.status === 403);
  }
  {
    const res = await request('/economics/gym-pricing/gym-basic-1', staff.token, 'PUT', {
      creditCost: 5,
      monetaryPayoutTomans: 70000
    });
    record('GYM_STAFF -> PUT /economics/gym-pricing (MUST BE FORBIDDEN)', 403, res.status, res.status === 403);
  }
  {
    // For reception-verify, staff has access (roles include GYM_STAFF), so sending invalid token yields 400 Bad Request, NOT 403 Forbidden!
    const res = await request('/checkin/reception-verify', staff.token, 'POST', { qrToken: 'dummy' });
    record('GYM_STAFF -> POST /checkin/reception-verify (PERMITTED)', '400 (Bad Request, NOT 403)', `${res.status} (${res.data?.message || ''})`, res.status === 400);
  }

  // 4. ADMIN Scenarios (09120000005)
  console.log('\n--- 4. ADMIN SCENARIOS (09120000005) ---');
  const admin = await loginUser('09120000005');
  console.log(`Authenticated as ADMIN: ${admin.user.firstName} ${admin.user.lastName} (Role: ${admin.user.role})`);
  {
    const res = await request('/admin/dashboard-metrics', admin.token);
    record('ADMIN -> GET /admin/dashboard-metrics (ALLOWED)', 200, res.status, res.status === 200, `Total Users: ${res.data?.overview?.totalUsers}`);
  }
  {
    const res = await request('/admin/gyms', admin.token);
    record('ADMIN -> GET /admin/gyms (ALLOWED)', 200, res.status, res.status === 200, `Gyms: ${res.data?.length}`);
  }
  {
    const res = await request('/admin/recent-checkins', admin.token);
    record('ADMIN -> GET /admin/recent-checkins (ALLOWED)', 200, res.status, res.status === 200, `Recent logs: ${res.data?.length}`);
  }

  // 5. SUPER_ADMIN Scenarios (09120000001)
  console.log('\n--- 5. SUPER_ADMIN SCENARIOS (09120000001) ---');
  const superAdmin = await loginUser('09120000001');
  console.log(`Authenticated as SUPER_ADMIN: ${superAdmin.user.firstName} ${superAdmin.user.lastName} (Role: ${superAdmin.user.role})`);
  {
    const res = await request('/admin/dashboard-metrics', superAdmin.token);
    record('SUPER_ADMIN -> GET /admin/dashboard-metrics (ALLOWED)', 200, res.status, res.status === 200, `Total Users: ${res.data?.overview?.totalUsers}`);
  }
  {
    const res = await request('/admin/gyms', superAdmin.token);
    record('SUPER_ADMIN -> GET /admin/gyms (ALLOWED)', 200, res.status, res.status === 200, `Gyms: ${res.data?.length}`);
  }
  {
    const res = await request('/admin/recent-checkins', superAdmin.token);
    record('SUPER_ADMIN -> GET /admin/recent-checkins (ALLOWED)', 200, res.status, res.status === 200, `Recent logs: ${res.data?.length}`);
  }

  // Summary
  console.log('\n====================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`TOTAL SCENARIOS TESTED: ${results.length}`);
  console.log(`PASSED: ${results.filter(r => r.passed).length}`);
  console.log(`FAILED: ${results.filter(r => !r.passed).length}`);
  console.log(`RESULT: ${allPassed ? 'ALL ACCESS CONTROL SCENARIOS VERIFIED 100%' : 'FAILURES DETECTED'}`);
  console.log('====================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error executing RBAC verification:', err);
  process.exit(1);
});
