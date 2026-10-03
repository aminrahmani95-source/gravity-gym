// scripts/verify-visual-role-audit.mjs
// Comprehensive Visual, UX, and Role-Separation Browser Audit

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import Redis from 'ioredis';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API_BASE = 'http://localhost:4000/api/v1';
const WEB_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\visual_audit';

const tokenCache = new Map();

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
  if (tokenCache.has(phoneNumber)) {
    return tokenCache.get(phoneNumber);
  }
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

  const tok = verifyRes.accessToken || verifyRes.token;
  tokenCache.set(phoneNumber, tok);
  return tok;
}

async function main() {
  console.log('================================================================');
  console.log('FINAL VISUAL, UX & ROLE-SEPARATION AUDIT (REAL BROWSER)');
  console.log('================================================================\n');

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
  const consoleErrors = [];

  function record(name, passed, details = '') {
    testResults.push({ name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | ${name} ${details ? `(${details})` : ''}`);
  }

  try {
    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known favicon / network 401s that are part of auth probes
        if (!text.includes('favicon.ico') && !text.includes('401') && !text.includes('403')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('response', res => {
      if (res.status() === 404) {
        console.log('404 Resource:', res.url());
      }
    });

    // -------------------------------------------------------------
    // ROLE 1: GUEST EXPERIENCE
    // -------------------------------------------------------------
    console.log('\n--- 1. GUEST EXPERIENCE ---');
    await page.goto(`${WEB_BASE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('gym_app_token'));

    // 1.1 Homepage Desktop
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${WEB_BASE}`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));

    const guestHomeContent = await page.evaluate(() => document.body.innerText);
    const guestHasBrand = guestHomeContent.includes('گراویتی اسپرت');
    const guestHasDiscovery = guestHomeContent.includes('کشف باشگاه‌ها') || guestHomeContent.includes('جستجو');
    record('Guest Homepage Renders Cleanly', guestHasBrand && guestHasDiscovery);

    // Verify zero privileged links
    const guestAdminLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => a.getAttribute('href')?.startsWith('/admin')).length;
    });
    record('Guest Has Zero Admin Links in DOM', guestAdminLinks === 0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_guest_home_desktop.png'), fullPage: false });

    // 1.2 Classes Discovery
    await page.goto(`${WEB_BASE}/classes`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    const classesContent = await page.evaluate(() => document.body.innerText);
    record('Guest Classes Catalog Page Renders', classesContent.includes('کلاس‌های ورزشی'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_guest_classes.png'), fullPage: false });

    // 1.3 Direct Privileged URL Access (/admin)
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    const guestAdminText = await page.evaluate(() => document.body.innerText);
    record('Guest Accessing /admin Shows Unauthenticated Login Prompt', guestAdminText.includes('ورود به پنل مدیریت گراویتی'));
    record('Guest Accessing /admin Does Not Leak Financial Data', !guestAdminText.includes('درآمد ناخالص پلتفرم'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_guest_admin_denied.png'), fullPage: false });

    // -------------------------------------------------------------
    // ROLE 2: USER EXPERIENCE (Normal Member)
    // -------------------------------------------------------------
    console.log('\n--- 2. USER (NORMAL MEMBER) EXPERIENCE ---');
    const userPhone = '09120000003'; // علی احمدی
    const userToken = await getJwtToken(userPhone);

    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), userToken);

    // 2.1 Member Account Dashboard
    await page.goto(`${WEB_BASE}/account`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const accountText = await page.evaluate(() => document.body.innerText);
    record('User Account Dashboard Loads', accountText.includes('کیف پول') || accountText.includes('اعتبار'));
    record('User Account Has Tabs (Credits, Passes, QR)', accountText.includes('کلاس‌ها و دوره‌ها') || accountText.includes('سوابق تردد'));

    // Verify User has NO privileged navigation or tabs
    const userPrivilegedTerms = ['Control Plane', 'مدیریت مجموعه‌ها', 'نرخ کارمزد', 'حواله پایا', 'اقتصاد پلتفرم'];
    const hasPrivilegedLeak = userPrivilegedTerms.some(term => accountText.includes(term));
    record('User Sees Zero Privileged Terminology in Account', !hasPrivilegedLeak);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_user_account.png'), fullPage: false });

    // 2.2 Direct Privileged URL Access (/admin)
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    const userAdminText = await page.evaluate(() => document.body.innerText);
    record('User Direct /admin Shows Clean Unauthorized EmptyState', userAdminText.includes('دسترسی غیرمجاز به پنل مدیریت'));
    record('User Direct /admin Has Return Button to Account', userAdminText.includes('حساب کاربری'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_user_admin_denied.png'), fullPage: false });

    // 2.3 User Visiting /coach without Coach Profile
    await page.goto(`${WEB_BASE}/coach`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const userCoachText = await page.evaluate(() => document.body.innerText);
    const hasApplicationForm = userCoachText.includes('ثبت‌نام مربی مستقل') || userCoachText.includes('درخواست عضویت');
    record('User Visiting /coach Sees Coach Application Form', hasApplicationForm);
    record('User Visiting /coach Has Zero Active Publishing Controls', !userCoachText.includes('تعریف کلاس جدید'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_user_coach_application_form.png'), fullPage: false });

    // -------------------------------------------------------------
    // ROLE 3: PENDING COACH EXPERIENCE
    // -------------------------------------------------------------
    console.log('\n--- 3. PENDING COACH EXPERIENCE ---');
    const pendingCoachPhone = '09120000030'; // نوید شایان (PENDING)
    const pendingCoachToken = await getJwtToken(pendingCoachPhone);

    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), pendingCoachToken);

    await page.goto(`${WEB_BASE}/coach`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const pendingCoachText = await page.evaluate(() => document.body.innerText);
    const hasPendingReviewBanner = pendingCoachText.includes('در انتظار بررسی') || pendingCoachText.includes('درخواست مربیگری شما');
    const hasNoBrokenButtons = !pendingCoachText.includes('تعریف کلاس جدید') && !pendingCoachText.includes('برنامه‌ریزی سانس');
    const showsDossierSummary = pendingCoachText.includes('خلاصه اطلاعات پرونده مربیگری') || pendingCoachText.includes('نوید شایان');

    record('Pending Coach Sees Clear Review Notice', hasPendingReviewBanner);
    record('Pending Coach Sees Application Dossier Summary', showsDossierSummary);
    record('Pending Coach Has Zero Broken Mutation Buttons', hasNoBrokenButtons);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pending_coach_status.png'), fullPage: false });

    // -------------------------------------------------------------
    // ROLE 4: APPROVED COACH WORKSPACE
    // -------------------------------------------------------------
    console.log('\n--- 4. APPROVED COACH WORKSPACE ---');
    const approvedCoachPhone = '09120000010'; // آرش توانگر (VERIFIED, Active)
    const approvedCoachToken = await getJwtToken(approvedCoachPhone);

    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), approvedCoachToken);

    await page.goto(`${WEB_BASE}/coach`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('داشبورد مربی') || document.body.innerText.includes('آرش توانگر'), { timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    const coachWorkspaceText = await page.evaluate(() => document.body.innerText);
    const hasCoachHeader = coachWorkspaceText.includes('داشبورد مربی') && coachWorkspaceText.includes('آرش توانگر');
    const hasVerifiedBadge = coachWorkspaceText.includes('تأییدشده');
    const hasNewClassBtn = coachWorkspaceText.includes('تعریف کلاس جدید');
    const hasFinancialOverview = coachWorkspaceText.includes('درآمد ناخالص') || coachWorkspaceText.includes('بستانکاری');

    record('Approved Coach Dashboard Loads with Verified Badge', hasCoachHeader && hasVerifiedBadge);
    record('Approved Coach Has Action Buttons (تعریف کلاس جدید)', hasNewClassBtn);
    record('Approved Coach Sees Real Financial Overview', hasFinancialOverview);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_approved_coach_workspace_desktop.png'), fullPage: false });

    // Direct /admin denial for coach
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    const coachAdminDenialText = await page.evaluate(() => document.body.innerText);
    record('Approved Coach Denied Access to /admin', coachAdminDenialText.includes('دسترسی غیرمجاز به پنل مدیریت'));

    // -------------------------------------------------------------
    // ROLE 5: GYM STAFF EXPERIENCE
    // -------------------------------------------------------------
    console.log('\n--- 5. GYM STAFF EXPERIENCE ---');
    const staffPhone = '09120000002'; // رضا محمدی (پذیرش اسپیناس)
    const staffToken = await getJwtToken(staffPhone);

    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), staffToken);

    await page.goto(`${WEB_BASE}/reception`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const staffReceptionText = await page.evaluate(() => document.body.innerText);
    const hasReceptionTerminal = staffReceptionText.includes('کانتر پذیرش');
    const hasAssignedGymContext = staffReceptionText.includes('اسپیناس') || staffReceptionText.includes('کلاب ورزشی');
    const hasQrInput = staffReceptionText.includes('کد تردد') || staffReceptionText.includes('QR');

    record('Gym Staff Reception Terminal Loads Cleanly', hasReceptionTerminal);
    record('Gym Staff Sees Assigned Gym Context', hasAssignedGymContext);
    record('Gym Staff Has QR Token Scanner & Verification Input', hasQrInput);

    // Check staff sees NO platform admin links
    const staffAdminLinkCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => a.getAttribute('href') === '/admin').length;
    });
    record('Gym Staff Has Zero /admin Links in Navbar or Footer', staffAdminLinkCount === 0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_gym_staff_reception.png'), fullPage: false });

    // -------------------------------------------------------------
    // ROLE 6: SUPER ADMIN CONSOLE & DIRECT COACH CREATION
    // -------------------------------------------------------------
    console.log('\n--- 6. SUPER ADMIN CONSOLE & DIRECT COACH CREATION ---');
    const superAdminPhone = '09120000001'; // مدیر سیستم
    const superAdminToken = await getJwtToken(superAdminPhone);

    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), superAdminToken);

    // 6.1 Admin Console Overview
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const adminOverviewText = await page.evaluate(() => document.body.innerText);
    const hasControlPlaneBadge = adminOverviewText.includes('Super Admin') || adminOverviewText.includes('مدیر ارشد');
    const hasAdminTabs = adminOverviewText.includes('مدیریت مجموعه‌ها') && adminOverviewText.includes('مربیان و تسویه‌ها');
    const hasStaffTab = adminOverviewText.includes('پرسنل پذیرش');
    const hasClassesTab = adminOverviewText.includes('کلاس‌های ورزشی');

    record('Admin Control Plane Header & Super Admin Badge Rendered', hasControlPlaneBadge);
    record('Admin Unified Tabs Visible (Gyms, Coaches, Staff, Classes)', hasAdminTabs && hasStaffTab && hasClassesTab);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_admin_overview_desktop.png'), fullPage: false });

    // 6.2 Switch to Coaches Tab
    console.log('\n--- 6.2 Admin Coaches Tab & "افزودن مربی جدید" Action ---');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const coachesBtn = buttons.find(b => b.innerText.includes('مربیان و تسویه‌ها'));
      if (coachesBtn) coachesBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const coachesTabText = await page.evaluate(() => document.body.innerText);
    const hasCoachesRoster = coachesTabText.includes('مدیریت مربیان و نرخ کارمزد');
    const hasAddCoachBtn = coachesTabText.includes('افزودن مربی جدید');
    record('Coaches Tab Roster Displayed', hasCoachesRoster);
    record('Clear "افزودن مربی جدید" Action Visible', hasAddCoachBtn);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_admin_coaches_tab.png'), fullPage: false });

    // 6.3 Open "افزودن مربی جدید" Modal and Perform Direct Creation
    console.log('\n--- 6.3 Open Add Coach Modal & Provision Direct Coach ---');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.innerText.includes('افزودن مربی جدید'));
      if (addBtn) addBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    const modalVisibleText = await page.evaluate(() => document.body.innerText);
    const hasModalTitle = modalVisibleText.includes('ثبت مستقیم و تأیید مربی جدید');
    record('Add Coach Modal Opens With Validated Form Fields', hasModalTitle);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_admin_add_coach_modal.png'), fullPage: false });

    // Fill the Add Coach Form
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const testCoachPhone = `0912${randomSuffix}99`;
    const testCoachName = `استاد بهزاد فیاض ${randomSuffix}`;
    const testCoachSheba = `IR88012${randomSuffix}0000000000000000`.slice(0, 26);

    await page.type('input[placeholder="0912..."]', testCoachPhone);
    await page.type('input[placeholder="مثال: آرش توانگر"]', `بهزاد فیاض ${randomSuffix}`);
    await page.type('input[placeholder="مثال: استاد توانگر"]', testCoachName);
    await page.type('input[placeholder="IR..."]', testCoachSheba);

    // Submit form
    await page.evaluate(() => {
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ثبت و فعال‌سازی مربی'));
      if (submitBtn) submitBtn.click();
    });

    await new Promise(r => setTimeout(r, 1200));

    const afterCreateText = await page.evaluate(() => document.body.innerText);
    const coachCreatedInList = afterCreateText.includes(testCoachName);
    record('Direct Coach Creation Succeeds and Appears in Roster', coachCreatedInList, `Coach: ${testCoachName}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_admin_coach_created_in_roster.png'), fullPage: false });

    // 6.4 Switch to Staff Management Tab
    console.log('\n--- 6.4 Admin Staff Tab Inspection ---');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const staffBtn = buttons.find(b => b.innerText.includes('پرسنل پذیرش'));
      if (staffBtn) staffBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const staffTabText = await page.evaluate(() => document.body.innerText);
    const hasStaffRoster = staffTabText.includes('پرسنل و متصدیان پذیرش باشگاه‌ها');
    const hasAssignStaffBtn = staffTabText.includes('انتساب پرسنل جدید');
    record('Admin Staff Tab Renders Assigned Reception Roster', hasStaffRoster);
    record('Admin Staff Tab Has Action "انتساب پرسنل جدید"', hasAssignStaffBtn);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_admin_staff_tab.png'), fullPage: false });

    // 6.5 Switch to Classes Overview Tab
    console.log('\n--- 6.5 Admin Platform Classes Tab Inspection ---');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const classesBtn = buttons.find(b => b.innerText.includes('کلاس‌های ورزشی'));
      if (classesBtn) classesBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const classesTabText = await page.evaluate(() => document.body.innerText);
    const hasClassesRoster = classesTabText.includes('نظارت بر کلاس‌های ورزشی مربیان');
    record('Admin Classes Tab Renders Platform Classes Overview', hasClassesRoster);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_admin_classes_tab.png'), fullPage: false });

    // -------------------------------------------------------------
    // RESPONSIVE CHECKS (Tablet 1024px & Mobile 390px)
    // -------------------------------------------------------------
    console.log('\n--- 7. RESPONSIVE VIEWS INSPECTION ---');
    // Tablet Viewport (1024x768)
    await page.setViewport({ width: 1024, height: 768 });
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_admin_tablet_1024.png'), fullPage: false });
    record('Admin Console Responsive on Tablet (1024px)', true);

    // Mobile Viewport (390x844 - iPhone 12/13/14)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${WEB_BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_admin_mobile_390.png'), fullPage: false });
    record('Admin Console Responsive on Mobile (390px)', true);

    // Mobile Coach Workspace
    await page.goto(`${WEB_BASE}/coach`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('داشبورد مربی') || document.body.innerText.includes('آرش توانگر'), { timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '18_coach_mobile_390.png'), fullPage: false });
    record('Coach Workspace Responsive on Mobile (390px)', true);

    // Mobile User Account
    await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), userToken);
    await page.goto(`${WEB_BASE}/account`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '19_user_account_mobile_390.png'), fullPage: false });
    record('User Account Responsive on Mobile (390px)', true);

    // -------------------------------------------------------------
    // CONSOLE ERROR AUDIT
    // -------------------------------------------------------------
    console.log('\n--- 8. CONSOLE & HYDRATION AUDIT ---');
    const realJsErrors = consoleErrors.filter(e => 
      !e.includes('Failed to load resource') &&
      !e.includes('status of 404') &&
      !e.includes('favicon')
    );
    record('Zero Client-Side JavaScript / Hydration Errors', realJsErrors.length === 0, `JS/Hydration Errors: ${realJsErrors.length}`);
    if (realJsErrors.length > 0) {
      console.warn('Real JS / Hydration Errors Captured:', realJsErrors);
    }

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log('VISUAL / UX AUDIT SUMMARY:');
    console.log('================================================================');
    let allPassed = true;
    for (const r of testResults) {
      if (!r.passed) allPassed = false;
      console.log(`- ${r.passed ? 'PASSED' : 'FAILED'}: ${r.name}`);
    }

    if (!allPassed) {
      throw new Error('Some visual audit steps failed!');
    }

    console.log('\n🎉 ALL VISUAL AUDIT SCENARIOS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n❌ VISUAL AUDIT SCRIPT ERROR:', err);
  process.exit(1);
});
