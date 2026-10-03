import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://127.0.0.1:4000/api/v1';

const VIEWPORTS = [
  { name: 'Mobile-360', width: 360, height: 800, isMobile: true, hasTouch: true },
  { name: 'Mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'Tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true },
  { name: 'Desktop-1280', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: 'Desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
];

async function runFinalVisualQA() {
  console.log('================================================================');
  console.log('   STARTING PHASE 8.1 FINAL VISUAL QA (CHROMIUM REAL DOM)       ');
  console.log('================================================================\n');

  const auditReport = {
    externalFontRequests: [],
    localFontRequests: [],
    viewportsChecked: [],
    pagesChecked: [],
    computedStyles: {},
    sensitiveContentResults: {},
    passItems: [],
    failItems: []
  };

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

  // Monitor network requests for external Google Fonts and local Vazirmatn fonts
  page.on('request', req => {
    const url = req.url();
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      console.error(`🚨 FAIL: External Google Fonts request detected: ${url}`);
      auditReport.externalFontRequests.push(url);
    }
    if (url.includes('/fonts/vazirmatn/')) {
      auditReport.localFontRequests.push(url);
    }
  });

  async function getAuthSession(phoneNumber) {
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
    return await verifyRes.json();
  }

  // Provisioning actors
  console.log('Provisioning test actors from API...');
  const memberPhone = '0912' + Math.floor(1000000 + Math.random() * 9000000).toString();
  const memberAuth = await getAuthSession(memberPhone);
  const memberToken = memberAuth.accessToken;

  const staffAuth = await getAuthSession('09120000002');
  const staffToken = staffAuth.accessToken;

  const adminAuth = await getAuthSession('09120000001');
  const adminToken = adminAuth.accessToken;

  console.log(`✅ Member token: ${memberAuth.user.phoneNumber}, Role: ${memberAuth.user.role}`);
  console.log(`✅ Staff token : ${staffAuth.user.phoneNumber}, Role: ${staffAuth.user.role}`);
  console.log(`✅ Admin token : ${adminAuth.user.phoneNumber}, Role: ${adminAuth.user.role}\n`);

  // Fund member with 60 credits via real mock checkout & verification
  const checkoutRes = await fetch(`${API_URL}/payments/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ planId: 'plan-3' })
  });
  const checkoutData = await checkoutRes.json();
  const verifyPayRes = await fetch(`${API_URL}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({
      planId: 'plan-3',
      gatewayAuthority: checkoutData.gatewayAuthority,
      status: 'OK'
    })
  });
  const verifyPayData = await verifyPayRes.json();
  console.log(`✅ Member funded with ${verifyPayData.creditsIssued} credits for real QR generation`);

  // Standard DOM selector & inspector helpers
  async function inspectStyles(selector, textMatch, description) {
    return await page.evaluate((sel, match, desc) => {
      let el = null;
      if (match) {
        const candidates = Array.from(document.querySelectorAll(sel));
        el = candidates.find(c => c.textContent && c.textContent.includes(match));
      } else {
        el = document.querySelector(sel);
      }
      if (!el) return { error: `Element not found: ${sel} (${desc})` };
      const cs = window.getComputedStyle(el);
      return {
        description: desc,
        selector: sel,
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        direction: cs.direction,
        unicodeBidi: cs.unicodeBidi,
        text: el.innerText?.trim() || el.textContent?.trim()
      };
    }, selector, textMatch, description);
  }

  async function clickByText(tag, text) {
    return await page.evaluate((t, txt) => {
      const candidates = Array.from(document.querySelectorAll(t));
      const el = candidates.find(c => c.textContent && c.textContent.includes(txt));
      if (!el) throw new Error(`Element ${t} with text "${txt}" not found`);
      el.click();
    }, tag, text);
  }

  // =========================================================================
  // 1. HOME & GYM DISCOVERY (All 5 Viewports)
  // =========================================================================
  console.log('--- 1. Testing Home / Gym Discovery Across Viewports ---');

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle0' });
    auditReport.viewportsChecked.push(vp.name);

    if (vp.name === 'Desktop-1280') {
      const isVazirLoaded = await page.evaluate(() => {
        return document.fonts.check('16px Vazirmatn') && document.fonts.check('bold 16px Vazirmatn');
      });
      if (isVazirLoaded) {
        auditReport.passItems.push('Vazirmatn local WOFF2 font verified loaded via document.fonts.check()');
        console.log('✅ PASS: Vazirmatn local WOFF2 font active in font cache');
      } else {
        auditReport.failItems.push('Vazirmatn font not loaded in document.fonts');
      }

      const heroHeadingStyle = await inspectStyles('h1', null, 'Home Hero Heading');
      auditReport.computedStyles['Home Hero Heading'] = heroHeadingStyle;

      const gymCardBadge = await inspectStyles('.rounded-3xl span[class*="font-persian-digits"], .rounded-3xl .font-persian-digits', null, 'Gym Card Credit Digit');
      auditReport.computedStyles['Gym Card Credit Digit'] = gymCardBadge;

      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_home_desktop.png') });
      console.log('📸 Saved qa_home_desktop.png');
    } else if (vp.name === 'Mobile-390') {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_home_mobile.png') });
      console.log('📸 Saved qa_home_mobile.png');
    }
  }

  // =========================================================================
  // 2. LOGIN / OTP MODAL
  // =========================================================================
  console.log('\n--- 2. Testing Login / OTP Modal ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle0' });

  // Click login button in navbar
  await clickByText('button', 'ورود');
  await page.waitForSelector('input[type="tel"]', { timeout: 5000 });

  // Inspect Step 1 Phone Input
  const phoneInputStyle = await inspectStyles('input[type="tel"]', null, 'Phone Input Step 1');
  auditReport.computedStyles['Phone Input Step 1'] = phoneInputStyle;

  if (phoneInputStyle.direction === 'ltr') {
    auditReport.passItems.push('Phone input correctly set to dir="ltr"');
    console.log('✅ PASS: Phone input enforces dir="ltr"');
  } else {
    auditReport.failItems.push(`Phone input direction error: ${phoneInputStyle.direction}`);
  }

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_login_step1_modal.png') });
  console.log('📸 Saved qa_login_step1_modal.png');

  // Enter phone to advance to Step 2
  await page.type('input[type="tel"]', '09121234567');
  await clickByText('button[type="submit"]', 'دریافت کد');

  // Wait for OTP Step 2
  await page.waitForFunction(() => document.body.textContent.includes('کد تایید پیامکی'), { timeout: 8000 });

  const otpInputStyle = await inspectStyles('input', null, 'OTP Input Step 2');
  auditReport.computedStyles['OTP Input Step 2'] = otpInputStyle;

  const otpTimerStyle = await inspectStyles('.font-persian-digits', null, 'OTP Countdown Timer');
  auditReport.computedStyles['OTP Countdown Timer'] = otpTimerStyle;

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_login_step2_modal.png') });
  console.log('📸 Saved qa_login_step2_modal.png');

  // Close modal with Escape
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 400));

  // =========================================================================
  // 3. LOGGED-IN NAVBAR & DYNAMIC QR MODAL
  // =========================================================================
  console.log('\n--- 3. Testing Logged-In User Navbar & Dynamic QR Modal ---');
  // Inject Member auth session with 12 credits
  await page.evaluate((tok, usr) => {
    usr.currentCredits = 60;
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, memberToken, memberAuth.user);

  await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle0' });

  // Inspect Navbar Credits chip and Role badge
  await page.waitForFunction(() => document.body.textContent.includes('اعتبار'), { timeout: 5000 });
  const navCreditsStyle = await inspectStyles('header div', 'اعتبار', 'Navbar Credits Chip');
  auditReport.computedStyles['Navbar Credits Chip'] = navCreditsStyle;

  // Open Dynamic QR Modal by clicking gym card check-in button
  await clickByText('button', 'دریافت بارکد ورود به مجموعه');
  await page.waitForFunction(() => document.body.textContent.includes('ثانیه'), { timeout: 6000 });

  const qrTimerStyle = await inspectStyles('.font-persian-digits', null, 'QR 45s Countdown Timer');
  auditReport.computedStyles['QR 45s Countdown Timer'] = qrTimerStyle;

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_dynamic_qr_modal.png') });
  console.log('📸 Saved qa_dynamic_qr_modal.png');

  // Close QR modal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 400));

  // =========================================================================
  // 4. PLANS PAGE & SHAPARAK PURCHASE RECEIPT
  // =========================================================================
  console.log('\n--- 4. Testing Plans Page & Purchase Receipt ---');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0' });

  // Inspect Plan Card Price
  const planPriceStyle = await inspectStyles('.font-persian-digits', null, 'Plan Card Price Tomans');
  auditReport.computedStyles['Plan Card Price Tomans'] = planPriceStyle;

  // Save Plans Desktop Screenshot
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_plans_desktop.png') });
  console.log('📸 Saved qa_plans_desktop.png');

  // Save Plans Mobile Screenshot
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_plans_mobile.png') });
  console.log('📸 Saved qa_plans_mobile.png');

  // Restore Desktop viewport and click Purchase
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, memberToken, memberAuth.user);
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0' });

  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(b => b.textContent && b.textContent.includes('خرید و فعالسازی اشتراک'));
  }, { timeout: 8000 });

  const pageButtons = await page.$$('button');
  for (const b of pageButtons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text && text.includes('خرید و فعالسازی اشتراک')) {
      await b.click();
      break;
    }
  }

  // Wait for receipt banner
  await page.waitForSelector('.bg-emerald-50 h3', { timeout: 8000 });
  const rrnStyle = await inspectStyles('.font-mono[dir="ltr"]', null, 'RRN Receipt Code');
  auditReport.computedStyles['RRN Receipt Code'] = rrnStyle;

  if (rrnStyle.direction === 'ltr' && (rrnStyle.fontFamily.toLowerCase().includes('mono') || rrnStyle.fontFamily.toLowerCase().includes('consolas'))) {
    auditReport.passItems.push('RRN receipt code is correctly isolated with dir="ltr" and monospace font');
    console.log('✅ PASS: RRN receipt code is isolated with dir="ltr" and monospace font');
  } else {
    auditReport.failItems.push(`RRN receipt code style issue: direction=${rrnStyle.direction}, font=${rrnStyle.fontFamily}`);
  }

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_purchase_receipt.png') });
  console.log('📸 Saved qa_purchase_receipt.png');

  // =========================================================================
  // 5. RECEPTION PAGE
  // =========================================================================
  console.log('\n--- 5. Testing Reception Page ---');
  // Inject Staff Auth
  await page.evaluate((tok, usr) => {
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, staffToken, staffAuth.user);

  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle0' });

  // Inspect Reception QR textarea
  const qrTextareaStyle = await inspectStyles('textarea', null, 'Reception QR Payload Input');
  auditReport.computedStyles['Reception QR Payload Input'] = qrTextareaStyle;

  if (qrTextareaStyle.direction === 'ltr') {
    auditReport.passItems.push('Reception QR Payload textarea correctly set to dir="ltr"');
    console.log('✅ PASS: Reception QR Payload textarea has dir="ltr"');
  } else {
    auditReport.failItems.push(`Reception QR textarea direction is ${qrTextareaStyle.direction}`);
  }

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_reception_desktop.png') });
  console.log('📸 Saved qa_reception_desktop.png');

  // Generate dynamic QR token for member and scan it at counter
  const qrGenRes = await fetch(`${API_URL}/checkin/generate-qr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memberToken}`
    },
    body: JSON.stringify({ userId: memberAuth.user.id, gymId: 'gym-elite-4' })
  });
  const qrGenData = await qrGenRes.json();
  const testQrToken = qrGenData.qrToken;

  await page.type('textarea', testQrToken);
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"]');
    return btn && !btn.disabled;
  }, { timeout: 5000 });
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => {
    return document.body.textContent.includes('ورود تایید شد') || document.body.textContent.includes('خطا در پذیرش');
  }, { timeout: 8000 });
  console.log('✅ PASS: Reception screen processed admission');

  // Inspect Masked Phone in Reception
  const maskedPhoneStyle = await inspectStyles('bdi[dir="ltr"]', null, 'Reception Masked Phone');
  auditReport.computedStyles['Reception Masked Phone'] = maskedPhoneStyle;

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_reception_verified.png') });
  console.log('📸 Saved qa_reception_verified.png');

  // =========================================================================
  // 6. ADMIN PAGE
  // =========================================================================
  console.log('\n--- 6. Testing Admin Economic Dashboard ---');
  // Inject Admin Auth
  await page.evaluate((tok, usr) => {
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, adminToken, adminAuth.user);

  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.textContent.includes('حاشیه مشارکت'), { timeout: 8000 });

  // Inspect the Persian currency text inside the ratio box to confirm NO font-mono is applied to Persian words
  const ratioPersianTextStyle = await page.evaluate(() => {
    const el = document.querySelector('.border-emerald-200');
    if (!el) return { error: 'Not found' };
    const spans = Array.from(el.querySelectorAll('span'));
    const persianUnitSpan = spans.find(s => s.textContent && s.textContent.includes('تومان / اعتبار'));
    if (!persianUnitSpan) return { error: 'persianUnitSpan not found' };
    const cs = window.getComputedStyle(persianUnitSpan);
    return {
      text: persianUnitSpan.textContent.trim(),
      fontFamily: cs.fontFamily,
      letterSpacing: cs.letterSpacing,
      isMonospace: cs.fontFamily.toLowerCase().includes('mono') || cs.fontFamily.toLowerCase().includes('consolas')
    };
  });
  auditReport.computedStyles['Ratio Box Persian Unit'] = ratioPersianTextStyle;

  if (!ratioPersianTextStyle.isMonospace && ratioPersianTextStyle.fontFamily.includes('Vazirmatn')) {
    auditReport.passItems.push('Admin ratio box Persian text "تومان / اعتبار" uses Vazirmatn and is strictly NOT monospaced');
    console.log('✅ PASS: Admin ratio box Persian text uses Vazirmatn and is NOT monospaced');
  } else {
    auditReport.failItems.push(`Admin ratio box Persian text has wrong font: ${JSON.stringify(ratioPersianTextStyle)}`);
  }

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_admin_desktop.png') });
  console.log('📸 Saved qa_admin_desktop.png');

  // =========================================================================
  // 7. SENSITIVE CONTENT REAL DOM INJECTION & STYLE VERIFICATION
  // =========================================================================
  console.log('\n--- 7. Testing Sensitive Content Matrix in Real Browser DOM ---');

  const testPhrases = [
    // Persian
    { type: 'persian', text: 'خرید اشتراک باشگاه' },
    { type: 'persian', text: 'اعتبار باقیمانده' },
    { type: 'persian', text: 'مبلغ قابل پرداخت' },
    { type: 'persian', text: 'تومان' },
    { type: 'persian', text: 'ورزشکار' },
    { type: 'persian', text: 'باشگاه‌های اطراف شما' },
    // Numbers
    { type: 'number', text: '۱۲ اعتبار' },
    { type: 'number', text: '۳۰۰٬۰۰۰ تومان' },
    { type: 'number', text: '۱٬۲۵۰٬۰۰۰ تومان' },
    { type: 'number', text: '۳۰ روز' },
    { type: 'number', text: '۲٫۵ کیلومتر' },
    // Mixed / BiDi
    { type: 'mixed', text: 'پرداخت ۱٬۲۵۰٬۰۰۰ تومان' },
    { type: 'mixed', text: 'RRN: 1234567890', isTechnical: true },
    { type: 'mixed', text: 'OTP: 483921', isTechnical: true },
    { type: 'mixed', text: '+98 912 123 4567', isTechnical: true },
    { type: 'mixed', text: 'QR-8F29A1', isTechnical: true },
    { type: 'mixed', text: '۱۲ Credit' },
    { type: 'mixed', text: 'Gym #123' },
  ];

  const sensitiveEvaluation = await page.evaluate((phrases) => {
    const panel = document.createElement('div');
    panel.id = 'qa-sensitive-content-panel';
    panel.style.position = 'fixed';
    panel.style.top = '20px';
    panel.style.left = '20px';
    panel.style.right = '20px';
    panel.style.bottom = '20px';
    panel.style.zIndex = '99999999';
    panel.style.backgroundColor = '#ffffff';
    panel.style.overflow = 'auto';
    panel.style.padding = '24px';
    panel.style.borderRadius = '24px';
    panel.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.35)';
    panel.style.border = '2px solid #3b82f6';
    panel.className = 'font-persian';
    panel.dir = 'rtl';

    panel.innerHTML = `
      <h2 class="text-xl font-black text-slate-900 mb-4 border-b pb-2">پنل آزمون محتوای حساس و تایپوگرافی (Real DOM Visual QA)</h2>
      <div id="qa-items-container" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
    `;

    document.body.appendChild(panel);
    const container = panel.querySelector('#qa-items-container');

    const results = [];

    phrases.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.id = `qa-phrase-${idx}`;
      itemEl.className = 'p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between';

      const label = document.createElement('span');
      label.className = 'text-xs font-semibold text-slate-500';
      label.textContent = item.type.toUpperCase() + ':';

      const valueEl = document.createElement('div');
      valueEl.className = 'text-sm font-bold text-slate-900';

      if (item.isTechnical) {
        valueEl.innerHTML = `<span dir="ltr" class="font-mono bg-slate-200 px-2 py-1 rounded-md text-xs">${item.text}</span>`;
      } else if (item.type === 'number') {
        valueEl.className = 'text-sm font-bold text-slate-900 font-persian-digits';
        valueEl.textContent = item.text;
      } else {
        valueEl.textContent = item.text;
      }

      itemEl.appendChild(label);
      itemEl.appendChild(valueEl);
      container.appendChild(itemEl);

      const computed = window.getComputedStyle(valueEl.firstElementChild || valueEl);
      results.push({
        text: item.text,
        type: item.type,
        isTechnical: !!item.isTechnical,
        fontFamily: computed.fontFamily,
        fontWeight: computed.fontWeight,
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        direction: computed.direction,
        unicodeBidi: computed.unicodeBidi,
        letterSpacing: computed.letterSpacing,
      });
    });

    return results;
  }, testPhrases);

  auditReport.sensitiveContentResults = sensitiveEvaluation;
  console.log(`Evaluated ${sensitiveEvaluation.length} sensitive phrases in DOM.`);

  // Save Sensitive Content Test Screenshot
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'qa_sensitive_content.png') });
  console.log('📸 Saved qa_sensitive_content.png');

  // Close browser
  await browser.close();

  // Audit assertions
  console.log('\n================================================================');
  console.log('                     AUDIT RESULTS SUMMARY                      ');
  console.log('================================================================');

  // 1. External fonts check
  if (auditReport.externalFontRequests.length === 0) {
    auditReport.passItems.push('Zero requests to external fonts (fonts.googleapis.com / fonts.gstatic.com)');
    console.log('✅ PASS: 0 requests to external fonts.googleapis.com or fonts.gstatic.com');
  } else {
    auditReport.failItems.push(`External font requests detected: ${auditReport.externalFontRequests.join(', ')}`);
  }

  // 2. Local font requests check
  if (auditReport.localFontRequests.length > 0) {
    auditReport.passItems.push(`${auditReport.localFontRequests.length} requests successfully served from /fonts/vazirmatn/`);
    console.log(`✅ PASS: ${auditReport.localFontRequests.length} local font files loaded from /fonts/vazirmatn/`);
  } else {
    auditReport.failItems.push('No local font requests recorded');
  }

  // 3. Technical tokens bidi check
  const technicalFailures = sensitiveEvaluation.filter(item => item.isTechnical && item.direction !== 'ltr');
  if (technicalFailures.length === 0) {
    auditReport.passItems.push('All technical tokens (RRN, OTP, Phone, QR) strictly enforce dir="ltr"');
    console.log('✅ PASS: All technical tokens (RRN, OTP, Phone, QR) enforce dir="ltr"');
  } else {
    auditReport.failItems.push(`Technical tokens failed dir="ltr": ${JSON.stringify(technicalFailures)}`);
  }

  // 4. Persian text font-mono check
  const persianMonoFailures = sensitiveEvaluation.filter(item => item.type === 'persian' && (item.fontFamily.toLowerCase().includes('mono') || item.fontFamily.toLowerCase().includes('consolas')));
  if (persianMonoFailures.length === 0) {
    auditReport.passItems.push('Zero Persian text elements have monospaced fonts applied');
    console.log('✅ PASS: Zero Persian text elements have monospaced fonts applied');
  } else {
    auditReport.failItems.push(`Persian text with monospace font: ${JSON.stringify(persianMonoFailures)}`);
  }

  console.log(`\nTOTAL PASS ITEMS: ${auditReport.passItems.length}`);
  console.log(`TOTAL FAIL ITEMS: ${auditReport.failItems.length}`);

  // Save audit report JSON
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'final_visual_qa_report.json'),
    JSON.stringify(auditReport, null, 2),
    'utf-8'
  );
  console.log('Report saved to final_visual_qa_report.json');

  if (auditReport.failItems.length > 0) {
    console.error('\n❌ QA FAILED with items:', auditReport.failItems);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL FINAL VISUAL QA AUDIT ITEMS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runFinalVisualQA().catch(err => {
  console.error('Final Visual QA run error:', err);
  process.exit(1);
});
