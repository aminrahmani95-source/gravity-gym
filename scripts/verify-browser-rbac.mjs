// scripts/verify-browser-rbac.mjs
// Real Browser E2E Test Suite for Gravity RBAC Enforcement

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import Redis from 'ioredis';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API_BASE = 'http://localhost:4000/api/v1';
const WEB_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\rbac_qa';

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
  console.log('REAL BROWSER RBAC END-TO-END VERIFICATION');
  console.log('====================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  await resetTestRateLimits();

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

    // Track network requests to verify NO admin API calls are triggered for unauthorized roles
    let adminApiCalls = [];
    page.on('request', req => {
      const url = req.url();
      if (url.includes('/api/v1/admin') || url.includes('/api/v1/settlements') || url.includes('/api/v1/economics/gym-pricing')) {
        adminApiCalls.push({ url, method: req.method() });
      }
    });

    // -------------------------------------------------------------------------
    // TEST 1: GUEST -> /admin = DENIED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Guest Access Control (/admin) ---');
    adminApiCalls = [];
    await page.goto(`${WEB_BASE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('gym_app_token'));

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    const guestPageText = await page.evaluate(() => document.body.innerText);
    const guestHasLoginPrompt = guestPageText.includes('ورود به پنل مدیریت گراویتی');
    const guestNoMetrics = !guestPageText.includes('کاربران کل') && !guestPageText.includes('مجموع درآمد ناخالص');
    const guestAdminCallsCount = adminApiCalls.length;

    // Check navbar & footer for /admin link
    const guestAdminLinksInDom = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.filter(a => a.getAttribute('href') === '/admin').length;
    });

    record('Guest -> Shows Unauthenticated Login Prompt', guestHasLoginPrompt);
    record('Guest -> No Admin Metrics Rendered', guestNoMetrics);
    record('Guest -> Zero Admin API Network Calls Made', guestAdminCallsCount === 0, `Calls: ${guestAdminCallsCount}`);
    record('Guest -> No /admin link in Navbar or Footer', guestAdminLinksInDom === 0, `Found: ${guestAdminLinksInDom}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_guest_admin_denied.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // TEST 2: USER -> /admin = DENIED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: USER Member Access Control (/admin) ---');
    const memberToken = await getJwtToken('09120000003');
    adminApiCalls = [];
    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), memberToken);

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    const userPageText = await page.evaluate(() => document.body.innerText);
    const userHasDeniedState = userPageText.includes('دسترسی غیرمجاز به پنل مدیریت');
    const userNoMetrics = !userPageText.includes('کاربران کل') && !userPageText.includes('مجموع درآمد ناخالص');
    const userAdminCallsCount = adminApiCalls.length;

    const userAdminLinksInDom = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.filter(a => a.getAttribute('href') === '/admin').length;
    });

    record('USER -> Shows Access Denied EmptyState', userHasDeniedState);
    record('USER -> No Admin Metrics or Management Rendered', userNoMetrics);
    record('USER -> Zero Admin API Network Calls Made', userAdminCallsCount === 0, `Calls: ${userAdminCallsCount}`);
    record('USER -> No /admin link in Navbar or Footer', userAdminLinksInDom === 0, `Found: ${userAdminLinksInDom}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_user_admin_denied.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // TEST 3: GYM_STAFF -> /admin = DENIED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: GYM_STAFF Access Control (/admin) ---');
    const staffToken = await getJwtToken('09120000002');
    adminApiCalls = [];
    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), staffToken);

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    const staffAdminPageText = await page.evaluate(() => document.body.innerText);
    const staffHasDeniedState = staffAdminPageText.includes('دسترسی غیرمجاز به پنل مدیریت');
    const staffHasReceptionFallbackBtn = staffAdminPageText.includes('کانتر پذیرش');
    const staffNoMetrics = !staffAdminPageText.includes('کاربران کل') && !staffAdminPageText.includes('مجموع درآمد ناخالص');
    const staffAdminCallsCount = adminApiCalls.length;

    const staffAdminLinksInDom = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.filter(a => a.getAttribute('href') === '/admin').length;
    });

    const staffReceptionLinksInDom = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.filter(a => a.getAttribute('href') === '/reception').length;
    });

    record('GYM_STAFF -> /admin Shows Access Denied EmptyState', staffHasDeniedState);
    record('GYM_STAFF -> /admin Provides Link to Reception', staffHasReceptionFallbackBtn);
    record('GYM_STAFF -> No Admin Metrics Rendered', staffNoMetrics);
    record('GYM_STAFF -> Zero Admin API Network Calls Made', staffAdminCallsCount === 0, `Calls: ${staffAdminCallsCount}`);
    record('GYM_STAFF -> No /admin link in Navigation or Footer', staffAdminLinksInDom === 0, `Found: ${staffAdminLinksInDom}`);
    record('GYM_STAFF -> Has /reception link in Navigation and Footer', staffReceptionLinksInDom >= 1, `Found: ${staffReceptionLinksInDom}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_staff_admin_denied.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // TEST 4: GYM_STAFF -> /reception = ALLOWED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: GYM_STAFF Access Control (/reception) ---');
    await page.goto(`${WEB_BASE}/reception`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    const staffReceptionText = await page.evaluate(() => document.body.innerText);
    const staffReceptionAllowed = staffReceptionText.includes('کانتر هوشمند پذیرش باشگاه') || staffReceptionText.includes('ثبت ورود و تایید هویت') || staffReceptionText.includes('ثبت ورود و تأیید هویت');
    const staffReceptionHasInput = await page.evaluate(() => !!document.querySelector('textarea, input[type="text"]'));

    record('GYM_STAFF -> /reception Renders Terminal Successfully', staffReceptionAllowed);
    record('GYM_STAFF -> /reception Has QR Scanner / Token Input Field', staffReceptionHasInput);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_staff_reception_allowed.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // TEST 5: ADMIN -> /admin = ALLOWED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: ADMIN Access Control (/admin) ---');
    const adminToken = await getJwtToken('09120000005');
    adminApiCalls = [];
    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), adminToken);

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    const adminPageText = await page.evaluate(() => document.body.innerText);
    const adminDashboardLoaded = adminPageText.includes('پنل نظارت و مدیریت اقتصاد پلتفرم') || adminPageText.includes('مدیریت اقتصاد');
    const adminHasMetrics = adminPageText.includes('Gross Revenue') && adminPageText.includes('Payable Liabilities');
    const adminHasGymMgmt = adminPageText.includes('موتور تنظیم تعرفه و آزمون محدودیت طلایی');

    const adminAdminLinksInDom = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.filter(a => a.getAttribute('href') === '/admin').length;
    });

    record('ADMIN -> /admin Dashboard Fully Loaded', adminDashboardLoaded);
    record('ADMIN -> /admin Shows Operational & Economic Metrics', adminHasMetrics);
    record('ADMIN -> /admin Shows Gym Management & Golden Bounding', adminHasGymMgmt);
    record('ADMIN -> Has /admin link in Navbar and Footer', adminAdminLinksInDom >= 1, `Found: ${adminAdminLinksInDom}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_admin_dashboard_allowed.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // TEST 6: SUPER_ADMIN -> /admin = ALLOWED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: SUPER_ADMIN Access Control (/admin) ---');
    const superAdminToken = await getJwtToken('09120000001');
    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), superAdminToken);

    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    const superAdminPageText = await page.evaluate(() => document.body.innerText);
    const superAdminDashboardLoaded = superAdminPageText.includes('پنل نظارت و مدیریت اقتصاد پلتفرم') || superAdminPageText.includes('مدیریت اقتصاد');
    const superAdminHasMetrics = superAdminPageText.includes('Gross Revenue') && superAdminPageText.includes('Payable Liabilities');

    record('SUPER_ADMIN -> /admin Dashboard Fully Loaded', superAdminDashboardLoaded);
    record('SUPER_ADMIN -> /admin Shows Operational & Economic Metrics', superAdminHasMetrics);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_superadmin_dashboard_allowed.png'), fullPage: false });

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    const allPassed = testResults.every(r => r.passed);
    console.log(`TOTAL BROWSER SCENARIOS TESTED: ${testResults.length}`);
    console.log(`PASSED: ${testResults.filter(r => r.passed).length}`);
    console.log(`FAILED: ${testResults.filter(r => !r.passed).length}`);
    console.log(`RESULT: ${allPassed ? 'ALL BROWSER E2E TESTS PASSED 100%' : 'FAILURES DETECTED'}`);
    console.log('====================================================\n');

    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error running browser RBAC verification:', err);
  process.exit(1);
});
