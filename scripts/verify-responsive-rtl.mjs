// scripts/verify-responsive-rtl.mjs
// Mobile & RTL Verification Suite for Gravity Platform

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API_BASE = 'http://localhost:4000/api/v1';
const WEB_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0\\mobile_qa';

async function getJwtToken(phoneNumber) {
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

  return verifyRes.accessToken || verifyRes.token;
}

async function main() {
  console.log('====================================================');
  console.log('GRAVITY MOBILE VIEWPORT & RTL RESPONSIVENESS AUDIT');
  console.log('====================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  function record(name, passed, details = '') {
    results.push({ name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | ${name} ${details ? `(${details})` : ''}`);
  }

  try {
    const page = await browser.newPage();
    const adminToken = await getJwtToken('09120000001');

    // 1. Mobile Viewport (390 x 844)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Set auth token on base domain
    await page.goto(`${WEB_BASE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok) => {
      localStorage.setItem('gym_app_token', tok);
    }, adminToken);

    const routesToTest = [
      { name: 'Mobile Home', path: '/', screenshot: '01_mobile_home.png' },
      { name: 'Mobile Plans', path: '/plans', screenshot: '02_mobile_plans.png' },
      { name: 'Mobile Gym Detail', path: '/gyms/gym-elite-4', screenshot: '03_mobile_gym_detail.png' },
      { name: 'Mobile Member Account', path: '/account', screenshot: '04_mobile_account.png' },
      { name: 'Mobile Reception', path: '/reception', screenshot: '05_mobile_reception.png' },
      { name: 'Mobile Admin Panel', path: '/admin', screenshot: '06_mobile_admin.png' },
    ];

    for (const r of routesToTest) {
      await page.goto(`${WEB_BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(res => setTimeout(res, 1500));

      // Check RTL direction
      const dir = await page.evaluate(() => document.documentElement.getAttribute('dir') || document.body.getAttribute('dir'));
      const isRtl = dir === 'rtl';

      // Check Horizontal Overflow
      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = docEl.clientWidth;
        return { hasOverflow: scrollW > clientW + 2, scrollW, clientW };
      });

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, r.screenshot) });

      record(
        `${r.name} RTL & Layout`,
        isRtl && !overflow.hasOverflow,
        `RTL: ${isRtl ? 'OK' : 'MISSING'}, No Overflow: ${!overflow.hasOverflow ? 'OK' : `FAIL (${overflow.scrollW}px > ${overflow.clientW}px)`}`
      );
    }

    // 2. Tablet Viewport (768 x 1024)
    console.log('\n--- Tablet Viewport Audit (768 x 1024) ---');
    await page.close();
    const tabletPage = await browser.newPage();
    await tabletPage.setViewport({ width: 768, height: 1024 });

    await tabletPage.goto(`${WEB_BASE}/plans`, { waitUntil: 'domcontentloaded' });
    await new Promise(res => setTimeout(res, 1500));

    const tabletOverflow = await tabletPage.evaluate(() => {
      const docEl = document.documentElement;
      const scrollW = Math.max(docEl.scrollWidth, document.body.scrollWidth);
      const clientW = docEl.clientWidth;
      return { ok: scrollW <= clientW + 2, scrollW, clientW };
    });

    await tabletPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07_tablet_plans.png') });
    record('Tablet (768px) Grid & Flow', tabletOverflow.ok, `ScrollW: ${tabletOverflow.scrollW}px, ClientW: ${tabletOverflow.clientW}px`);

  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log('MOBILE & RTL AUDIT SUMMARY');
  console.log('====================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`Total: ${results.length} | Passed: ${results.filter(r => r.passed).length} | Failed: ${results.filter(r => !r.passed).length}`);
  if (allPassed) {
    console.log('✅ ALL MOBILE & RTL AUDITS PASSED WITH ZERO OVERFLOW');
    process.exit(0);
  } else {
    console.log('❌ SOME RESPONSIVE AUDITS FAILED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error during mobile/RTL verification:', err);
  process.exit(1);
});
