import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\frozen_validation';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://localhost:4000/api/v1';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

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

async function main() {
  console.log('--- Step 1: Provisioning Authentication Sessions ---');
  const memberAuth = await getAuthToken('09120000003');
  const staffAuth = await getAuthToken('09120000002');
  const adminAuth = await getAuthToken('09120000001');

  console.log('Member:', memberAuth.user.phoneNumber);
  console.log('Staff: ', staffAuth.user.phoneNumber);
  console.log('Admin: ', adminAuth.user.phoneNumber);

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Homepage Desktop
  console.log('Capturing: 01_desktop_home.png');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_desktop_home.png'), fullPage: false });

  // 2. Homepage Mobile (390px)
  console.log('Capturing: 02_mobile_home_390.png');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_mobile_home_390.png'), fullPage: false });

  // Reset to desktop viewport
  await page.setViewport({ width: 1440, height: 900 });

  // 3. Plans Desktop
  console.log('Capturing: 03_desktop_plans.png');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_desktop_plans.png'), fullPage: false });

  // 4. Gym Detail Desktop
  console.log('Capturing: 04_desktop_gym_detail.png');
  await page.goto(`${BASE_URL}/gyms/gym-basic-1`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_desktop_gym_detail.png'), fullPage: false });

  // 5. Account Desktop (Member)
  console.log('Capturing: 05_desktop_account.png');
  await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), memberAuth.token);
  await page.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_desktop_account.png'), fullPage: false });

  // 6. Reception Desktop (Staff)
  console.log('Capturing: 06_desktop_reception.png');
  await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), staffAuth.token);
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_desktop_reception.png'), fullPage: false });

  // 7. Admin Desktop (Admin)
  console.log('Capturing: 07_desktop_admin.png');
  await page.evaluate((tok) => localStorage.setItem('gym_app_token', tok), adminAuth.token);
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_desktop_admin.png'), fullPage: false });

  await browser.close();
  console.log('--- ALL 7 VIEWS CAPTURED SUCCESSFULLY ---');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
