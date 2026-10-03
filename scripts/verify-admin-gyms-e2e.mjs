// scripts/verify-admin-gyms-e2e.mjs
// Real Browser E2E Test Suite for Super Admin Gym Management Overhaul

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import Redis from 'ioredis';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API_BASE = 'http://localhost:4000/api/v1';
const WEB_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\admin_gyms_qa';

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
      'otp_cooldown:09120000001',
      'otp_cooldown:09120000002',
      'otp_cooldown:09120000003',
      'otp_cooldown:09120000004',
      'otp_cooldown:09120000005'
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

  const tok = verifyRes.accessToken || verifyRes.token;
  tokenCache.set(phoneNumber, tok);
  return tok;
}

async function main() {
  console.log('====================================================');
  console.log('SUPER ADMIN GYM MANAGEMENT — REAL BROWSER E2E TEST');
  console.log('====================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  await resetTestRateLimits();

  const runId = Math.floor(1000 + Math.random() * 9000);
  const testGymName = `باشگاه ستاره آریا ${runId}`;
  const testEditedName = `باشگاه ستاره آریا ${runId} (شعبه VIP مرکزی)`;
  const testShebaDigits = ('88012' + runId + '0000000000000000').slice(0, 24);
  const testSheba = `IR${testShebaDigits}`;

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

    // -------------------------------------------------------------------------
    // STEP 1: Super Admin Login & Navigation
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 1: Super Admin Authentication & Admin Panel ---');
    const superAdminToken = await getJwtToken('09120000001');
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), superAdminToken);

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('پنل نظارت و مدیریت'), { timeout: 10000 });

    const pageText = await page.evaluate(() => document.body.innerText);
    record('Super Admin Lands on /admin', pageText.includes('پنل نظارت و مدیریت'));

    // -------------------------------------------------------------------------
    // STEP 2: Open Gyms Management Tab
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: Switch to "مدیریت مجموعه‌ها" Tab ---');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const gymBtn = buttons.find(b => b.innerText.includes('مدیریت مجموعه‌ها'));
      if (gymBtn) gymBtn.click();
    });

    await page.waitForFunction(
      () => document.body.innerText.includes('باشگاه بدنسازی کارو') || document.body.innerText.includes('مجموعه ورزشی ستاره ونک'),
      { timeout: 10000 }
    );

    const gymsTabText = await page.evaluate(() => document.body.innerText);
    const hasGymHeader = gymsTabText.includes('مدیریت مجموعه‌ها و باشگاه‌های طرف قرارداد');
    const hasAddGymBtn = gymsTabText.includes('افزودن باشگاه جدید');
    const hasExistingGym = gymsTabText.includes('باشگاه بدنسازی کارو') || gymsTabText.includes('مجموعه ورزشی ستاره ونک');

    record('Gyms Tab Header Rendered', hasGymHeader);
    record('Add Gym Button Visible', hasAddGymBtn);
    record('Existing Gyms Listed with Badges & Actions', hasExistingGym);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_gyms_tab_list.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // STEP 3: Search & Filtering Functionality
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Search & Filtering Functionality ---');
    await page.type('input[placeholder*="جستجو بر اساس نام باشگاه"]', 'ستاره ونک');
    await new Promise(r => setTimeout(r, 600));

    const searchFilteredText = await page.evaluate(() => document.body.innerText);
    const searchFoundVanak = searchFilteredText.includes('مجموعه ورزشی ستاره ونک');
    const searchExcludedKaro = !searchFilteredText.includes('باشگاه بدنسازی کارو');

    record('Search Filter -> Matches Target Gym', searchFoundVanak);
    record('Search Filter -> Excludes Non-Matching Gyms', searchExcludedKaro);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_gyms_search_filter.png'), fullPage: false });

    // Clear search input using native setter so React state updates
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="جستجو بر اساس نام باشگاه"]');
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Wait until non-matching gyms reappear
    await page.waitForFunction(
      () => document.body.innerText.includes('باشگاه بدنسازی کارو'),
      { timeout: 10000 }
    );

    // -------------------------------------------------------------------------
    // STEP 4: Add a New Gym
    // -------------------------------------------------------------------------
    console.log(`\n--- STEP 4: Create a New Partner Gym (${testGymName}) ---`);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.innerText.includes('افزودن باشگاه جدید'));
      if (addBtn) addBtn.click();
    });

    await page.waitForFunction(() => document.body.innerText.includes('افزودن مجموعه ورزشی جدید به شبکه'), { timeout: 10000 });
    record('Add Gym Modal Opened', true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_add_gym_modal.png'), fullPage: false });

    // Fill form fields
    await page.type('input[placeholder*="باشگاه بدنسازی رویال"]', testGymName);
    await page.type('input[placeholder="تهران"]', 'تهران');
    await page.type('input[placeholder*="سعادت‌آباد"]', 'جردن');
    await page.type('input[placeholder*="خیابان، کوچه"]', 'بلوار آفریقا، خیابان روانپور، پلاک ۸');
    await page.type('input[placeholder*="نام و نام خانوادگی صاحب حساب"]', 'موسسه ورزشی آریا');
    await page.type('input[placeholder*="IR123456789"]', testSheba);
    await page.type('input[placeholder*="02188888888"]', '02122003344');

    // Submit form
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button[type="submit"]'));
      const submitBtn = buttons.find(b => b.innerText.includes('افزودن و اتصال فوری به شبکه'));
      if (submitBtn) submitBtn.click();
    });

    // Wait for the modal to close and new gym to appear in cards
    await page.waitForFunction(
      (gName) => {
        const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
        return cards.some(c => c.innerText.includes(gName));
      },
      { timeout: 10000 },
      testGymName
    );

    record('New Gym Created & Immediately Visible in Roster', true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_new_gym_created.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // STEP 5: Edit Gym & Verify Persistence After Refresh
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 5: Edit Gym & Verify Persistence After Reload ---');
    // Click "ویرایش" on the newly created gym card
    await page.evaluate((gName) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const card = cards.find(c => c.innerText.includes(gName));
      if (card) {
        const editBtn = Array.from(card.querySelectorAll('button')).find(b => b.innerText.includes('ویرایش'));
        if (editBtn) editBtn.click();
      }
    }, testGymName);

    // Wait for edit modal to appear
    await page.waitForFunction(() => document.body.innerText.includes('ویرایش مجموعه ورزشی'), { timeout: 10000 });

    // Change name via native value setter
    await page.evaluate((newName) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const nameInput = inputs.find(i => i.value.includes('باشگاه ستاره آریا'));
      if (nameInput) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(nameInput, newName);
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, testEditedName);
    await new Promise(r => setTimeout(r, 400));

    // Save Edit
    await page.evaluate(() => {
      const submitBtn = Array.from(document.querySelectorAll('button[type="submit"]'))
        .find(b => b.innerText.includes('ذخیره تغییرات'));
      if (submitBtn) submitBtn.click();
    });

    // Wait for edit modal to close
    await page.waitForFunction(() => !document.body.innerText.includes('ویرایش مجموعه ورزشی'), { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    // Hard Reload page to prove persistence across refreshes
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('پنل نظارت و مدیریت'), { timeout: 10000 });

    // Re-open gyms tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const gymBtn = buttons.find(b => b.innerText.includes('مدیریت مجموعه‌ها'));
      if (gymBtn) gymBtn.click();
    });
    await page.waitForFunction((editedName) => document.body.innerText.includes(editedName), { timeout: 10000 }, testEditedName);

    const afterReloadText = await page.evaluate(() => document.body.innerText);
    const editedPersisted = afterReloadText.includes(testEditedName);
    record('Gym Edit Persists After Page Refresh', editedPersisted);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_gym_edited_persisted.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // STEP 6: Gym Detail & Operational Dossier Inspection
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 6: Inspect Operational Dossier Modal ---');
    // Click "پرونده عملیاتی" on vanak gym
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const vanakCard = cards.find(c => c.innerText.includes('مجموعه ورزشی ستاره ونک') || c.innerText.includes('باشگاه بدنسازی کارو'));
      if (vanakCard) {
        const detailBtn = Array.from(vanakCard.querySelectorAll('button')).find(b => b.innerText.includes('پرونده عملیاتی'));
        if (detailBtn) detailBtn.click();
      }
    });

    // Wait for the modal content to finish loading
    await page.waitForFunction(
      () => document.body.innerText.includes('وضعیت اسناد و یکپارچگی مالی'),
      { timeout: 10000 }
    );

    const dossierText = await page.evaluate(() => document.body.innerText);
    const hasDossierTitle = dossierText.includes('پرونده جامع عملیاتی و اطلاعات مجموعه ورزشی');
    const hasFinancialNotice = dossierText.includes('وضعیت اسناد و یکپارچگی مالی');
    const hasStaffSection = dossierText.includes('پرسنل و مسئولین پذیرش متصل');
    const hasSansSection = dossierText.includes('برنامه سانس‌های کاری هفتگی');

    record('Operational Dossier Modal Loaded', hasDossierTitle);
    record('Financial & Invariant Notice Displayed', hasFinancialNotice);
    record('Assigned Staff Section Present', hasStaffSection);
    record('Weekly Sans Schedule Present', hasSansSection);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_gym_operational_dossier.png'), fullPage: false });

    // Close modal (Escape)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.innerText.includes('پرونده جامع عملیاتی و اطلاعات مجموعه ورزشی'), { timeout: 10000 });

    // -------------------------------------------------------------------------
    // STEP 7: Deactivate & Reactivate Gym
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 7: Deactivate & Reactivate Gym ---');
    // Click "غیرفعال‌سازی" on test gym
    await page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const card = cards.find(c => c.innerText.includes(name));
      if (card) {
        const toggleBtn = Array.from(card.querySelectorAll('button')).find(b => b.innerText.includes('غیرفعال‌سازی'));
        if (toggleBtn) toggleBtn.click();
      }
    }, testEditedName);

    // Wait for status badge to show inactive
    await page.waitForFunction((name) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const card = cards.find(c => c.innerText.includes(name));
      return card && card.innerText.includes('غیرفعال / بایگانی');
    }, { timeout: 10000 }, testEditedName);

    record('Gym Soft-Deactivated -> Status Updated to Inactive', true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_gym_deactivated.png'), fullPage: false });

    // Click "فعال‌سازی" to reactivate
    await page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const card = cards.find(c => c.innerText.includes(name));
      if (card) {
        const toggleBtn = Array.from(card.querySelectorAll('button')).find(b => b.innerText.includes('فعال‌سازی'));
        if (toggleBtn) toggleBtn.click();
      }
    }, testEditedName);

    // Wait for status badge to show active
    await page.waitForFunction((name) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const card = cards.find(c => c.innerText.includes(name));
      return card && card.innerText.includes('فعال در شبکه');
    }, { timeout: 10000 }, testEditedName);

    record('Gym Reactivated -> Status Restored to Active', true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_gym_reactivated.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // STEP 8: Safe Removal Invariant
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 8: Safe Removal Confirmation & Invariant ---');
    // Click "خروج از شبکه" on test gym
    await page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      const card = cards.find(c => c.innerText.includes(name));
      if (card) {
        const removeBtn = Array.from(card.querySelectorAll('button')).find(b => b.innerText.includes('خروج از شبکه'));
        if (removeBtn) removeBtn.click();
      }
    }, testEditedName);

    await page.waitForFunction(() => document.body.innerText.includes('قانون حفاظت از یکپارچگی دفاتر مالی و تردد'), { timeout: 10000 });
    record('Safe Removal Invariant Modal Displayed', true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_safe_removal_modal.png'), fullPage: false });

    // Confirm removal
    await page.evaluate(() => {
      const confirmBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.innerText.includes('تایید خروج از شبکه') || b.innerText.includes('تأیید خروج از شبکه'));
      if (confirmBtn) confirmBtn.click();
    });

    // Wait for modal to close and gym to disappear from list
    await page.waitForFunction((name) => {
      const cards = Array.from(document.querySelectorAll('div.rounded-3xl.border'));
      return !cards.some(c => c.innerText.includes(name));
    }, { timeout: 10000 }, testEditedName);

    record('Zero-Reference Gym Safely Removed from Network', true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_gym_safely_removed.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // STEP 9: RBAC Enforcement — Unauthorized Roles Forbidden from Gym CRUD
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 9: RBAC Enforcement for GYM_STAFF & USER ---');
    const staffToken = await getJwtToken('09120000002');
    const staffCreateRes = await fetch(`${API_BASE}/admin/gyms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        nameFa: 'باشگاه غیرمجاز',
        tier: 'BASIC',
        city: 'تهران',
        district: 'ونک',
        addressFa: 'تست',
        latitude: 35.7,
        longitude: 51.4,
        shebaNumber: 'IR990120000000000000000099',
        bankAccountHolder: 'تست',
      }),
    });
    record('GYM_STAFF -> POST /admin/gyms returns 403 Forbidden', staffCreateRes.status === 403);

    const staffDeleteRes = await fetch(`${API_BASE}/admin/gyms/gym-basic-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    record('GYM_STAFF -> DELETE /admin/gyms/:id returns 403 Forbidden', staffDeleteRes.status === 403);

    const userToken = await getJwtToken('09120000003');
    const userAccessRes = await fetch(`${API_BASE}/admin/gyms`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    record('USER -> GET /admin/gyms returns 403 Forbidden', userAccessRes.status === 403);

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    const allPassed = testResults.every(r => r.passed);
    console.log(`TOTAL E2E SCENARIOS TESTED: ${testResults.length}`);
    console.log(`PASSED: ${testResults.filter(r => r.passed).length}`);
    console.log(`FAILED: ${testResults.filter(r => !r.passed).length}`);
    console.log(`RESULT: ${allPassed ? 'ALL SUPER ADMIN GYM MANAGEMENT TESTS PASSED 100%' : 'FAILURES DETECTED'}`);
    console.log('====================================================\n');

    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
