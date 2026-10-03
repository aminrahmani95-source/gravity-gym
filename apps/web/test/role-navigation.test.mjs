import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\role_nav_qa';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function runRoleNavTests() {
  console.log('\n================ ROLE-BASED NAVIGATION AUTOMATED BROWSER QA ================');
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

  // Provision sessions
  console.log('1. Provisioning authenticated sessions for Member, Staff, Admin...');
  const memberAuth = await getAuthToken('09120000003');
  const staffAuth = await getAuthToken('09120000002');
  const adminAuth = await getAuthToken('09120000001');

  console.log(`   - Member: ${memberAuth.user.phoneNumber} (${memberAuth.user.role})`);
  console.log(`   - Staff:  ${staffAuth.user.phoneNumber} (${staffAuth.user.role})`);
  console.log(`   - Admin:  ${adminAuth.user.phoneNumber} (${adminAuth.user.role})`);

  let testFailures = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      testFailures++;
    } else {
      console.log(`✅ PASSED: ${message}`);
    }
  }

  // Helper to inspect visible links
  async function inspectNavLinks() {
    return await page.evaluate(() => {
      // Desktop nav links (header nav)
      const desktopNav = document.querySelector('header nav');
      const desktopHrefs = desktopNav ? Array.from(desktopNav.querySelectorAll('a')).map(a => a.getAttribute('href')) : [];
      const desktopLabels = desktopNav ? Array.from(desktopNav.querySelectorAll('a')).map(a => a.innerText.trim()) : [];

      // Mobile bottom nav
      const mobileNav = document.querySelector('nav.md\\:hidden');
      const mobileHrefs = mobileNav ? Array.from(mobileNav.querySelectorAll('a, button')).map(el => el.getAttribute('href') || '#login-btn') : [];
      const mobileLabels = mobileNav ? Array.from(mobileNav.querySelectorAll('a, button')).map(el => el.innerText.trim()) : [];

      // Footer links
      const footer = document.querySelector('footer');
      const footerHrefs = footer ? Array.from(footer.querySelectorAll('a')).map(a => a.getAttribute('href')) : [];

      return {
        desktopHrefs,
        desktopLabels,
        mobileHrefs,
        mobileLabels,
        footerHrefs
      };
    });
  }

  // ========================================================
  // TEST SCENARIO 1: GUEST / UNAUTHENTICATED
  // ========================================================
  console.log('\n--- SCENARIO 1: Guest / Unauthenticated ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  let links = await inspectNavLinks();
  console.log('Guest Desktop Hrefs:', links.desktopHrefs);
  console.log('Guest Desktop Labels:', links.desktopLabels);
  console.log('Guest Footer Hrefs:', links.footerHrefs);

  assert(!links.desktopHrefs.includes('/admin'), 'Guest Desktop Nav must NOT contain /admin');
  assert(!links.desktopHrefs.includes('/reception'), 'Guest Desktop Nav must NOT contain /reception');
  assert(!links.desktopHrefs.includes('/account'), 'Guest Desktop Nav must NOT contain /account');
  assert(links.desktopHrefs.includes('/') && links.desktopHrefs.includes('/plans'), 'Guest Desktop Nav contains / and /plans');

  assert(!links.footerHrefs.includes('/admin'), 'Guest Footer must NOT contain /admin');
  assert(!links.footerHrefs.includes('/reception'), 'Guest Footer must NOT contain /reception');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'guest_desktop_1440.png'), fullPage: false });

  // Mobile 430px view
  await page.setViewport({ width: 430, height: 932 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  links = await inspectNavLinks();
  console.log('Guest Mobile (430) Hrefs:', links.mobileHrefs);

  assert(!links.mobileHrefs.includes('/admin'), 'Guest Mobile Nav (430) must NOT contain /admin');
  assert(!links.mobileHrefs.includes('/reception'), 'Guest Mobile Nav (430) must NOT contain /reception');
  assert(!links.mobileHrefs.includes('/account'), 'Guest Mobile Nav (430) must NOT contain /account');
  assert(links.mobileHrefs.includes('#login') || links.mobileHrefs.includes('#login-btn'), 'Guest Mobile Nav has login trigger');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'guest_mobile_430.png'), fullPage: false });

  // Mobile 390px view
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  links = await inspectNavLinks();
  console.log('Guest Mobile (390) Hrefs:', links.mobileHrefs);

  assert(!links.mobileHrefs.includes('/admin'), 'Guest Mobile Nav (390) must NOT contain /admin');
  assert(!links.mobileHrefs.includes('/reception'), 'Guest Mobile Nav (390) must NOT contain /reception');
  assert(!links.mobileHrefs.includes('/account'), 'Guest Mobile Nav (390) must NOT contain /account');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'guest_mobile_390.png'), fullPage: false });

  // ========================================================
  // TEST SCENARIO 2: ATHLETE / MEMBER (UserRole.USER)
  // ========================================================
  console.log('\n--- SCENARIO 2: Authenticated Member (UserRole.USER) ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate((tok) => {
    localStorage.setItem('gym_app_token', tok);
  }, memberAuth.token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  links = await inspectNavLinks();
  console.log('Member Desktop Hrefs:', links.desktopHrefs);
  console.log('Member Desktop Labels:', links.desktopLabels);
  console.log('Member Footer Hrefs:', links.footerHrefs);

  assert(!links.desktopHrefs.includes('/admin'), 'Member Desktop Nav must NOT contain /admin');
  assert(!links.desktopHrefs.includes('/reception'), 'Member Desktop Nav must NOT contain /reception');
  assert(links.desktopHrefs.includes('/account'), 'Member Desktop Nav MUST contain /account');
  assert(links.desktopHrefs.includes('/') && links.desktopHrefs.includes('/plans'), 'Member Desktop Nav contains / and /plans');

  assert(!links.footerHrefs.includes('/admin'), 'Member Footer must NOT contain /admin');
  assert(!links.footerHrefs.includes('/reception'), 'Member Footer must NOT contain /reception');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'member_desktop_1440.png'), fullPage: false });

  // Member Mobile 390px
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  links = await inspectNavLinks();
  console.log('Member Mobile (390) Hrefs:', links.mobileHrefs);

  assert(!links.mobileHrefs.includes('/admin'), 'Member Mobile Nav (390) must NOT contain /admin');
  assert(!links.mobileHrefs.includes('/reception'), 'Member Mobile Nav (390) must NOT contain /reception');
  assert(links.mobileHrefs.includes('/account'), 'Member Mobile Nav (390) MUST contain /account');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'member_mobile_390.png'), fullPage: false });

  // ========================================================
  // TEST SCENARIO 3: GYM STAFF (UserRole.GYM_STAFF)
  // ========================================================
  console.log('\n--- SCENARIO 3: Gym Staff (UserRole.GYM_STAFF) ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate((tok) => {
    localStorage.setItem('gym_app_token', tok);
  }, staffAuth.token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  links = await inspectNavLinks();
  console.log('Staff Desktop Hrefs:', links.desktopHrefs);
  console.log('Staff Footer Hrefs:', links.footerHrefs);

  assert(links.desktopHrefs.includes('/reception'), 'Staff Desktop Nav MUST contain /reception');
  assert(!links.desktopHrefs.includes('/admin'), 'Staff Desktop Nav must NOT contain /admin');
  assert(links.desktopHrefs.includes('/account'), 'Staff Desktop Nav contains /account');

  assert(links.footerHrefs.includes('/reception'), 'Staff Footer MUST contain /reception');
  assert(!links.footerHrefs.includes('/admin'), 'Staff Footer must NOT contain /admin');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'staff_desktop_1440.png'), fullPage: false });

  // ========================================================
  // TEST SCENARIO 4: SUPER ADMIN (UserRole.SUPER_ADMIN)
  // ========================================================
  console.log('\n--- SCENARIO 4: Super Admin (UserRole.SUPER_ADMIN) ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate((tok) => {
    localStorage.setItem('gym_app_token', tok);
  }, adminAuth.token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  links = await inspectNavLinks();
  console.log('Admin Desktop Hrefs:', links.desktopHrefs);
  console.log('Admin Footer Hrefs:', links.footerHrefs);

  assert(links.desktopHrefs.includes('/admin'), 'Admin Desktop Nav MUST contain /admin');
  assert(links.desktopHrefs.includes('/reception'), 'Admin Desktop Nav MUST contain /reception');
  assert(links.desktopHrefs.includes('/account'), 'Admin Desktop Nav MUST contain /account');

  assert(links.footerHrefs.includes('/admin'), 'Admin Footer MUST contain /admin');
  assert(links.footerHrefs.includes('/reception'), 'Admin Footer MUST contain /reception');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin_desktop_1440.png'), fullPage: false });

  // ========================================================
  // TEST SCENARIO 5: LOGOUT TRANSITION
  // ========================================================
  console.log('\n--- SCENARIO 5: Immediate Logout Transition ---');
  // Click logout button on desktop
  const logoutBtn = await page.$('button[title*="خروج"]');
  assert(!!logoutBtn, 'Logout button found in navbar for authenticated admin');
  if (logoutBtn) {
    await logoutBtn.click();
    await new Promise(r => setTimeout(r, 400));
  }

  links = await inspectNavLinks();
  console.log('Post-Logout Desktop Hrefs:', links.desktopHrefs);
  console.log('Post-Logout Footer Hrefs:', links.footerHrefs);

  assert(!links.desktopHrefs.includes('/admin'), 'Post-Logout Desktop Nav must NOT contain /admin');
  assert(!links.desktopHrefs.includes('/reception'), 'Post-Logout Desktop Nav must NOT contain /reception');
  assert(!links.desktopHrefs.includes('/account'), 'Post-Logout Desktop Nav must NOT contain /account');
  assert(!links.footerHrefs.includes('/admin'), 'Post-Logout Footer must NOT contain /admin');
  assert(!links.footerHrefs.includes('/reception'), 'Post-Logout Footer must NOT contain /reception');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'logout_transition_desktop.png'), fullPage: false });

  // ========================================================
  // TEST SCENARIO 6: ROUTE ACCESS BEHAVIOR FOR GUEST
  // ========================================================
  console.log('\n--- SCENARIO 6: Route Access Behavior for Guest ---');
  await page.evaluate(() => localStorage.clear());
  
  // Navigate directly to /admin as guest
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  const adminPageText = await page.evaluate(() => document.body.innerText);
  assert(adminPageText.includes('مدیر ارشد') || adminPageText.includes('ورود'), 'Direct access to /admin as guest displays login requirement alert');

  // Navigate directly to /reception as guest
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'domcontentloaded' });
  const receptionPageText = await page.evaluate(() => document.body.innerText);
  assert(receptionPageText.includes('پرسنل') || receptionPageText.includes('ورود'), 'Direct access to /reception as guest displays staff login requirement alert');

  await browser.close();

  console.log(`\n================ TEST SUMMARY: ${testFailures === 0 ? 'ALL PASSED ✅' : `${testFailures} FAILURES ❌`} ================`);
  if (testFailures > 0) {
    process.exit(1);
  }
}

runRoleNavTests().catch(err => {
  console.error('Fatal error in role navigation test suite:', err);
  process.exit(1);
});
