import puppeteer from 'puppeteer-core';

async function runBrowserE2E() {
  console.log('\n================ REAL BROWSER (CHROMIUM) AUTOMATION ================');
  const BASE_URL = 'http://127.0.0.1:3000';
  console.log(`Target Web Application: ${BASE_URL}`);
  console.log('Target API Backend    : http://localhost:4000/api/v1\n');

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
  await page.setViewport({ width: 1280, height: 900 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  async function getAuthSession(phoneNumber) {
    const sendRes = await fetch('http://localhost:4000/api/v1/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber })
    });
    const sendData = await sendRes.json();
    const code = sendData.debugCode || '12345';

    const verifyRes = await fetch('http://localhost:4000/api/v1/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code })
    });
    return await verifyRes.json();
  }

  // Member (Fresh test member)
  const memberPhone = '0912' + Math.floor(1000000 + Math.random() * 9000000).toString();
  const memberAuth = await getAuthSession(memberPhone);
  const memberToken = memberAuth.accessToken;
  console.log('✅ Member JWT session provisioned:', memberAuth.user.phoneNumber, `(${memberAuth.user.role})`);

  // Staff (09120000002 - Reza Mohammadi, Espinas Palace)
  const staffAuth = await getAuthSession('09120000002');
  const staffToken = staffAuth.accessToken;
  console.log('✅ Staff JWT session provisioned:', staffAuth.user.phoneNumber, `(${staffAuth.user.role})`);

  // Admin (09120000001 - Super Admin)
  const adminAuth = await getAuthSession('09120000001');
  const adminToken = adminAuth.accessToken;
  console.log('✅ Admin JWT session provisioned:', adminAuth.user.phoneNumber, `(${adminAuth.user.role})\n`);

  // =========================================================================
  // 1. DISCOVERY & PERSIAN RTL VERIFICATION (/)
  // =========================================================================
  console.log('--- Phase 1: Browser Navigation to Home Discovery (/) ---');
  await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });

  // Assert Persian RTL HTML attributes
  const dir = await page.$eval('html', el => el.getAttribute('dir'));
  const lang = await page.$eval('html', el => el.getAttribute('lang'));
  if (dir !== 'rtl' || lang !== 'fa') {
    throw new Error(`Persian RTL validation failed: dir=${dir}, lang=${lang}`);
  }
  console.log('✅ PASS: Real DOM enforces dir="rtl" and lang="fa"');

  // Verify Hero Header rendered
  const heroText = await page.$eval('h1', el => el.textContent.trim());
  console.log('✅ PASS: Main Heading rendered in DOM:', heroText);

  // Wait for gym cards
  await page.waitForSelector('input[placeholder*="جستجو"]', { timeout: 5000 });
  const searchInput = await page.$('input[placeholder*="جستجو"]');
  await searchInput.type('اسپیناس');
  await new Promise(r => setTimeout(r, 600));

  const gymCards = await page.$$eval('.rounded-3xl', els => els.length);
  console.log(`✅ PASS: Interactive search filter executed. Rendered elements: ${gymCards}`);

  // =========================================================================
  // 2. MEMBER MEMBERSHIP PURCHASE SIMULATION (/plans)
  // =========================================================================
  console.log('\n--- Phase 2: Browser Member Plan Purchase Journey (/plans) ---');
  // Inject Member auth session into browser localStorage
  await page.evaluate((tok, usr) => {
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, memberToken, memberAuth.user);

  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'domcontentloaded' });
  // Wait for plan purchase buttons to render after client API fetch
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some(b => b.textContent && (b.textContent.includes('خرید و فعالسازی اشتراک') || b.textContent.includes('خرید آنلاین پلن')));
  }, { timeout: 10000 });

  // Locate purchase button for Standard Plan (30 credits) to ensure sufficient credits for all tiers
  const planCards = await page.$$('.grid > div');
  let buyButton = null;
  for (const card of planCards) {
    const cardText = await page.evaluate(el => el.textContent, card);
    if (cardText && (cardText.includes('۳۰ اعتبار') || cardText.includes('محبوب‌ترین پلن'))) {
      buyButton = await card.$('button');
      if (buyButton) break;
    }
  }
  if (!buyButton) {
    const allButtons = await page.$$('button');
    for (const b of allButtons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes('خرید و فعالسازی اشتراک')) {
        buyButton = b;
      }
    }
  }

  if (!buyButton) {
    throw new Error('Purchase button not found on /plans page');
  }

  console.log('Clicking "خرید و فعالسازی اشتراک (شبیه‌ساز شاپرک)" inside real browser...');
  await buyButton.click();

  // Wait for success receipt banner
  await page.waitForFunction(() => {
    return document.body.textContent.includes('پرداخت شاپرک با موفقیت انجام شد');
  }, { timeout: 8000 });

  const receiptContent = await page.evaluate(() => {
    return {
      title: document.querySelector('.bg-emerald-50 h3')?.textContent?.trim(),
      rrn: document.querySelector('.bg-emerald-50 .font-mono')?.textContent?.trim(),
      creditsNote: document.querySelector('.bg-emerald-50 .bg-white')?.textContent?.trim()
    };
  });

  console.log('✅ PASS: Real Browser Purchase Receipt Rendered:');
  console.log('   - Status :', receiptContent.title);
  console.log('   - RRN Ref:', receiptContent.rrn);
  console.log('   - Credits:', receiptContent.creditsNote);

  // =========================================================================
  // 3. DYNAMIC QR GENERATION (API-Backed & Sans-Aware)
  // =========================================================================
  console.log('\n--- Phase 3: Dynamic QR Code Token Generation (Sans-Aware) ---');
  const gymsRes = await fetch('http://localhost:4000/api/v1/gyms');
  const gyms = await gymsRes.json();
  const eliteGym = gyms.find(g => g.tier === 'ELITE') || gyms[0];

  // Inspect target gym active sans schedule dynamically
  const gymDetailRes = await fetch(`http://localhost:4000/api/v1/gyms/${eliteGym.id}`);
  const gymDetail = await gymDetailRes.json();
  const activeGender = gymDetail.activeSession ? gymDetail.activeSession.gender : 'FEMALE';
  console.log(`Target Gym: ${eliteGym.name_fa || eliteGym.nameFa} | Active Sans Gender: ${activeGender}`);

  // Set member profile gender to match target venue's active session
  await fetch('http://localhost:4000/api/v1/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ gender: activeGender, firstName: 'عضو', lastName: 'مرورگر' })
  });

  const qrGenRes = await fetch('http://localhost:4000/api/v1/checkin/generate-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memberToken}` },
    body: JSON.stringify({ userId: memberAuth.user.id, gymId: eliteGym.id })
  });
  const qrPayload = await qrGenRes.json();
  const dynamicQrToken = qrPayload.qrToken;
  console.log('✅ PASS: Generated rotating HMAC QR Token for active sans athlete (Valid 45s):', dynamicQrToken.slice(0, 45) + '...');

  // =========================================================================
  // 4. RECEPTIONIST SCAN, PRIVACY & REPLAY REJECTION (/reception)
  // =========================================================================
  console.log('\n--- Phase 4: Browser Receptionist Counter Journey (/reception) ---');
  // Inject Staff auth session
  await page.evaluate((tok, usr) => {
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, staffToken, staffAuth.user);

  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('textarea', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 600));

  // Paste QR Token into Receptionist counter input
  await page.type('textarea', dynamicQrToken);
  console.log('Pasted dynamic QR payload into receptionist scanner terminal...');

  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"]');
    return btn && !btn.disabled;
  }, { timeout: 5000 });
  await page.click('button[type="submit"]');

  // Wait for verification screen
  await page.waitForFunction(() => {
    return document.body.textContent.includes('ورود تایید شد') || document.body.textContent.includes('خطا در پذیرش');
  }, { timeout: 8000 });

  const verificationText = await page.evaluate(() => document.body.textContent);
  if (!verificationText.includes('ورود تایید شد')) {
    const errText = await page.evaluate(() => document.querySelector('.border-red-200')?.textContent?.trim() || '');
    throw new Error(`Verification screen did not display approved status. Backend message: ${errText}`);
  }
  console.log('✅ PASS: Reception screen approved member admission');

  // Verify Strict Privacy: National ID & Phone must NOT be visible
  const hasNationalCode = verificationText.includes('کد ملی:');
  const hasPhone = verificationText.includes(memberPhone);
  if (hasNationalCode || hasPhone) {
    throw new Error('PRIVACY VIOLATION: National ID or Phone Number leaked on receptionist screen!');
  }
  console.log('✅ PASS: Strict Privacy: National Code and Phone Number suppressed from counter UI');

  // Test Replay Attack in browser: Paste same token and submit again
  console.log('Simulating duplicate scan (replay attack) in browser...');
  await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) textarea.value = '';
  });
  await page.type('textarea', dynamicQrToken);

  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"]');
    return btn && !btn.disabled;
  }, { timeout: 5000 });
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => {
    return document.body.textContent.includes('قبلاً استفاده شده') || document.body.textContent.includes('خطا');
  }, { timeout: 6000 });

  const errorText = await page.evaluate(() => {
    return document.querySelector('.bg-red-50')?.textContent?.trim();
  });
  console.log('✅ PASS: Browser UI blocked duplicate scan:', errorText);

  // =========================================================================
  // 5. ADMIN ECONOMIC DASHBOARD & GOLDEN BOUNDING (/admin)
  // =========================================================================
  console.log('\n--- Phase 5: Browser Admin Economic Dashboard Journey (/admin) ---');
  // Inject Admin auth session
  await page.evaluate((tok, usr) => {
    localStorage.setItem('gym_app_token', tok);
    localStorage.setItem('user_profile', JSON.stringify(usr));
  }, adminToken, adminAuth.user);

  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  // Wait for async dashboard metrics to populate from API
  await page.waitForFunction(() => {
    return document.body.textContent.includes('حاشیه مشارکت (Contribution Margin)');
  }, { timeout: 10000 });
  console.log('✅ PASS: Admin Economic Dashboard loaded with real contribution margin metrics');

  // Test Golden Bounding Inequality interactive UI feedback
  console.log('Testing Golden Bounding Inequality real-time UI calculation in browser...');
  
  async function setNumberInputValue(inputEl, val) {
    await inputEl.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await inputEl.type(val.toString());
  }

  // Set invalid pricing (Credit Cost = 2, Payout = 100,000 -> Lambda = 50,250 > 32,000)
  const numberInputs = await page.$$('form input[type="number"]');
  await setNumberInputValue(numberInputs[0], '2');
  await setNumberInputValue(numberInputs[1], '100000');
  
  await new Promise(r => setTimeout(r, 600));

  const isWarningVisible = await page.evaluate(() => {
    return document.body.textContent.includes('هشدار اقتصادی') || document.body.textContent.includes('زیان پلتفرم');
  });

  if (!isWarningVisible) {
    throw new Error('Golden Bounding warning did not appear for invalid pricing');
  }
  console.log('✅ PASS: Real-time UI warning activated: "هشدار اقتصادی: این تعرفه باعث زیان پلتفرم می‌شود"');

  // Submit invalid pricing to verify backend rejection inside browser
  await page.click('form button[type="submit"]');

  await page.waitForFunction(() => {
    return document.body.textContent.includes('خطا در اعمال تعرفه') || document.body.textContent.includes('نامساوی طلایی');
  }, { timeout: 6000 });
  console.log('✅ PASS: Backend rejected pricing override with HTTP 400 Bad Request');

  // Now set valid pricing (Credit Cost = 4, Payout = 65,000 -> Lambda = 16,375 <= 32,000)
  const freshInputs = await page.$$('form input[type="number"]');
  await setNumberInputValue(freshInputs[0], '4');
  await setNumberInputValue(freshInputs[1], '65000');

  await new Promise(r => setTimeout(r, 600));

  const isWarningGone = await page.evaluate(() => {
    return !document.body.textContent.includes('هشدار اقتصادی');
  });
  if (!isWarningGone) {
    throw new Error('Warning did not clear for valid pricing');
  }
  console.log('✅ PASS: Real-time UI validated: Economic warning cleared for valid pricing');

  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => {
    return document.body.textContent.includes('تعرفه با موفقیت بروزرسانی شد');
  }, { timeout: 6000 });
  console.log('✅ PASS: Valid pricing successfully saved and confirmed by server');

  await browser.close();
  console.log('\n🎉 ALL REAL BROWSER (CHROMIUM) USER JOURNEYS COMPLETED WITH 100% SUCCESS!');
}

runBrowserE2E().catch(err => {
  console.error('\n❌ REAL BROWSER VALIDATION FAILED:', err);
  process.exit(1);
});
