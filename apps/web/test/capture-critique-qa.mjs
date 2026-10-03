import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\critique_polish_qa';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://localhost:4000/api/v1';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function getJwtToken(phoneNumber) {
  const sendRes = await fetch(`${API_URL}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
  const sendData = await sendRes.json();
  const verifyRes = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code: sendData.debugCode || '12345' }),
  });
  const data = await verifyRes.json();
  return data.accessToken;
}

async function runCapture() {
  console.log('🚀 Capturing Visual Design Critique & Polish QA Screenshots...');

  const memberToken = await getJwtToken('09120000003');
  const staffToken = await getJwtToken('09120000002');
  const adminToken = await getJwtToken('09120000001');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 1. Desktop 1280x800 - Home Discovery
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_desktop_home.png') });
    console.log('📸 01_desktop_home.png captured');

    // 2. Desktop 1280x800 - Plans Pricing
    await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_desktop_plans.png') });
    console.log('📸 02_desktop_plans.png captured');

    // 3. Desktop 1280x800 - Gym Detail
    await page.goto(`${BASE_URL}/gyms/gym-elite-4`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_desktop_gym_detail.png') });
    console.log('📸 03_desktop_gym_detail.png captured');

    // 4. Desktop 1280x800 - Member Account (Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), memberToken);
    await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_desktop_member_account.png') });
    console.log('📸 04_desktop_member_account.png captured');

    // 5. Desktop 1280x800 - Reception Kiosk (Staff Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), staffToken);
    await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_desktop_reception_kiosk.png') });
    console.log('📸 05_desktop_reception_kiosk.png captured');

    // 6. Desktop 1280x800 - Admin Dashboard (Admin Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), adminToken);
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_desktop_admin_dashboard.png') });
    console.log('📸 06_desktop_admin_dashboard.png captured');

    // 7. Mobile 390x844 - Home Discovery (Clean Mobile Nav)
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.removeItem('gym_app_token'));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_mobile_390_home.png') });
    console.log('📸 07_mobile_390_home.png captured');

    // 8. Mobile 390x844 - Plans Pricing
    await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_mobile_390_plans.png') });
    console.log('📸 08_mobile_390_plans.png captured');

    // 9. Mobile 390x844 - Member Account (Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), memberToken);
    await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_mobile_390_account.png') });
    console.log('📸 09_mobile_390_account.png captured');

    // 10. Tablet 768x1024 - Home Discovery
    await page.setViewport({ width: 768, height: 1024 });
    await page.evaluate(() => localStorage.removeItem('gym_app_token'));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '10_tablet_768_home.png') });
    console.log('📸 10_tablet_768_home.png captured');

    // 11. Tablet 768x1024 - Plans Pricing
    await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '11_tablet_768_plans.png') });
    console.log('📸 11_tablet_768_plans.png captured');

    console.log('🎉 All 11 visual QA screenshots successfully captured!');
  } finally {
    await browser.close();
  }
}

runCapture().catch(err => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
