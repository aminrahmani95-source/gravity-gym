import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:/Users/P30/.gemini/antigravity/brain/3674d34a-ad71-4a47-a78b-1be589aa10a0/frozen_validation';
const DOCS_DIR = 'c:/Users/P30/Desktop/Gravity/gym app/docs/frozen_validation';

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Copy screenshots to docs directory as well
const views = [
  '01_desktop_home.png',
  '02_mobile_home_390.png',
  '03_desktop_plans.png',
  '04_desktop_gym_detail.png',
  '05_desktop_account.png',
  '06_desktop_reception.png',
  '07_desktop_admin.png'
];

views.forEach(f => {
  const src = path.join(ARTIFACT_DIR, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DOCS_DIR, f));
  }
});

async function generateOverviewPlate() {
  console.log('Generating Frozen Color System 7-View Plate...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const imgHome = fs.readFileSync(path.join(ARTIFACT_DIR, '01_desktop_home.png')).toString('base64');
  const imgMobile = fs.readFileSync(path.join(ARTIFACT_DIR, '02_mobile_home_390.png')).toString('base64');
  const imgPlans = fs.readFileSync(path.join(ARTIFACT_DIR, '03_desktop_plans.png')).toString('base64');
  const imgGym = fs.readFileSync(path.join(ARTIFACT_DIR, '04_desktop_gym_detail.png')).toString('base64');
  const imgAccount = fs.readFileSync(path.join(ARTIFACT_DIR, '05_desktop_account.png')).toString('base64');
  const imgReception = fs.readFileSync(path.join(ARTIFACT_DIR, '06_desktop_reception.png')).toString('base64');
  const imgAdmin = fs.readFileSync(path.join(ARTIFACT_DIR, '07_desktop_admin.png')).toString('base64');

  const html = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8">
      <style>
        body { background: #080A0C; margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #F4F5F2; width: 1920px; box-sizing: border-box; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #272B30; padding-bottom: 16px; margin-bottom: 24px; }
        .title { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; display: flex; align-items: center; gap: 12px; }
        .dot { width: 16px; height: 16px; border-radius: 50%; background: #C8F500; display: inline-block; box-shadow: 0 0 16px rgba(200, 245, 0, 0.6); }
        .badge { background: rgba(200, 245, 0, 0.12); color: #C8F500; padding: 6px 18px; border-radius: 9999px; font-size: 14px; font-weight: 800; border: 1px solid rgba(200, 245, 0, 0.3); }
        .tokens { display: flex; gap: 20px; font-size: 13px; color: #9CA3A8; font-family: monospace; }
        .token-item { display: flex; align-items: center; gap: 6px; }
        .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
        
        .grid-top { display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 18px; margin-bottom: 18px; }
        .grid-bottom { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 18px; }
        
        .card { background: #121517; border-radius: 16px; border: 1px solid #272B30; overflow: hidden; display: flex; flex-direction: column; }
        .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; border-bottom: 1px solid #202428; }
        .card-header span { color: #9CA3A8; font-size: 11px; font-weight: 500; font-family: monospace; }
        .card img { width: 100%; display: block; object-fit: cover; }
        .card.mobile img { max-height: 480px; object-fit: contain; background: #0D0F10; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">
          <span class="dot"></span>
          <span>GRAVITY — OFFICIAL PRODUCTION COLOR SYSTEM (FROZEN)</span>
        </div>
        <div class="tokens">
          <div class="token-item"><span class="swatch" style="background:#C8F500"></span> Primary: #C8F500</div>
          <div class="token-item"><span class="swatch" style="background:#D6FB33"></span> Hover: #D6FB33</div>
          <div class="token-item"><span class="swatch" style="background:#B3DC00"></span> Active: #B3DC00</div>
          <div class="token-item"><span class="swatch" style="background:#0D0F11; border:1px solid #444"></span> On-Primary: #0D0F11 (14.2:1)</div>
        </div>
        <div class="badge">SYSTEM STATUS: FROZEN</div>
      </div>

      <div class="grid-top">
        <div class="card">
          <div class="card-header">
            <div>1. Homepage (صفحه اصلی)</div>
            <span>DESKTOP 1440px</span>
          </div>
          <img src="data:image/png;base64,${imgHome}">
        </div>

        <div class="card mobile">
          <div class="card-header">
            <div>2. Mobile Home (نمای موبایل)</div>
            <span>VIEWPORT 390px</span>
          </div>
          <img src="data:image/png;base64,${imgMobile}">
        </div>

        <div class="card">
          <div class="card-header">
            <div>3. Plans & Pricing (پلن‌های اعتباری)</div>
            <span>DESKTOP 1440px</span>
          </div>
          <img src="data:image/png;base64,${imgPlans}">
        </div>
      </div>

      <div class="grid-bottom">
        <div class="card">
          <div class="card-header">
            <div>4. Gym Detail (جزییات مجموعه)</div>
            <span>DESKTOP 1440px</span>
          </div>
          <img src="data:image/png;base64,${imgGym}">
        </div>

        <div class="card">
          <div class="card-header">
            <div>5. Member Account (حساب ورزشکار)</div>
            <span>DESKTOP 1440px</span>
          </div>
          <img src="data:image/png;base64,${imgAccount}">
        </div>

        <div class="card">
          <div class="card-header">
            <div>6. Reception Kiosk (کانتر پذیرش)</div>
            <span>DESKTOP 1440px</span>
          </div>
          <img src="data:image/png;base64,${imgReception}">
        </div>

        <div class="card">
          <div class="card-header">
            <div>7. Admin Economics (پنل مدیریت)</div>
            <span>DESKTOP 1440px</span>
          </div>
          <img src="data:image/png;base64,${imgAdmin}">
        </div>
      </div>
    </body>
    </html>
  `;

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1180, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));

  const outPath1 = path.join(ARTIFACT_DIR, 'plate_frozen_color_system_7_views.png');
  const outPath2 = path.join(DOCS_DIR, 'plate_frozen_color_system_7_views.png');
  await page.screenshot({ path: outPath1, fullPage: true });
  await page.screenshot({ path: outPath2, fullPage: true });

  await browser.close();
  console.log('Plate generated successfully at:', outPath1);
}

generateOverviewPlate().catch(err => {
  console.error(err);
  process.exit(1);
});
