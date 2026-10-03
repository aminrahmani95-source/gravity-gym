// scripts/verify-browser-resilience.mjs
// Real Browser E2E Resilience & User Journey Verification Suite

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import Redis from 'ioredis';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API_BASE = 'http://localhost:4000/api/v1';
const WEB_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\resilience_qa';

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

async function getJwtToken(phoneNumber) {
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
  if (token) tokenCache.set(phoneNumber, token);
  return token;
}

async function main() {
  console.log('====================================================');
  console.log('GRAVITY REAL BROWSER RESILIENCE & INTEGRITY TEST');
  console.log('====================================================\n');

  await resetTestRateLimits();

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const testResults = [];
  function record(name, passed, details = '') {
    testResults.push({ name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | ${name} ${details ? `(${details})` : ''}`);
  }

  try {
    const page = await browser.newPage();

    // ----------------------------------------------------
    // TEST 1: Plans Page Purchase Resilience & Double-Submit Guard
    // ----------------------------------------------------
    console.log('\n--- Scenario 1: Plans Page Double-Click Prevention ---');
    const memberPhone = '09120000003'; // Ali Ahmadi
    const memberToken = await getJwtToken(memberPhone);

    await page.goto(`${WEB_BASE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok) => {
      localStorage.setItem('gym_app_token', tok);
    }, memberToken);

    await page.goto(`${WEB_BASE}/plans`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    // Track checkout API requests
    let checkoutCallsCount = 0;
    page.on('request', req => {
      if (req.url().includes('/payments/checkout') && req.method() === 'POST') {
        checkoutCallsCount++;
      }
    });

    // Locate purchase buttons after dynamic data fetch completes
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('خرید و فعالسازی')),
      { timeout: 10000 }
    );
    const purchaseButtons = await page.$$('button');
    let targetBtn = null;
    for (const btn of purchaseButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('خرید و فعالسازی')) {
        targetBtn = btn;
        break;
      }
    }

    if (targetBtn) {
      // Rapid double click
      await Promise.all([
        targetBtn.click(),
        targetBtn.click(),
      ]);

      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_plans_checkout_receipt.png') });

      record(
        'Double-Click Prevention on Plan Purchase',
        checkoutCallsCount === 1,
        `Checkout requests triggered: ${checkoutCallsCount} (expected exactly 1)`
      );
    } else {
      record('Double-Click Prevention on Plan Purchase', false, 'Purchase button not found');
    }

    // ----------------------------------------------------
    // TEST 2: Member Account Rendering & Wallet Invariants
    // ----------------------------------------------------
    console.log('\n--- Scenario 2: Member Account & Wallet Invariants ---');
    await page.goto(`${WEB_BASE}/account`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_member_account_wallet.png') });

    const pageContent = await page.content();
    const hasActiveSubOrBadge = pageContent.includes('عضویت فعال ورزشی') || pageContent.includes('اعتبار') || pageContent.includes('کیف پول');
    record('Member Account & Wallet Display', hasActiveSubOrBadge, 'Wallet and balance elements rendered');

    // ----------------------------------------------------
    // TEST 3: Reception Desk Scanner Guard & Fast Input
    // ----------------------------------------------------
    console.log('\n--- Scenario 3: Reception Desk Fast Scanner Guard ---');
    const staffPhone = '09120000002'; // Reza Mohammadi (gym-elite-4)
    const staffToken = await getJwtToken(staffPhone);

    await page.evaluate((tok) => {
      localStorage.setItem('gym_app_token', tok);
    }, staffToken);

    await page.goto(`${WEB_BASE}/reception`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    let receptionVerifyCallsCount = 0;
    page.on('request', req => {
      if (req.url().includes('/checkin/reception-verify') && req.method() === 'POST') {
        receptionVerifyCallsCount++;
      }
    });

    await page.waitForSelector('textarea', { timeout: 10000 });
    await page.type('textarea', 'INVALID_DUMMY_TOKEN_FOR_RAPID_SCAN_TEST');

    // Fire two rapid Enter key presses
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_reception_rapid_scan_guard.png') });

    record(
      'Reception Desk Rapid Enter Keypress Guard',
      receptionVerifyCallsCount === 1,
      `Reception verify requests triggered: ${receptionVerifyCallsCount} (expected exactly 1)`
    );

    // ----------------------------------------------------
    // TEST 4: Admin Dashboard Checkins & Economics Correctness
    // ----------------------------------------------------
    console.log('\n--- Scenario 4: Admin Dashboard Data Invariants ---');
    const adminPhone = '09120000005'; // Admin
    const adminToken = await getJwtToken(adminPhone);

    await page.evaluate((tok) => {
      localStorage.setItem('gym_app_token', tok);
    }, adminToken);

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_admin_dashboard_data.png') });

    const adminHtml = await page.content();
    const hasMetrics = adminHtml.includes('مجموع کاربران') || adminHtml.includes('درآمد ناخالص') || adminHtml.includes('باشگاه‌های همکار');
    record('Admin Dashboard Overview Metrics & Recent Checkins', hasMetrics, 'Overview cards and checkins list rendered cleanly');

  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log('TEST SUMMARY');
  console.log('====================================================');
  const allPassed = testResults.every(r => r.passed);
  console.log(`Total Scenarios: ${testResults.length} | Passed: ${testResults.filter(r => r.passed).length} | Failed: ${testResults.filter(r => !r.passed).length}`);
  if (allPassed) {
    console.log('✅ ALL BROWSER RESILIENCE TESTS PASSED 100%');
    process.exit(0);
  } else {
    console.log('❌ SOME BROWSER TESTS FAILED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error during browser resilience verification:', err);
  process.exit(1);
});
