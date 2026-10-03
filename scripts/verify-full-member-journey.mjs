// scripts/verify-full-member-journey.mjs
// Verification of the full end-to-end user journey across subscription, payment, wallet, and check-in

const API_BASE = 'http://localhost:4000/api/v1';

async function login(phoneNumber) {
  const sendRes = await fetch(`${API_BASE}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  }).then(r => r.json());

  const code = sendRes.debugCode || '12345';
  const verifyRes = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code }),
  }).then(r => r.json());

  return { token: verifyRes.accessToken || verifyRes.token, user: verifyRes.user };
}

async function request(endpoint, token, method = 'GET', body = null) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('====================================================');
  console.log('REAL PRODUCT JOURNEY: MEMBER SUBSCRIPTION & CHECKIN');
  console.log('====================================================\n');

  // Step 1: Query target gym active session to match member gender
  const gymDetailRes = await fetch(`${API_BASE}/gyms/gym-elite-4`).then(r => r.json());
  const activeGender = gymDetailRes.activeSession?.gender || 'MALE';
  const memberName = activeGender === 'FEMALE' ? { first: 'مریم', last: 'سهرابی' } : { first: 'سینا', last: 'سهرابی' };

  // Fresh member signs up and completes profile
  const testPhone = `0912${Math.floor(1000000 + Math.random() * 9000000)}`;
  const member = await login(testPhone);
  await request('/users/me', member.token, 'PATCH', {
    firstName: memberName.first,
    lastName: memberName.last,
    gender: activeGender,
  });
  console.log(`[1] Authenticated Fresh Member: ${memberName.first} ${memberName.last} (${activeGender}, Phone: ${testPhone})`);

  // Step 2: Member checks out a plan
  const checkoutRes = await request('/payments/checkout', member.token, 'POST', { planId: 'plan-2' });
  console.log(`[2] Payment Initiated: Authority ${checkoutRes.data.gatewayAuthority}, Amount: ${checkoutRes.data.amountTomans} Tomans (${checkoutRes.data.amountRials} Rials)`);

  // Step 3: Member verifies payment
  const verifyRes = await request('/payments/verify', member.token, 'POST', {
    planId: 'plan-2',
    gatewayAuthority: checkoutRes.data.gatewayAuthority,
    status: 'OK',
  });
  console.log(`[3] Payment Verified: Success=${verifyRes.data.isSuccessful}, Issued=${verifyRes.data.creditsIssued} credits, RRN=${verifyRes.data.referenceIdRrn}`);

  // Step 4: Verify profile has activeSubscription and updated currentCredits
  const profileRes = await request('/users/me', member.token);
  console.log(`[4] Member Profile: Credits=${profileRes.data.currentCredits}, ActiveSub=${profileRes.data.activeSubscription?.planTitle} (Expires: ${profileRes.data.activeSubscription?.expiresAt})`);

  if (!profileRes.data.activeSubscription) {
    throw new Error('FAILED: activeSubscription is missing from user profile!');
  }
  if (profileRes.data.currentCredits < 30) {
    throw new Error(`FAILED: currentCredits is ${profileRes.data.currentCredits}, expected at least 30!`);
  }

  // Step 5: Check wallet summary
  const walletRes = await request('/wallet/summary', member.token);
  console.log(`[5] Wallet Summary: Balance=${walletRes.data.currentCredits}, TotalEarned=${walletRes.data.totalEarnedCredits}, TotalSpent=${walletRes.data.totalSpentCredits}`);
  console.log(`    Recent Transactions: ${walletRes.data.recentTransactions?.length} entries`);
  const latestTx = walletRes.data.recentTransactions?.[0];
  console.log(`    Latest Tx: Type=${latestTx?.entryType}, Delta=${latestTx?.deltaCredits}, Title="${latestTx?.relatedTitle}"`);

  if (!latestTx?.relatedTitle) {
    throw new Error('FAILED: relatedTitle was not resolved in wallet transaction!');
  }

  // Step 6: Generate dynamic QR token for gym-elite-4 (Espinas Palace)
  const qrRes = await request('/checkin/generate-qr', member.token, 'POST', { gymId: 'gym-elite-4' });
  console.log(`[6] Dynamic QR Generated: Token len=${qrRes.data.qrToken?.length}, ExpiresIn=${qrRes.data.expiresInSeconds}s`);

  // Step 7: Reception counter staff logs in and verifies check-in
  const staff = await login('09120000002');
  console.log(`[7] Reception Staff Authenticated: ${staff.user.firstName} ${staff.user.lastName} (Assigned Gym: ${staff.user.assignedGymId})`);

  const checkinRes = await request('/checkin/reception-verify', staff.token, 'POST', {
    qrToken: qrRes.data.qrToken,
  });
  console.log(`[8] Reception Verify Result: Status=${checkinRes.data.status}, CheckinId=${checkinRes.data.checkinId}`);
  console.log(`    Member: ${checkinRes.data.member?.fullName} (${checkinRes.data.member?.gender})`);
  console.log(`    Visit: Gym=${checkinRes.data.visitDetails?.gymName}, Debited=${checkinRes.data.visitDetails?.creditsDebited} credits`);

  if (checkinRes.data.status !== 'APPROVED') {
    throw new Error(`FAILED: check-in was not approved: ${JSON.stringify(checkinRes.data)}`);
  }

  // Step 8: Verify updated balance on member profile and wallet
  const updatedWallet = await request('/wallet/summary', member.token);
  console.log(`[9] Updated Wallet: Balance=${updatedWallet.data.currentCredits} (debited ${checkinRes.data.visitDetails?.creditsDebited})`);
  const checkinTx = updatedWallet.data.recentTransactions?.[0];
  console.log(`    Latest Checkin Tx: Type=${checkinTx?.entryType}, Delta=${checkinTx?.deltaCredits}, Related="${checkinTx?.relatedTitle}"`);

  if (checkinTx?.entryType !== 'CHECKIN_DEBIT' || !checkinTx?.relatedTitle?.includes('اسپیناس')) {
    throw new Error(`FAILED: checkin transaction not correctly reflected in wallet summary: ${JSON.stringify(checkinTx)}`);
  }

  // Step 9: Verify Sans Conflict Enforcement (Male user with valid credits trying to enter Espinas Palace during midday female sans)
  console.log('\n[10] Testing Sans Conflict Protection: User with opposite gender attempting check-in...');
  const oppositeGender = activeGender === 'MALE' ? 'FEMALE' : 'MALE';
  const oppositePhone = `0912${Math.floor(1000000 + Math.random() * 9000000)}`;
  const oppositeMember = await login(oppositePhone);
  await request('/users/me', oppositeMember.token, 'PATCH', {
    firstName: oppositeGender === 'FEMALE' ? 'سحر' : 'سامان',
    lastName: 'فروتن',
    gender: oppositeGender,
  });
  const oppCheckout = await request('/payments/checkout', oppositeMember.token, 'POST', { planId: 'plan-2' });
  await request('/payments/verify', oppositeMember.token, 'POST', {
    planId: 'plan-2',
    gatewayAuthority: oppCheckout.data.gatewayAuthority,
    status: 'OK',
  });

  const oppQr = await request('/checkin/generate-qr', oppositeMember.token, 'POST', { gymId: 'gym-elite-4' });
  const oppAttempt = await request('/checkin/reception-verify', staff.token, 'POST', {
    qrToken: oppQr.data.qrToken,
  });

  if (oppAttempt.status === 403 && oppAttempt.data?.message?.includes('تداخل سانس جنسیتی')) {
    console.log(`    ✅ Sans Conflict Blocked Correctly: ${oppAttempt.data.message}`);
  } else {
    throw new Error(`FAILED: Expected 403 Sans Conflict, got status ${oppAttempt.status}: ${JSON.stringify(oppAttempt.data)}`);
  }

  // Step 11: Test Cross-Venue QR Rejection
  console.log('\n[11] Testing Cross-Venue QR Fraud Protection: Member generates QR for gym-basic-1 but scans at gym-elite-4...');
  const crossQr = await request('/checkin/generate-qr', member.token, 'POST', { gymId: 'gym-basic-1' });
  const crossAttempt = await request('/checkin/reception-verify', staff.token, 'POST', {
    qrToken: crossQr.data.qrToken,
  });

  if (crossAttempt.status === 400 && crossAttempt.data?.message?.includes('مجموعه ورزشی دیگری صادر شده است')) {
    console.log(`    ✅ Cross-Venue QR Fraud Blocked Correctly: ${crossAttempt.data.message}`);
  } else {
    throw new Error(`FAILED: Expected 400 Cross-Venue rejection, got status ${crossAttempt.status}: ${JSON.stringify(crossAttempt.data)}`);
  }

  console.log('\n====================================================');
  console.log('✅ COMPLETE MEMBER JOURNEY & SANS LOGIC VERIFIED 100%');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal journey error:', err);
  process.exit(1);
});
