import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\full_audit_qa';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function runFullAudit() {
  console.log('\n================ FULL UI/UX + ROLE-BASED QA AUDIT ================');
  const BASE_URL = 'http://localhost:3000';
  const API_URL = 'http://localhost:4000/api/v1';

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

  async function getAuthToken(phoneNumber) {
    const sendRes = await fetch(`${API_URL}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber })
    });
    const sendData = await sendRes.json();
    const code = sendData.debugCode || '12345';

    const verifyRes = await fetch(`${API_URL}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code })
    });
    const verifyData = await verifyRes.json();
    return { token: verifyData.accessToken, user: verifyData.user };
  }

  console.log('1. Provisioning sessions for Member, Staff, Admin...');
  const memberAuth = await getAuthToken('09120000003');
  const staffAuth = await getAuthToken('09120000002');
  const adminAuth = await getAuthToken('09120000001');

  let testFailures = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      testFailures++;
    } else {
      console.log(`✅ PASSED: ${message}`);
    }
  }

  // ========================================================
  // 1. GUEST AUDIT ACROSS ALL PROTECTED ROUTES
  // ========================================================
  console.log('\n--- SECTION 1: Guest Access on Protected Routes ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());

  // A. Guest on /account
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  let text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('ورود به حساب کاربری'), 'Guest on /account sees login required EmptyState');
  assert(!text.includes('حساب فعال') && !text.includes('کد ملی:'), 'Guest on /account does NOT leak profile or active account status');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'guest_account_denial.png') });

  // B. Guest on /reception
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('ورود به کانتر پذیرش باشگاه'), 'Guest on /reception sees staff login required EmptyState');
  const hasTextarea = await page.$('textarea');
  assert(!hasTextarea, 'Guest on /reception does NOT see QR scanner input form');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'guest_reception_denial.png') });

  // C. Guest on /admin
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('ورود به پنل مدیریت گراویتی'), 'Guest on /admin sees admin login required EmptyState');
  const hasPricingSelect = await page.$('select');
  assert(!hasPricingSelect, 'Guest on /admin does NOT see pricing override controls');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'guest_admin_denial.png') });

  // D. Guest on /gyms/[id] (Verify single Navbar, no double header)
  await page.goto(`${BASE_URL}/gyms/gym-basic-1`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  const navbarsCount = await page.$$eval('header', els => els.length);
  assert(navbarsCount === 1, `Gym detail page has exactly 1 header/navbar (found: ${navbarsCount})`);
  const hasFooter = await page.$$eval('footer', els => els.length);
  assert(hasFooter === 1, 'Gym detail page renders platform footer');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gym_detail_single_navbar.png') });

  // ========================================================
  // 2. MEMBER AUDIT ACROSS STAFF & ADMIN ROUTES
  // ========================================================
  console.log('\n--- SECTION 2: Member Access on Staff & Admin Routes ---');
  await page.evaluate((tok) => {
    localStorage.setItem('gym_app_token', tok);
  }, memberAuth.token);

  // A. Member on /account (Should see full wallet and membership)
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('حساب کاربری و کیف پول') || text.includes('عضویت ورزشی گراویتی'), 'Member on /account sees full account dashboard');

  // B. Member on /reception (Should be strictly DENIED)
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('دسترسی غیرمجاز به کانتر پذیرش'), 'Member on /reception sees Access Denied screen');
  const memberScanner = await page.$('textarea');
  assert(!memberScanner, 'Member on /reception is strictly blocked from scanner terminal');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'member_reception_denied.png') });

  // C. Member on /admin (Should be strictly DENIED)
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('دسترسی غیرمجاز به پنل مدیریت'), 'Member on /admin sees Access Denied screen');
  const memberAdminSelect = await page.$('select');
  assert(!memberAdminSelect, 'Member on /admin is strictly blocked from pricing engine');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'member_admin_denied.png') });

  // ========================================================
  // 3. STAFF AUDIT ON RECEPTION & ADMIN
  // ========================================================
  console.log('\n--- SECTION 3: Gym Staff Access on Reception & Admin ---');
  await page.evaluate((tok) => {
    localStorage.setItem('gym_app_token', tok);
  }, staffAuth.token);

  // A. Staff on /reception (Should be ALLOWED)
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('کانتر هوشمند پذیرش باشگاه') && text.includes('اسکن بارکد عضویت'), 'Staff on /reception sees operational scanner terminal');
  const staffScanner = await page.$('textarea');
  assert(!!staffScanner, 'Staff on /reception has active QR input field');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'staff_reception_active.png') });

  // B. Staff on /admin (Should be strictly DENIED)
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('دسترسی غیرمجاز به پنل مدیریت'), 'Staff on /admin sees Access Denied screen');
  const staffAdminSelect = await page.$('select');
  assert(!staffAdminSelect, 'Staff on /admin is strictly blocked from pricing engine');

  // ========================================================
  // 4. ADMIN AUDIT ON ADMIN & RECEPTION
  // ========================================================
  console.log('\n--- SECTION 4: Super Admin Access on Admin & Reception ---');
  await page.evaluate((tok) => {
    localStorage.setItem('gym_app_token', tok);
  }, adminAuth.token);

  // A. Admin on /admin (Should be ALLOWED)
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('پنل نظارت و مدیریت اقتصاد پلتفرم') && text.includes('موتور تنظیم تعرفه'), 'Admin on /admin sees full management dashboard');
  const adminPricingSelect = await page.$('select');
  assert(!!adminPricingSelect, 'Admin on /admin has pricing override selector');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_dashboard_active.png') });

  // B. Admin on /reception (Super Admin allowed operational inspection)
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    return document.body.innerText.includes('کانتر هوشمند پذیرش باشگاه');
  }, { timeout: 8000 });
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('کانتر هوشمند پذیرش باشگاه'), 'Admin on /reception can access counter terminal');

  // ========================================================
  // 5. RESPONSIVE VIEWPORT TESTING (390, 430, 768, 1440)
  // ========================================================
  console.log('\n--- SECTION 5: Responsive Viewport Testing ---');
  const viewports = [
    { name: 'Mobile 390x844', width: 390, height: 844 },
    { name: 'Mobile 430x932', width: 430, height: 932 },
    { name: 'Tablet 768x1024', width: 768, height: 1024 },
    { name: 'Desktop 1440x900', width: 1440, height: 900 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));

    // Check horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflow, `${vp.name}: No horizontal overflow on homepage`);
  }

  // Tablet Screenshot
  await page.setViewport({ width: 768, height: 1024 });
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'responsive_tablet_768.png') });

  // ========================================================
  // 6. LOGOUT AND TOKEN EXPIRY TRANSITION TEST
  // ========================================================
  console.log('\n--- SECTION 6: Logout and Expiry Transition ---');
  // Admin logs out
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  const logoutBtn = await page.$('button[title*="خروج"]');
  if (logoutBtn) {
    await logoutBtn.click();
    await new Promise(r => setTimeout(r, 500));
  }

  const postLogoutToken = await page.evaluate(() => localStorage.getItem('gym_app_token'));
  assert(!postLogoutToken, 'Logout immediately purges gym_app_token from localStorage');

  // Verify back button / direct navigation does not restore privileged state
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('ورود به پنل مدیریت گراویتی'), 'Post-logout navigation to /admin immediately requires authentication');

  // Simulated Invalid Token
  await page.evaluate(() => localStorage.setItem('gym_app_token', 'INVALID.EXPIRED.JWT.TOKEN'));
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  const purgedToken = await page.evaluate(() => localStorage.getItem('gym_app_token'));
  assert(!purgedToken, 'Invalid/expired token is automatically purged on initial fetchProfile failure');
  text = await page.evaluate(() => document.body.innerText);
  assert(text.includes('ورود به حساب کاربری'), 'Invalid token falls back cleanly to unauthenticated state');

  await browser.close();

  console.log(`\n================ AUDIT SUMMARY: ${testFailures === 0 ? 'ALL PASSED ✅' : `${testFailures} FAILURES ❌`} ================`);
  if (testFailures > 0) {
    process.exit(1);
  }
}

runFullAudit().catch(err => {
  console.error('Fatal error during full audit execution:', err);
  process.exit(1);
});
