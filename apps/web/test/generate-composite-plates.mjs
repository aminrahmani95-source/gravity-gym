import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:/Users/P30/.gemini/antigravity/brain/3674d34a-ad71-4a47-a78b-1be589aa10a0/real_ui_prototypes';
const DOCS_DIR = 'c:/Users/P30/Desktop/Gravity/gym app/docs/real_ui_color_prototypes';

const VIEWS = [
  { key: '01_desktop_home', name: 'صفحه اصلی دسکتاپ (Homepage Desktop)', isMobile: false },
  { key: '02_desktop_plans', name: 'صفحه پلن‌ها و قیمت‌گذاری (Plans & Pricing)', isMobile: false },
  { key: '03_desktop_gym_detail', name: 'صفحه جزئیات باشگاه (Gym Detail)', isMobile: false },
  { key: '04_desktop_account', name: 'حساب کاربری ورزشکار (Member Account)', isMobile: false },
  { key: '05_desktop_reception', name: 'کانتر پذیرش باشگاه (Reception Kiosk)', isMobile: false },
  { key: '06_desktop_admin', name: 'داشبورد مدیریت و اقتصاد پلتفرم (Admin Dashboard)', isMobile: false },
  { key: '07_mobile_home', name: 'صفحه اصلی موبایل (Mobile Home 390px)', isMobile: true }
];

async function generatePlates() {
  console.log('⚡ Generating base64 composite comparison plates...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const v of VIEWS) {
    const imgA = fs.readFileSync(path.join(DOCS_DIR, `direction_a_${v.key}.png`)).toString('base64');
    const imgB = fs.readFileSync(path.join(DOCS_DIR, `direction_b_${v.key}.png`)).toString('base64');
    const imgC = fs.readFileSync(path.join(DOCS_DIR, `direction_c_${v.key}.png`)).toString('base64');
    const imgD = fs.readFileSync(path.join(DOCS_DIR, `direction_d_${v.key}.png`)).toString('base64');

    const width = v.isMobile ? 1640 : 1680;
    const height = v.isMobile ? 960 : 1240;

    const html = `
      <!DOCTYPE html>
      <html lang="fa">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: #06080A;
            font-family: system-ui, -apple-system, sans-serif;
            color: #FFFFFF;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: ${width}px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #1D232C;
            padding-bottom: 12px;
            direction: rtl;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          .badge {
            background: #141B24;
            color: #79A3FF;
            padding: 5px 14px;
            border-radius: 9999px;
            font-size: 13px;
            font-weight: 700;
            border: 1px solid #233145;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            direction: ltr;
          }
          .mobile-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            direction: ltr;
          }
          .card {
            background: #0E1217;
            border-radius: 12px;
            border: 1px solid #1E2530;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .card-header {
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 700;
            font-size: 14px;
            border-bottom: 1px solid #1E2530;
            direction: rtl;
          }
          .card-header.A { border-top: 3px solid #B8FF2C; color: #B8FF2C; }
          .card-header.B { border-top: 3px solid #00E599; color: #00E599; }
          .card-header.C { border-top: 3px solid #FF6B00; color: #FF6B00; }
          .card-header.D { border-top: 3px solid #3874FF; color: #3874FF; }
          .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
          .img-wrap {
            width: 100%;
            background: #000;
            overflow: hidden;
          }
          .mobile-img-wrap {
            width: 100%;
            height: 820px;
            background: #000;
            overflow: hidden;
          }
          img {
            width: 100%;
            height: auto;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${v.name} — مقایسه ۴ Direction در UI واقعی</div>
          <div class="badge">Gravity Real UI Color Direction Matrix</div>
        </div>
        <div class="${v.isMobile ? 'mobile-grid' : 'grid'}">
          <div class="card">
            <div class="card-header A">
              <div>Direction A — Volt Lime (ولت لایم)</div>
              <span>#B8FF2C / Obsidian Dark</span>
            </div>
            <div class="${v.isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="data:image/png;base64,${imgA}" />
            </div>
          </div>
          <div class="card">
            <div class="card-header B">
              <div>Direction B — Hyper Emerald (هایپر امرالد)</div>
              <span>#00E599 / Titanium Slate</span>
            </div>
            <div class="${v.isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="data:image/png;base64,${imgB}" />
            </div>
          </div>
          <div class="card">
            <div class="card-header C">
              <div>Direction C — Solar Blaze (سولار بلیز)</div>
              <span>#FF6B00 / Warm Carbon</span>
            </div>
            <div class="${v.isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="data:image/png;base64,${imgC}" />
            </div>
          </div>
          <div class="card">
            <div class="card-header D">
              <div>Direction D — Cobalt Frost (کبالت فراست)</div>
              <span>#3874FF / Midnight Slate</span>
            </div>
            <div class="${v.isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="data:image/png;base64,${imgD}" />
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 400));

    const filename = `plate_compare_${v.key}.png`;
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    const docsPath = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: artifactPath, fullPage: true });
    fs.copyFileSync(artifactPath, docsPath);
    console.log(`  ✓ Saved: ${filename}`);
    await page.close();
  }

  await browser.close();
  console.log('🎉 Finished generating all comparison plates!');
}

generatePlates().catch(err => {
  console.error(err);
  process.exit(1);
});
