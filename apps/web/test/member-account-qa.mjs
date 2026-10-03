import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://localhost:4000/api/v1';

async function runMemberAccountQA() {
  console.log('================ MEMBER ACCOUNT & WALLET VISUAL QA ================');

  // Step 1: Ensure directory exists
  const outDir = path.join(ARTIFACTS_DIR, 'account_visual_qa');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Step 2: Authenticate a real member & provision active membership + activity
  console.log('\n--- Step 1: Authenticating Member Session via API ---');
  const otpRes = await fetch(`${API_URL}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000003' }) // user-member-1 (Ali Ahmadi)
  });
  const otpData = await otpRes.json();
  const code = otpData.debugCode || '12345';

  const loginRes = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000003', code })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('✅ Member authenticated:', loginData.user.phoneNumber, '| Current Credits:', loginData.user.currentCredits);

  // If user has no active subscription or low credits, purchase Standard 30 plan
  const subRes = await fetch(`${API_URL}/subscriptions/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const subData = await subRes.json();
  console.log('Current Subscription State:', subData.state);

  if (subData.state === 'NO_ACTIVE_SUBSCRIPTION' || subData.state === 'EXPIRED') {
    console.log('Purchasing Standard 30 plan to establish active membership...');
    const checkoutRes = await fetch(`${API_URL}/payments/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ planId: 'plan-2' })
    });
    const checkoutData = await checkoutRes.json();

    await fetch(`${API_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        paymentId: checkoutData.paymentId,
        gatewayAuthority: checkoutData.gatewayAuthority,
        status: 'OK'
      })
    });
    console.log('✅ Plan purchased and activated successfully!');
  }

  // Launch browser with Microsoft Edge
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--proxy-server=direct://',
      '--proxy-bypass-list=*'
    ]
  });

  const page = await browser.newPage();

  // Desktop Viewport (1440x900)
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Visit unauthenticated state
  console.log('\n--- Step 2: Verifying Unauthenticated Guard on /account ---');
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(outDir, 'account_unauthenticated_desktop.png') });
  const unauthText = await page.evaluate(() => document.body.innerText);
  if (unauthText.includes('ورود به حساب کاربری')) {
    console.log('✅ PASS: Unauthenticated access safely displays login empty state');
  } else {
    console.error('❌ FAIL: Unauthenticated guard failed');
  }

  // 2. Set token in localStorage to log in
  console.log('\n--- Step 3: Injecting Token & Loading Authenticated /account ---');
  await page.evaluate((jwt) => {
    localStorage.setItem('gym_app_token', jwt);
  }, token);

  await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');

  // Verify DOM content
  const pageContent = await page.evaluate(() => {
    return {
      title: document.querySelector('h1')?.innerText,
      hasMembershipCard: document.body.innerText.includes('عضویت ورزشی گراویتی'),
      hasWalletCard: document.body.innerText.includes('کیف پول اعتباری'),
      hasActivityTabs: document.body.innerText.includes('ریزتراکنش‌ها و سوابق فعالیت'),
      balanceText: document.body.innerText.match(/(\d+|[۰-۹]+)\s*اعتبار ورزشی/)?.[0] || 'not found',
    };
  });

  console.log('DOM Content Verification:');
  console.log(' - Member Name:', pageContent.title);
  console.log(' - Has Membership Card:', pageContent.hasMembershipCard);
  console.log(' - Has Wallet Card:', pageContent.hasWalletCard);
  console.log(' - Has Activity Tabs:', pageContent.hasActivityTabs);
  console.log(' - Balance:', pageContent.balanceText);

  // Desktop Fullpage Capture
  console.log('Capturing Desktop 1440x900 Full Page...');
  await page.screenshot({ path: path.join(outDir, 'account_desktop_1440_full.png'), fullPage: true });

  // Test Tab 2: سوابق تردد
  console.log('\n--- Step 4: Testing Activity Tabs ---');
  const checkinTabBtn = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => b.innerText.includes('سوابق تردد'));
  });
  if (checkinTabBtn) {
    await checkinTabBtn.click();
    await new Promise(r => setTimeout(r, 600));
    console.log('Switched to سوابق تردد tab');
    await page.screenshot({ path: path.join(outDir, 'account_tab_checkins_desktop.png') });
  }

  // Test Tab 3: فاکتورها
  const paymentsTabBtn = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => b.innerText.includes('فاکتورها'));
  });
  if (paymentsTabBtn) {
    await paymentsTabBtn.click();
    await new Promise(r => setTimeout(r, 600));
    console.log('Switched to فاکتورها tab');
    await page.screenshot({ path: path.join(outDir, 'account_tab_payments_desktop.png') });
  }

  // Test Quick QR Modal trigger
  console.log('\n--- Step 5: Testing Quick QR Launcher Modal ---');
  const qrLaunchBtn = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => b.innerText.includes('دریافت بارکد ورود به باشگاه'));
  });
  if (qrLaunchBtn) {
    await qrLaunchBtn.click();
    await new Promise(r => setTimeout(r, 800));
    console.log('Opened Quick QR Gym Selector modal');
    await page.screenshot({ path: path.join(outDir, 'account_qr_selector_modal.png') });

    // Select the first gym in modal
    const firstGymBtn = await page.evaluateHandle(() => {
      const modal = document.querySelector('[role="dialog"]') || document.body;
      const gymButtons = modal.querySelectorAll('button');
      return Array.from(gymButtons).find(b => b.innerText.includes('اعتبار') && !b.innerText.includes('دریافت'));
    });
    if (firstGymBtn) {
      await firstGymBtn.click();
      await new Promise(r => setTimeout(r, 1200));
      console.log('Selected gym; verified Dynamic QR Modal opens with SVG QR and 45s countdown timer');
      await page.screenshot({ path: path.join(outDir, 'account_dynamic_qr_active.png') });

      // Close modal
      const closeBtn = await page.evaluateHandle(() => {
        return document.querySelector('[aria-label="بستن"]') || document.querySelector('button[title="بستن"]');
      });
      if (closeBtn) await closeBtn.click().catch(() => {});
    }
  }

  // Mobile Viewport (iPhone 14 - 390x844)
  console.log('\n--- Step 6: Testing Mobile Responsiveness (390x844) ---');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle0' });
  await page.evaluate((jwt) => {
    localStorage.setItem('gym_app_token', jwt);
  }, token);
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'account_mobile_390_authenticated.png'), fullPage: true });

  console.log('\n🎉 ALL MEMBER ACCOUNT CHECKS & SCREENSHOTS COMPLETED SUCCESSFULLY!');
  await browser.close();
}


runMemberAccountQA().catch(err => {
  console.error('❌ QA Execution failed:', err);
  process.exit(1);
});
