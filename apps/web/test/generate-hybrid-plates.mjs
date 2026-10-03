import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:/Users/P30/.gemini/antigravity/brain/3674d34a-ad71-4a47-a78b-1be589aa10a0/hybrid_validation';
const DOCS_DIR = 'c:/Users/P30/Desktop/Gravity/gym app/docs/hybrid_real_ui_validation';
const DIR_OLD = 'c:/Users/P30/Desktop/Gravity/gym app/docs/real_ui_color_prototypes';

async function generateAllPlates() {
  console.log('⚡ Generating all Direction E plates...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  // 1. E1 vs E2 vs E3 Micro-variants Plate
  console.log('1. Micro-variants plate (E1 vs E2 vs E3)...');
  const imgE1 = fs.readFileSync(path.join(DOCS_DIR, 'direction_e1_01_desktop_home.png')).toString('base64');
  const imgE2 = fs.readFileSync(path.join(DOCS_DIR, 'direction_e2_01_desktop_home.png')).toString('base64');
  const imgE3 = fs.readFileSync(path.join(DOCS_DIR, 'direction_e3_01_desktop_home.png')).toString('base64');

  const microHtml = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8">
      <style>
        body { background: #06080A; margin: 0; padding: 20px; font-family: sans-serif; color: #FFF; width: 1720px; box-sizing: border-box; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1D232C; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 800; }
        .badge { background: #182218; color: #D4FF00; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid #2B3D2B; }
        .grid { display: flex; gap: 16px; direction: ltr; }
        .card { flex: 1; background: #0E1217; border-radius: 12px; border: 1px solid #1E2530; overflow: hidden; }
        .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; border-bottom: 1px solid #1E2530; direction: rtl; }
        .card-header.E1 { border-top: 3px solid #D4FF00; color: #D4FF00; }
        .card-header.E2 { border-top: 3px solid #C8F500; color: #C8F500; }
        .card-header.E3 { border-top: 3px solid #C2EF00; color: #C2EF00; }
        .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
        img { width: 100%; height: auto; display: block; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">مقایسه ریز-واریانت‌های Direction E در UI واقعی (Homepage Desktop)</div>
        <div class="badge">Hybrid Range Stability Test</div>
      </div>
      <div class="grid">
        <div class="card">
          <div class="card-header E1">
            <div>E1 — Kinetic Citron Baseline</div>
            <span>#D4FF00 / L: 50.0%</span>
          </div>
          <img src="data:image/png;base64,${imgE1}" />
        </div>
        <div class="card">
          <div class="card-header E2">
            <div>E2 — Calibrated Athletic Citron</div>
            <span>#C8F500 / L: 48.0%</span>
          </div>
          <img src="data:image/png;base64,${imgE2}" />
        </div>
        <div class="card">
          <div class="card-header E3">
            <div>E3 — Deep Chartreuse Citron</div>
            <span>#C2EF00 / L: 46.9%</span>
          </div>
          <img src="data:image/png;base64,${imgE3}" />
        </div>
      </div>
    </body>
    </html>
  `;

  const p1 = await browser.newPage();
  await p1.setViewport({ width: 1760, height: 600 });
  await p1.setContent(microHtml, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 500));
  await p1.screenshot({ path: path.join(DOCS_DIR, 'plate_compare_e_micro_variants.png') });
  fs.copyFileSync(path.join(DOCS_DIR, 'plate_compare_e_micro_variants.png'), path.join(ARTIFACT_DIR, 'plate_compare_e_micro_variants.png'));
  console.log('✓ Saved plate_compare_e_micro_variants.png');
  await p1.close();

  // 2. Direct A vs E Comparison Plates (6 views)
  const A_VS_E_VIEWS = [
    { key: '01_desktop_home', title: 'صفحه اصلی دسکتاپ (Homepage Desktop)', isMobile: false },
    { key: '02_desktop_plans', title: 'صفحه پلن‌ها و قیمت‌گذاری (Plans & Pricing)', isMobile: false },
    { key: '04_desktop_account', title: 'حساب کاربری ورزشکار (Member Account)', isMobile: false },
    { key: '05_desktop_reception', title: 'کانتر پذیرش باشگاه (Reception Kiosk)', isMobile: false },
    { key: '06_desktop_admin', title: 'داشبورد مدیریت و اقتصاد (Admin Dashboard)', isMobile: false },
    { key: '07_mobile_home', title: 'صفحه اصلی موبایل (Mobile Home 390px)', isMobile: true }
  ];

  for (const cv of A_VS_E_VIEWS) {
    console.log(`2. A vs E plate: ${cv.key}...`);
    const imgA = fs.readFileSync(path.join(DIR_OLD, `direction_a_${cv.key}.png`)).toString('base64');
    const imgE = fs.readFileSync(path.join(DOCS_DIR, `direction_e1_${cv.key}.png`)).toString('base64');

    const vpWidth = cv.isMobile ? 1200 : 1720;
    const vpHours = cv.isMobile ? 1000 : 700;

    const compHtml = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8">
        <style>
          body { background: #06080A; margin: 0; padding: 20px; font-family: sans-serif; color: #FFF; width: ${vpWidth}px; box-sizing: border-box; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1D232C; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 20px; font-weight: 800; }
          .badge { background: #141B18; color: #D4FF00; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid #233123; }
          .grid { display: flex; gap: 20px; direction: ltr; }
          .card { flex: 1; background: #0E1217; border-radius: 12px; border: 1px solid #1E2530; overflow: hidden; }
          .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; border-bottom: 1px solid #1E2530; direction: rtl; }
          .card-header.A { border-top: 3px solid #B8FF2C; color: #B8FF2C; }
          .card-header.E { border-top: 3px solid #D4FF00; color: #D4FF00; }
          .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
          img { width: 100%; height: auto; display: block; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">مقایسه مستقیم Direction A در برابر Direction E — ${cv.title}</div>
          <div class="badge">A vs E Real-UI Validation</div>
        </div>
        <div class="grid">
          <div class="card">
            <div class="card-header A">
              <div>Direction A — Volt Lime (نسخه اولیه)</div>
              <span>#B8FF2C / Obsidian Dark</span>
            </div>
            <img src="data:image/png;base64,${imgA}" />
          </div>
          <div class="card">
            <div class="card-header E">
              <div>Direction E — Kinetic Citron (سنتز هایبرید)</div>
              <span>#D4FF00 / Pure Graphite</span>
            </div>
            <img src="data:image/png;base64,${imgE}" />
          </div>
        </div>
      </body>
      </html>
    `;

    const page = await browser.newPage();
    await page.setViewport({ width: vpWidth, height: vpHours });
    await page.setContent(compHtml, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 500));
    const filename = `plate_compare_a_vs_e_${cv.key}.png`;
    await page.screenshot({ path: path.join(DOCS_DIR, filename) });
    fs.copyFileSync(path.join(DOCS_DIR, filename), path.join(ARTIFACT_DIR, filename));
    console.log(`✓ Saved ${filename}`);
    await page.close();
  }

  // 3. 7-view Composite Plate for Direction E
  console.log('3. 7-view Composite Plate for Direction E...');
  const eImgs = {};
  const ALL_VIEWS = [
    { key: '01_desktop_home', name: '۱. صفحه اصلی دسکتاپ' },
    { key: '02_desktop_plans', name: '۲. پلن‌ها و قیمت‌گذاری' },
    { key: '03_desktop_gym_detail', name: '۳. جزئیات باشگاه' },
    { key: '04_desktop_account', name: '۴. حساب کاربری ورزشکار' },
    { key: '05_desktop_reception', name: '۵. کانتر پذیرش باشگاه' },
    { key: '06_desktop_admin', name: '۶. داشبورد مدیریت و اقتصاد' }
  ];

  for (const v of ALL_VIEWS) {
    eImgs[v.key] = fs.readFileSync(path.join(DOCS_DIR, `direction_e1_${v.key}.png`)).toString('base64');
  }

  const allHtml = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8">
      <style>
        body { background: #06080A; margin: 0; padding: 20px; font-family: sans-serif; color: #FFF; width: 1720px; box-sizing: border-box; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1D232C; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 800; color: #D4FF00; }
        .badge { background: #141B18; color: #D4FF00; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid #233123; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; direction: ltr; }
        .card { background: #0E1217; border-radius: 12px; border: 1px solid #1E2530; overflow: hidden; }
        .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; border-bottom: 1px solid #1E2530; border-top: 3px solid #D4FF00; direction: rtl; color: #D4FF00; }
        .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
        img { width: 100%; height: auto; display: block; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">Direction E — Kinetic Citron (#D4FF00) ماتریس نمای کامل ۶ صفحه دسکتاپ</div>
        <div class="badge">Hybrid Desktop Composite Matrix</div>
      </div>
      <div class="grid">
        ${ALL_VIEWS.map(v => `
          <div class="card">
            <div class="card-header"><div>${v.name}</div><span>${v.key}</span></div>
            <img src="data:image/png;base64,${eImgs[v.key]}" />
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;

  const allPage = await browser.newPage();
  await allPage.setViewport({ width: 1760, height: 860 });
  await allPage.setContent(allHtml, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await allPage.screenshot({ path: path.join(DOCS_DIR, 'plate_direction_e_7_views.png') });
  fs.copyFileSync(path.join(DOCS_DIR, 'plate_direction_e_7_views.png'), path.join(ARTIFACT_DIR, 'plate_direction_e_7_views.png'));
  console.log('✓ Saved plate_direction_e_7_views.png');
  await allPage.close();

  await browser.close();
  console.log('🎉 ALL plates generated successfully!');
}

generateAllPlates().catch(err => {
  console.error(err);
  process.exit(1);
});
