import puppeteer from 'puppeteer-core';

async function runReceptionCameraVerification() {
  console.log('\n================ RECEPTION CAMERA & SECURITY HEADERS VERIFICATION ================');
  const BASE_URL = 'http://127.0.0.1:3000';
  const API_URL = 'http://localhost:4000/api/v1';

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-fake-ui-for-media-stream', // Auto-grant camera if requested
      '--use-fake-device-for-media-stream',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  let permissionRequested = false;
  let getUserMediaCalled = false;
  const consoleMessages = [];

  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Track media devices / getUserMedia calls inside page context
  await page.evaluateOnNewDocument(() => {
    window.__cameraCalls = {
      getUserMediaCalled: false,
      enumerateDevicesCalled: false,
      videoElementsMounted: 0,
    };

    if (navigator.mediaDevices) {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
      if (origGetUserMedia) {
        navigator.mediaDevices.getUserMedia = async (...args) => {
          window.__cameraCalls.getUserMediaCalled = true;
          return origGetUserMedia(...args);
        };
      }
      const origEnumerate = navigator.mediaDevices.enumerateDevices?.bind(navigator.mediaDevices);
      if (origEnumerate) {
        navigator.mediaDevices.enumerateDevices = async (...args) => {
          window.__cameraCalls.enumerateDevicesCalled = true;
          return origEnumerate(...args);
        };
      }
    }
  });

  // Authenticate as Staff
  const staffRes = await fetch(`${API_URL}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000002' }),
  });
  const staffData = await staffRes.json();
  const verifyRes = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '09120000002', code: staffData.debugCode || '12345' }),
  });
  const staffAuth = await verifyRes.json();

  // Set auth token and user profile before navigating
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token, user) => {
    localStorage.setItem('gym_app_token', token);
    localStorage.setItem('user_profile', JSON.stringify(user));
  }, staffAuth.accessToken, staffAuth.user);

  console.log('\n--- 1. Navigating to /reception and capturing response headers ---');
  const response = await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  const headers = response.headers();

  console.log('HTTP Status:', response.status());
  console.log('Response Headers:');
  console.log('  x-content-type-options:', headers['x-content-type-options']);
  console.log('  x-frame-options       :', headers['x-frame-options']);
  console.log('  referrer-policy       :', headers['referrer-policy']);
  console.log('  strict-transport-sec  :', headers['strict-transport-security']);
  console.log('  permissions-policy    :', headers['permissions-policy']);

  // Assert headers
  const assert = (name, cond) => {
    if (!cond) {
      console.error(`❌ FAIL: ${name}`);
      process.exit(1);
    }
    console.log(`✅ PASS: ${name}`);
  };

  assert('Status 200 OK', response.status() === 200);
  assert('x-content-type-options is nosniff', headers['x-content-type-options'] === 'nosniff');
  assert('x-frame-options is DENY', headers['x-frame-options'] === 'DENY');
  assert('referrer-policy is strict-origin-when-cross-origin', headers['referrer-policy'] === 'strict-origin-when-cross-origin');
  assert('strict-transport-security is present', !!headers['strict-transport-security']);
  assert('permissions-policy is present', headers['permissions-policy'] === 'camera=(), microphone=(), geolocation=(self)');

  console.log('\n--- 2. Inspecting Reception DOM & Camera Invocations ---');
  const domInspection = await page.evaluate(() => {
    const videos = document.querySelectorAll('video');
    const textareas = document.querySelectorAll('textarea');
    const qrInputs = document.querySelectorAll('input[type="file"], input[capture]');
    return {
      videoCount: videos.length,
      textareaCount: textareas.length,
      fileInputCount: qrInputs.length,
      cameraCalls: window.__cameraCalls,
      receptionKioskText: document.body.innerText.includes('کانتر هوشمند پذیرش باشگاه'),
      hardwareScannerNote: document.body.innerText.includes('پشتیبانی از اسکنرهای بارکد خوان USB و 2D Kiosk'),
    };
  });

  console.log('DOM Video Elements Count       :', domInspection.videoCount);
  console.log('DOM Textarea Elements Count    :', domInspection.textareaCount);
  console.log('Camera getUserMedia Called     :', domInspection.cameraCalls.getUserMediaCalled);
  console.log('Camera enumerateDevices Called :', domInspection.cameraCalls.enumerateDevicesCalled);
  console.log('Reception Kiosk Text Found     :', domInspection.receptionKioskText);
  console.log('Hardware Scanner Note Found    :', domInspection.hardwareScannerNote);

  assert('No video tags exist on reception page', domInspection.videoCount === 0);
  assert('getUserMedia was never invoked by reception page', domInspection.cameraCalls.getUserMediaCalled === false);
  assert('Hardware USB/2D scanner support text verified', domInspection.hardwareScannerNote === true);

  console.log('\n--- 3. Testing Reception Check-in Flow with Dynamic QR Token ---');
  // Generate legitimate QR token for male athlete at Espinas Palace
  const freshPhone = `0912${Math.floor(1000000 + Math.random() * 9000000)}`;
  const memberTokenRes = await fetch(`${API_URL}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: freshPhone }),
  });
  const memberTokenData = await memberTokenRes.json();
  const memberVerify = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: freshPhone, code: memberTokenData.debugCode || '12345' }),
  });
  const memberAuth = await memberVerify.json();

  const gymDetailRes = await fetch(`${API_URL}/gyms/gym-elite-4`);
  const gymDetail = await gymDetailRes.json();
  const activeGender = gymDetail.activeSession ? gymDetail.activeSession.gender : 'MALE';

  await fetch(`${API_URL}/users/me`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${memberAuth.accessToken}`,
    },
    body: JSON.stringify({ gender: activeGender, firstName: 'علی', lastName: 'احمدی' }),
  });

  // Buy plan credits if balance is 0
  const checkoutRes = await fetch(`${API_URL}/payments/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${memberAuth.accessToken}`,
    },
    body: JSON.stringify({ planId: 'plan-2' }),
  });
  const checkoutData = await checkoutRes.json();
  if (checkoutData.gatewayAuthority) {
    await fetch(`${API_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberAuth.accessToken}`,
      },
      body: JSON.stringify({
        planId: 'plan-2',
        gatewayAuthority: checkoutData.gatewayAuthority,
        status: 'OK',
      }),
    });
  }

  const qrRes = await fetch(`${API_URL}/checkin/generate-qr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${memberAuth.accessToken}`,
    },
    body: JSON.stringify({ userId: memberAuth.user.id, gymId: 'gym-elite-4' }),
  });
  const qrData = await qrRes.json();
  assert('Dynamic QR token generated', !!qrData.qrToken);

  // Enter QR token in reception textarea
  await page.waitForSelector('textarea', { timeout: 5000 });
  await page.type('textarea', qrData.qrToken);
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"]');
    return btn && !btn.disabled;
  }, { timeout: 5000 });
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => {
    return document.body.textContent.includes('ورود تایید شد') || document.body.textContent.includes('خطا در پذیرش');
  }, { timeout: 8000 });

  const verificationText = await page.evaluate(() => document.body.textContent);
  assert('Reception displays approved check-in', verificationText.includes('ورود تایید شد'));
  assert('Member name displayed', verificationText.includes('علی احمدی'));
  assert('Privacy preservation notice displayed', verificationText.includes('مطابق ضوابط حریم خصوصی، کد ملی و شماره تماس کاربر در این مانیتور پنهان است'));

  console.log('\n--- 4. Static Images & Asset Loading Verification ---');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  const assetAudit = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return {
      totalImages: imgs.length,
      naturalWidths: imgs.map(i => ({ src: i.src, width: i.naturalWidth, complete: i.complete })),
    };
  });
  console.log(`Total images on home page: ${assetAudit.totalImages}`);
  const failedImages = assetAudit.naturalWidths.filter(i => i.complete && i.width === 0);
  console.log(`Failed/broken images: ${failedImages.length}`);
  assert('All static images loaded successfully without 404 or header block', failedImages.length === 0);

  await browser.close();
  console.log('\n🎉 ALL RECEPTION CAMERA & SECURITY HEADER VERIFICATIONS PASSED 100%!\n');
}

runReceptionCameraVerification().catch(err => {
  console.error('\n❌ Fatal Verification Error:', err);
  process.exit(1);
});
