import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\design_system_qa';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://localhost:4000/api/v1';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function getJwtToken(phoneNumber, role = 'USER') {
  await fetch(`${API_URL}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });
  const verifyRes = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, code: '12345' }),
  });
  const data = await verifyRes.json();
  return data.accessToken;
}

async function runVisualQA() {
  console.log('🚀 Starting Gravity Graphite + Lime Visual Design System Capture...');

  const memberToken = await getJwtToken('09120000003', 'USER');
  const staffToken = await getJwtToken('09120000002', 'GYM_STAFF');
  const adminToken = await getJwtToken('09120000001', 'SUPER_ADMIN');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  try {
    const page = await browser.newPage();

    // 1. Desktop 1440x900 - Home Discovery
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_desktop_home_discovery.png'), fullPage: false });
    console.log('📸 01_desktop_home_discovery.png captured');

    // 2. Desktop 1440x900 - Plans Page
    await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_desktop_plans_pricing.png'), fullPage: false });
    console.log('📸 02_desktop_plans_pricing.png captured');

    // 3. Desktop 1440x900 - Gym Detail
    await page.goto(`${BASE_URL}/gyms/gym-elite-4`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_desktop_gym_detail.png'), fullPage: false });
    console.log('📸 03_desktop_gym_detail.png captured');

    // 4. Desktop 1440x900 - Member Account (Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), memberToken);
    await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_desktop_member_account.png'), fullPage: false });
    console.log('📸 04_desktop_member_account.png captured');

    // 5. Desktop 1440x900 - Reception Kiosk (Staff Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), staffToken);
    await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_desktop_reception_kiosk.png'), fullPage: false });
    console.log('📸 05_desktop_reception_kiosk.png captured');

    // 6. Desktop 1440x900 - Admin Dashboard (Admin Authenticated)
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), adminToken);
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_desktop_admin_dashboard.png'), fullPage: false });
    console.log('📸 06_desktop_admin_dashboard.png captured');

    // 7. Mobile 390x844 - Home
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.removeItem('gym_app_token'));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_mobile_390_home.png'), fullPage: false });
    console.log('📸 07_mobile_390_home.png captured');

    // 8. Mobile 390x844 - Member Account
    await page.evaluate(token => localStorage.setItem('gym_app_token', token), memberToken);
    await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_mobile_390_account.png'), fullPage: false });
    console.log('📸 08_mobile_390_account.png captured');

    // 9. Tablet 768x1024 - Home
    await page.setViewport({ width: 768, height: 1024 });
    await page.evaluate(() => localStorage.removeItem('gym_app_token'));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '09_tablet_768_home.png'), fullPage: false });
    console.log('📸 09_tablet_768_home.png captured');

    console.log('✨ All 9 visual design QA screenshots successfully captured!');
  } finally {
    await browser.close();
  }
}

runVisualQA().catch(err => {
  console.error('Fatal visual QA capture error:', err);
  process.exit(1);
});
