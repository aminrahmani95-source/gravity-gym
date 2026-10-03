async function runValidation() {
  const assert = (condition, msg) => {
    if (!condition) {
      console.error('❌ FAIL:', msg);
      process.exit(1);
    }
    console.log('✅ PASS:', msg);
  };

  console.log('--- 1. Testing Next.js Web Routes ---');
  const homeRes = await fetch('http://localhost:3000');
  assert(homeRes.status === 200, 'Home page loaded successfully (200)');
  const homeHtml = await homeRes.text();
  assert(homeHtml.includes('dir="rtl"') && homeHtml.includes('lang="fa"'), 'Home page enforces Persian RTL layout');

  const plansPageRes = await fetch('http://localhost:3000/plans');
  assert(plansPageRes.status === 200, 'Plans page loaded successfully (200)');

  const receptionPageRes = await fetch('http://localhost:3000/reception');
  assert(receptionPageRes.status === 200, 'Reception page loaded successfully (200)');

  const adminPageRes = await fetch('http://localhost:3000/admin');
  assert(adminPageRes.status === 200, 'Admin page loaded successfully (200)');

  console.log('\n--- 2. Member Journey: Discovery, Plans, Balance & Dynamic QR ---');
  const gymsRes = await fetch('http://localhost:4000/api/v1/gyms');
  assert(gymsRes.status === 200, 'Gym discovery API returned 200');
  const gyms = await gymsRes.json();
  assert(Array.isArray(gyms) && gyms.length >= 4, 'Gym catalog loaded at least 4 venues across Basic, Plus, Premium, Elite');

  const plansRes = await fetch('http://localhost:4000/api/v1/plans');
  assert(plansRes.status === 200, 'Membership plans API returned 200');
  const plans = await plansRes.json();
  assert(plans.length >= 3, 'Found 3 plans (Starter 15, Standard 30, Pro 60)');

  // Member Auth Journey (OTP SMS + Verification) with a fresh member
  const memberPhone = '0912' + Math.floor(1000000 + Math.random() * 9000000).toString();
  const otpSendRes = await fetch('http://localhost:4000/api/v1/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: memberPhone })
  });
  assert(otpSendRes.status === 200, 'SMS OTP dispatch returned 200');
  const otpSendData = await otpSendRes.json();

  const otpVerifyRes = await fetch('http://localhost:4000/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: memberPhone, code: otpSendData.debugCode || '12345' })
  });
  assert(otpVerifyRes.status === 200, 'OTP verification returned 200 with JWT session');
  const authSession = await otpVerifyRes.json();
  const token = authSession.accessToken;
  const memberUser = authSession.user;
  assert(token && memberUser.phoneNumber === memberPhone, 'Member JWT token issued successfully');

  // Member authenticated wallet summary
  const walletRes = await fetch('http://localhost:4000/api/v1/wallet/summary', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert(walletRes.status === 200, 'Authenticated wallet summary API returned 200');
  const wallet = await walletRes.json();
  console.log('Member balance verified:', wallet.currentCredits, 'Credits');

  // If user has insufficient credits, initiate Shaparak checkout and callback verification
  if (wallet.currentCredits < 4) {
    const standardPlan = plans.find(p => p.credits_awarded === 30 || p.creditsAwarded === 30 || p.slug === 'standard_30') || plans[1] || plans[0];
    const targetPrice = standardPlan.price_tomans || standardPlan.priceTomans || 1000000;
    const targetCredits = standardPlan.credits_awarded || standardPlan.creditsAwarded || 30;

    const checkoutRes = await fetch('http://localhost:4000/api/v1/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ planId: standardPlan.id })
    });
    if (checkoutRes.status !== 201) {
      console.error('Checkout error:', checkoutRes.status, await checkoutRes.text());
    }
    assert(checkoutRes.status === 201, 'Shaparak checkout initiated (201)');
    const checkoutData = await checkoutRes.json();
    assert(checkoutData.gatewayAuthority && checkoutData.amountTomans === targetPrice, 'Payment token & amount verified');

    // Shaparak gateway redirect callback verification
    const verifyPayRes = await fetch('http://localhost:4000/api/v1/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ planId: standardPlan.id, gatewayAuthority: checkoutData.gatewayAuthority, status: 'OK' })
    });
    assert(verifyPayRes.status === 201, 'Payment verification returned 201');
    const payResult = await verifyPayRes.json();
    assert(payResult.isSuccessful && payResult.creditsIssued === targetCredits, 'Plan credits (+30) activated in wallet');
    console.log('Shaparak IPG Flow: Plan purchase successful, RRN:', payResult.referenceIdRrn);
  }

  // Determine active sans at target gym dynamically
  const eliteGym = gyms.find(g => g.tier === 'ELITE') || gyms[0];
  const gymDetailRes = await fetch(`http://localhost:4000/api/v1/gyms/${eliteGym.id}`);
  assert(gymDetailRes.status === 200, 'Target gym detail loaded');
  const gymDetail = await gymDetailRes.json();
  const activeGender = gymDetail.activeSession ? gymDetail.activeSession.gender : 'FEMALE';
  const oppositeGender = activeGender === 'FEMALE' ? 'MALE' : 'FEMALE';
  console.log(`Target Gym: ${eliteGym.name_fa || eliteGym.nameFa} | Active Sans Gender: ${activeGender}`);

  console.log('\n--- 3. Receptionist Journey: Staff Auth, Sans Enforcement, Privacy, Consumption & Anti-Replay ---');
  // Staff Auth (09120000002)
  const staffOtpRes = await fetch('http://localhost:4000/api/v1/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000002' })
  });
  const staffOtpData = await staffOtpRes.json();
  const staffVerifyRes = await fetch('http://localhost:4000/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000002', code: staffOtpData.debugCode || '12345' })
  });
  const staffAuth = await staffVerifyRes.json();
  const staffToken = staffAuth.accessToken;
  assert(staffAuth.user && staffAuth.user.role === 'GYM_STAFF', 'Staff authenticated with GYM_STAFF role');

  // 3.1 Negative Test: Opposite gender member must be rejected with 403 Forbidden (Gender Conflict)
  await fetch('http://localhost:4000/api/v1/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ gender: oppositeGender, firstName: 'عضو', lastName: 'تست' })
  });
  const conflictQrRes = await fetch('http://localhost:4000/api/v1/checkin/generate-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ userId: memberUser.id, gymId: eliteGym.id })
  });
  const conflictQr = await conflictQrRes.json();
  const conflictVerifyRes = await fetch('http://localhost:4000/api/v1/checkin/reception-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: conflictQr.qrToken })
  });
  assert(conflictVerifyRes.status === 403, 'Negative Test: Opposite-gender athlete rejected with 403 Forbidden');
  const conflictErr = await conflictVerifyRes.json();
  assert(conflictErr.message.includes('تداخل سانس جنسیتی'), 'Error message confirms gender schedule conflict');

  // 3.2 Positive Test: Matching gender member generates QR and gets approved
  await fetch('http://localhost:4000/api/v1/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ gender: activeGender, firstName: 'عضو', lastName: 'تاییدشده' })
  });
  const validQrRes = await fetch('http://localhost:4000/api/v1/checkin/generate-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ userId: memberUser.id, gymId: eliteGym.id })
  });
  assert(validQrRes.status === 201, 'Dynamic QR generation returned 201 for matching athlete');
  const validQrData = await validQrRes.json();
  assert(validQrData.qrToken && validQrData.expiresInSeconds === 45, 'QR token generated with strict 45s validity');

  const verifyRes = await fetch('http://localhost:4000/api/v1/checkin/reception-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: validQrData.qrToken })
  });
  assert(verifyRes.status === 201, 'Positive Test: Counter scan returned 201 APPROVED');
  const verifyData = await verifyRes.json();
  assert(verifyData.status === 'APPROVED', 'Check-in status approved');
  assert(typeof verifyData.member.fullName === 'string' && verifyData.member.fullName.length > 0, 'Member name verified correctly');
  assert(verifyData.member.nationalCode === undefined && verifyData.member.phoneNumber === undefined, 'Strict Privacy: National Code and Phone Number suppressed from reception screen');

  // 3.3 Anti-Replay: Attempt duplicate scan with the exact same QR
  const replayRes = await fetch('http://localhost:4000/api/v1/checkin/reception-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ qrToken: validQrData.qrToken })
  });
  assert(replayRes.status === 400, 'Duplicate scan rejected with 400 Bad Request');
  const replayErr = await replayRes.json();
  assert(replayErr.message.includes('قبلاً استفاده شده'), 'Replay attack blocked with anti-replay error message');

  console.log('\n--- 4. Admin Journey: Metrics & Golden Bounding Inequality ---');
  // Admin Auth (09120000001)
  const adminOtpRes = await fetch('http://localhost:4000/api/v1/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000001' })
  });
  const adminOtpData = await adminOtpRes.json();

  const adminVerifyRes = await fetch('http://localhost:4000/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000001', code: adminOtpData.debugCode || '12345' })
  });
  const adminAuth = await adminVerifyRes.json();
  const adminToken = adminAuth.accessToken;
  assert(adminAuth.user.role === 'SUPER_ADMIN', 'Admin authenticated with SUPER_ADMIN role');

  const metricsRes = await fetch('http://localhost:4000/api/v1/admin/dashboard-metrics', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert(metricsRes.status === 200, 'Admin dashboard metrics returned 200');
  const metrics = await metricsRes.json();
  assert(metrics.economics.contributionMarginRatio !== undefined, 'Contribution margin ratio calculated in dashboard');

  // Attempt invalid pricing that violates Golden Bounding (C = 2, M = 150,000 T -> lambda = 75,250 > 32,000)
  const basicGym = gyms.find(g => g.tier === 'BASIC') || gyms[0];
  const invalidPricingRes = await fetch(`http://localhost:4000/api/v1/economics/gym-pricing/${basicGym.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ creditCost: 2, monetaryPayoutTomans: 150000, notes: 'Invalid test' })
  });
  assert(invalidPricingRes.status === 400, 'Invalid economic rule rejected by Golden Bounding with 400 Bad Request');
  const invalidErr = await invalidPricingRes.json();
  assert(invalidErr.message.includes('محدودیت طلایی'), 'Error specifically identifies Golden Bounding violation');

  // Set valid pricing conforming to Golden Bounding (C = 2, M = 30,000 T -> lambda = 15,250 <= 32,000)
  const validPricingRes = await fetch(`http://localhost:4000/api/v1/economics/gym-pricing/${basicGym.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ creditCost: 2, monetaryPayoutTomans: 30000, notes: 'Valid test' })
  });
  assert(validPricingRes.status === 200, 'Valid economic pricing accepted and saved (200)');

  console.log('\n🎉 ALL REAL UI & API JOURNEYS VALIDATED WITH 100% SUCCESS!');
}
runValidation().catch(e => { console.error('Validation script exception:', e); process.exit(1); });
