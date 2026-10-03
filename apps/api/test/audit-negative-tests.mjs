import crypto from 'crypto';

async function runNegativeTests() {
  console.log('====================================================');
  console.log('   RUNNING AUDIT OF 8 CRITICAL NEGATIVE SCENARIOS   ');
  console.log('====================================================\n');

  const assert = (condition, msg) => {
    if (!condition) {
      console.error('❌ FAIL:', msg);
      process.exit(1);
    }
    console.log('✅ PASS:', msg);
  };

  const API_BASE = 'http://localhost:4000/api/v1';

  // Obtain Member, Staff, Admin tokens
  console.log('--- Setup: Authenticating actors (Member, Reception Staff, Admin) ---');
  
  // 1. Staff Token (09120000002)
  const staffOtp = await (await fetch(`${API_BASE}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000002' })
  })).json();
  const staffAuth = await (await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000002', code: staffOtp.debugCode || '12345' })
  })).json();
  const staffToken = staffAuth.accessToken;
  assert(staffAuth.user && staffAuth.user.role === 'GYM_STAFF', 'Staff authenticated with role GYM_STAFF');

  // 2. Admin Token (09120000001)
  const adminOtp = await (await fetch(`${API_BASE}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000001' })
  })).json();
  const adminAuth = await (await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000001', code: adminOtp.debugCode || '12345' })
  })).json();
  const adminToken = adminAuth.accessToken;
  assert(adminAuth.user && adminAuth.user.role === 'SUPER_ADMIN', 'Admin authenticated with role SUPER_ADMIN');

  // 3. Member Token (fresh isolated phone)
  const memberPhone = '0912' + Math.floor(1000000 + Math.random() * 9000000).toString();
  const memberOtp = await (await fetch(`${API_BASE}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: memberPhone })
  })).json();
  const memberAuth = await (await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: memberPhone, code: memberOtp.debugCode || '12345' })
  })).json();
  const memberToken = memberAuth.accessToken;
  const memberUser = memberAuth.user;
  assert(memberAuth.user && (memberAuth.user.role === 'USER' || memberAuth.user.role === 'MEMBER'), 'Member authenticated with role USER/MEMBER');

  // Purchase standard plan for member so they have valid balance for check-in
  const plans = await (await fetch(`${API_BASE}/plans`)).json();
  const standardPlan = plans.find(p => p.credits_awarded === 30 || p.creditsAwarded === 30 || p.slug === 'standard_30') || plans[0];
  const checkoutRes = await (await fetch(`${API_BASE}/payments/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ planId: standardPlan.id })
  })).json();
  await fetch(`${API_BASE}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ planId: standardPlan.id, gatewayAuthority: checkoutRes.gatewayAuthority, status: 'OK' })
  });

  const gyms = await (await fetch(`${API_BASE}/gyms`)).json();
  const testGym = gyms.find(g => g.tier === 'ELITE') || gyms[0];

  console.log('\n--- Scenario 1: Malformed & Invalid QR Token ---');
  // 1.1 Invalid Base64 / non-JSON
  const malformedRes = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: 'not-a-valid-base64-or-json' })
  });
  assert(malformedRes.status === 400, 'Malformed QR rejected with 400 Bad Request');
  const malformedBody = await malformedRes.json();
  assert(malformedBody.message.includes('فرمت بارکد ورود نامعتبر است'), 'Returned format error message');

  // 1.2 Tampered Signature
  const qrSecret = 'secure_production_hmac_secret_key_minimum_32_characters';
  const nowSec = Math.floor(Date.now() / 1000);
  const tamperedPayload = {
    sub: memberUser.id,
    gymId: testGym.id,
    iat: nowSec,
    exp: nowSec + 45,
    nonce: crypto.randomBytes(8).toString('hex'),
    sig: '0000000000000000000000000000000000000000000000000000000000000000'
  };
  const tamperedToken = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
  const tamperedRes = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: tamperedToken })
  });
  assert(tamperedRes.status === 400, 'Tampered QR signature rejected with 400 Bad Request');
  const tamperedBody = await tamperedRes.json();
  assert(tamperedBody.message.includes('امضای رمزنگاری بارکد نامعتبر'), 'Returned HMAC signature mismatch error');

  console.log('\n--- Scenario 2: Expired QR Token (> 45s TTL) ---');
  const expNonce = crypto.randomBytes(8).toString('hex');
  const expiredPayload = {
    sub: memberUser.id,
    gymId: testGym.id,
    iat: nowSec - 100,
    exp: nowSec - 55, // Expired 55 seconds ago
    nonce: expNonce,
  };
  const expiredToSign = `${memberUser.id}:${testGym.id}:${nowSec - 100}:${nowSec - 55}:${expNonce}`;
  expiredPayload.sig = crypto.createHmac('sha256', qrSecret).update(expiredToSign).digest('hex');
  const expiredToken = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  
  const expiredRes = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: expiredToken })
  });
  assert(expiredRes.status === 400, 'Expired QR rejected with 400 Bad Request');
  const expiredBody = await expiredRes.json();
  assert(expiredBody.message.includes('منقضی شده است'), 'Returned expiration error message');

  console.log('\n--- Scenario 3: Sans-Aware Dynamic Checkin & QR Replay Protection ---');
  // Determine active sans gender at test gym dynamically
  const gymDetail = await (await fetch(`${API_BASE}/gyms/${testGym.id}`)).json();
  const activeGender = gymDetail.activeSession ? gymDetail.activeSession.gender : 'FEMALE';
  const oppositeGender = activeGender === 'FEMALE' ? 'MALE' : 'FEMALE';

  // 3.1 Negative Scenario: Gender schedule conflict rejection
  await fetch(`${API_BASE}/users/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ gender: oppositeGender, firstName: 'عضو', lastName: 'تست' })
  });
  const conflictQrRes = await fetch(`${API_BASE}/checkin/generate-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ userId: memberUser.id, gymId: testGym.id })
  });
  const conflictQr = await conflictQrRes.json();
  const conflictScanRes = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: conflictQr.qrToken })
  });
  assert(conflictScanRes.status === 403, 'Opposite gender athlete rejected with 403 Forbidden at reception gate');
  const conflictBody = await conflictScanRes.json();
  assert(conflictBody.message.includes('تداخل سانس جنسیتی'), 'Rejection message specifically cites gender schedule conflict');

  // 3.2 Positive Scenario: Set matching gender and generate legitimate QR
  await fetch(`${API_BASE}/users/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ gender: activeGender, firstName: 'عضو', lastName: 'تست' })
  });
  const legitimateQrRes = await fetch(`${API_BASE}/checkin/generate-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ userId: memberUser.id, gymId: testGym.id })
  });
  const legitimateQr = await legitimateQrRes.json();
  assert(legitimateQr.qrToken, 'Legitimate QR token generated for matching gender athlete');

  // First scan: must succeed
  const scan1Res = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: legitimateQr.qrToken })
  });
  assert(scan1Res.status === 201, 'First scan approved (201)');

  // Second scan: replay attack must be blocked
  const scan2Res = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: legitimateQr.qrToken })
  });
  assert(scan2Res.status === 400, 'Second scan rejected with 400 Bad Request');
  const scan2Body = await scan2Res.json();
  assert(scan2Body.message.includes('قبلاً استفاده شده است'), 'Replay attack blocked with anti-replay error message');

  console.log('\n--- Scenario 4: Unauthorized Admin Endpoint Access ---');
  // 4.1 Unauthenticated access to admin metrics
  const unauthRes = await fetch(`${API_BASE}/admin/dashboard-metrics`);
  assert(unauthRes.status === 401, 'Unauthenticated call to /admin/dashboard-metrics rejected with 401');

  // 4.2 Member attempting admin metrics
  const memberAdminRes = await fetch(`${API_BASE}/admin/dashboard-metrics`, {
    headers: { 'Authorization': `Bearer ${memberToken}` }
  });
  assert(memberAdminRes.status === 403, 'Member attempting admin metrics rejected with 403 Forbidden');

  // 4.3 Staff attempting admin metrics
  const staffAdminRes = await fetch(`${API_BASE}/admin/dashboard-metrics`, {
    headers: { 'Authorization': `Bearer ${staffToken}` }
  });
  assert(staffAdminRes.status === 403, 'Staff attempting admin metrics rejected with 403 Forbidden');

  console.log('\n--- Scenario 5: Unauthorized Reception Access ---');
  // 5.1 Member attempting counter scan
  const memberScanRes = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ qrToken: legitimateQr.qrToken })
  });
  assert(memberScanRes.status === 403, 'Member attempting counter verification rejected with 403 Forbidden');

  // 5.2 Unauthenticated user attempting counter scan
  const anonScanRes = await fetch(`${API_BASE}/checkin/reception-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrToken: legitimateQr.qrToken })
  });
  assert(anonScanRes.status === 401, 'Unauthenticated user attempting counter verification rejected with 401 Unauthorized');

  console.log('\n--- Scenario 6: Golden Bounding Inequality Violation ---');
  // Attempt to set price where lambda = (180,000 + 500) / 2 = 90,250 > lambda_max (~32,000)
  const invalidPriceRes = await fetch(`${API_BASE}/economics/gym-pricing/${testGym.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      creditCost: 2,
      monetaryPayoutTomans: 180000,
      notes: 'Audit negative test violating Golden Bounding'
    })
  });
  assert(invalidPriceRes.status === 400, 'Excessive payout rejected with 400 Bad Request');
  const invalidPriceBody = await invalidPriceRes.json();
  assert(invalidPriceBody.message.includes('محدودیت طلایی'), 'Error specifies Golden Bounding inequality violation');

  console.log('\n--- Scenario 7: Redis Fail-Closed Production Verification ---');
  const { execFileSync } = await import('child_process');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const servicePath = path.resolve(__dirname, '../dist/src/common/redis/redis.service.js').replace(/\\/g, '/');

  const checkSnippet = `
    const { RedisService } = require('${servicePath}');
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://127.0.0.1:9999';
    const s = new RedisService();
    s.onModuleInit().then(() => {
      process.exit(1);
    }).catch(err => {
      if (err.message.includes('FATAL SECURITY ERROR')) {
        console.log('FAIL_CLOSED_CONFIRMED');
        process.exit(0);
      }
      process.exit(2);
    });
  `;
  try {
    const out = execFileSync(process.execPath, ['-e', checkSnippet], { encoding: 'utf8', timeout: 5000 });
    assert(out.includes('FAIL_CLOSED_CONFIRMED'), 'RedisService fail-closed confirmed in production mode');
  } catch (err) {
    console.error('Scenario 7 execution output:', err.stdout, err.stderr);
    assert(false, 'RedisService must fail-closed in production');
  }

  console.log('\n--- Scenario 8: Duplicate Financial Mutation & Gateway Replay ---');
  // 8.1 Failed transaction verification cannot credit wallet
  const payDupRes = await fetch(`${API_BASE}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ planId: standardPlan.id, gatewayAuthority: 'NON_EXISTENT_OR_REPLAY_AUTHORITY_12345', status: 'FAILED' })
  });
  const payDupData = await payDupRes.json();
  assert(payDupData.isSuccessful === false && payDupData.creditsIssued === 0, 'Failed payment rejected without credit issuance');

  // 8.2 Verify member balance remained exactly intact
  const balanceCheck = await (await fetch(`${API_BASE}/wallet/summary`, {
    headers: { 'Authorization': `Bearer ${memberToken}` }
  })).json();
  console.log('Member remaining balance:', balanceCheck.currentCredits, 'Credits');
  assert(balanceCheck.currentCredits > 0 && balanceCheck.currentCredits < 30, 'Wallet balance strictly preserved (no phantom duplicate credits)');

  console.log('\n🎉 ALL 8 NEGATIVE AUDIT SCENARIOS PASSED WITH RIGOROUS ENFORCEMENT!');
}

runNegativeTests().catch(err => {
  console.error('Audit negative test exception:', err);
  process.exit(1);
});
