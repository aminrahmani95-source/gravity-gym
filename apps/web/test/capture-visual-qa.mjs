import puppeteer from 'puppeteer-core';
import path from 'path';

async function captureVisualQA() {
  const ARTIFACTS_DIR = 'C:\\Users\\P30\\.gemini\\antigravity\\brain\\3674d34a-ad71-4a47-a78b-1be589aa10a0';
  const BASE_URL = 'http://127.0.0.1:3000';

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

  // Desktop captures
  await page.setViewport({ width: 1280, height: 900 });

  console.log('Capturing Desktop Home...');
  await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'preview_home.png') });

  console.log('Capturing Desktop Plans...');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'preview_plans.png') });

  console.log('Capturing Desktop Reception...');
  await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'preview_reception.png') });

  console.log('Capturing Desktop Admin...');
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'preview_admin.png') });

  // Mobile captures (iPhone 14 / modern smartphone view)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  console.log('Capturing Mobile Home...');
  await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'preview_mobile_home.png') });

  console.log('Capturing Mobile Plans...');
  await page.goto(`${BASE_URL}/plans`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'preview_mobile_plans.png') });

  await browser.close();
  console.log('Visual QA screenshots successfully saved to artifacts directory.');
}

captureVisualQA().catch(err => {
  console.error('Visual QA capture failed:', err);
  process.exit(1);
});
