import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:/Users/P30/.gemini/antigravity/brain/3674d34a-ad71-4a47-a78b-1be589aa10a0/hybrid_validation';
const DOCS_DIR = 'c:/Users/P30/Desktop/Gravity/gym app/docs/hybrid_real_ui_validation';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://localhost:4000/api/v1';

for (const d of [ARTIFACT_DIR, DOCS_DIR]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// Direction E Variants
const VARIANTS = {
  E1: {
    key: 'e1',
    name: 'Direction E1 (Kinetic Citron Baseline)',
    primary: '#D4FF00',
    primaryHover: '#E2FF38',
    primaryActive: '#BFE600',
    primaryMuted08: 'rgba(212, 255, 0, 0.08)',
    primaryMuted12: 'rgba(212, 255, 0, 0.12)',
    primaryBorder20: 'rgba(212, 255, 0, 0.20)',
    primaryBorder30: 'rgba(212, 255, 0, 0.30)',
    primary80: 'rgba(212, 255, 0, 0.80)',
    onPrimary: '#0D0F11',
    bg: '#0D0F11',
    surface: '#15181B',
    surfaceSec: '#1D2125',
    surfaceElevated: '#22272C',
    border: '#272B30',
    borderSubtle: '#202428',
    borderStrong: '#353B41',
    borderHover: '#4B535B',
    textPrimary: '#F4F5F2',
    textSecondary: '#C4C8CC',
    textMuted: '#9CA3A8',
  },
  E2: {
    key: 'e2',
    name: 'Direction E2 (Calibrated Athletic Citron)',
    primary: '#C8F500',
    primaryHover: '#D6FB33',
    primaryActive: '#B3DC00',
    primaryMuted08: 'rgba(200, 245, 0, 0.08)',
    primaryMuted12: 'rgba(200, 245, 0, 0.12)',
    primaryBorder20: 'rgba(200, 245, 0, 0.20)',
    primaryBorder30: 'rgba(200, 245, 0, 0.30)',
    primary80: 'rgba(200, 245, 0, 0.80)',
    onPrimary: '#0D0F11',
    bg: '#0D0F11',
    surface: '#15181B',
    surfaceSec: '#1D2125',
    surfaceElevated: '#22272C',
    border: '#272B30',
    borderSubtle: '#202428',
    borderStrong: '#353B41',
    borderHover: '#4B535B',
    textPrimary: '#F4F5F2',
    textSecondary: '#C4C8CC',
    textMuted: '#9CA3A8',
  },
  E3: {
    key: 'e3',
    name: 'Direction E3 (Deep Chartreuse Citron)',
    primary: '#C2EF00',
    primaryHover: '#CFF533',
    primaryActive: '#ADD500',
    primaryMuted08: 'rgba(194, 239, 0, 0.08)',
    primaryMuted12: 'rgba(194, 239, 0, 0.12)',
    primaryBorder20: 'rgba(194, 239, 0, 0.20)',
    primaryBorder30: 'rgba(194, 239, 0, 0.30)',
    primary80: 'rgba(194, 239, 0, 0.80)',
    onPrimary: '#0D0F11',
    bg: '#0D0F11',
    surface: '#15181B',
    surfaceSec: '#1D2125',
    surfaceElevated: '#22272C',
    border: '#272B30',
    borderSubtle: '#202428',
    borderStrong: '#353B41',
    borderHover: '#4B535B',
    textPrimary: '#F4F5F2',
    textSecondary: '#C4C8CC',
    textMuted: '#9CA3A8',
  }
};

function generateRestrainedThemeCSS(v) {
  return `
    :root {
      --gravity-bg: ${v.bg} !important;
      --gravity-surface: ${v.surface} !important;
      --gravity-surface-secondary: ${v.surfaceSec} !important;
      --gravity-surface-elevated: ${v.surfaceElevated} !important;
      --gravity-lime: ${v.primary} !important;
      --gravity-lime-hover: ${v.primaryHover} !important;
      --gravity-lime-active: ${v.primaryActive} !important;
      --gravity-lime-muted: ${v.primaryMuted08} !important;
      --gravity-border: ${v.border} !important;
      --gravity-border-subtle: ${v.borderSubtle} !important;
      --gravity-border-strong: ${v.borderStrong} !important;
      --gravity-text-primary: ${v.textPrimary} !important;
      --gravity-text-secondary: ${v.textSecondary} !important;
      --gravity-text-muted: ${v.textMuted} !important;
    }

    body, html, [class*="bg-[#0D0F10]"], .bg-gravity-bg {
      background-color: ${v.bg} !important;
    }
    [class*="bg-[#15181B]"], .bg-gravity-surface {
      background-color: ${v.surface} !important;
    }
    [class*="bg-[#1D2125]"], .bg-gravity-surface-secondary {
      background-color: ${v.surfaceSec} !important;
    }
    [class*="bg-[#22272C]"], .bg-gravity-surface-elevated {
      background-color: ${v.surfaceElevated} !important;
    }

    /* Primary CTA and active buttons */
    [class*="bg-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]/"]) {
      background-color: ${v.primary} !important;
      color: ${v.onPrimary} !important;
      box-shadow: 0 4px 14px ${v.primaryMuted12} !important;
    }
    [class*="bg-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]/"]) * {
      color: ${v.onPrimary} !important;
    }

    /* Restrained accent tints - max 8-12% opacity */
    [class*="bg-[#B8FF2C]/10"] {
      background-color: ${v.primaryMuted08} !important;
    }
    [class*="bg-[#B8FF2C]/15"] {
      background-color: ${v.primaryMuted12} !important;
    }

    /* Text accents */
    [class*="text-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]/"])) {
      color: ${v.primary} !important;
    }
    [class*="text-[#B8FF2C]/80"] {
      color: ${v.primary80} !important;
    }

    /* Restrained borders - subtle accent only on key selected/focused states */
    [class*="border-[#B8FF2C]"]:not([class*="border-[#B8FF2C]/"]) {
      border-color: ${v.primary} !important;
    }
    [class*="border-[#B8FF2C]/20"], [class*="border-[#B8FF2C]/25"] {
      border-color: ${v.primaryBorder20} !important;
    }
    [class*="border-[#B8FF2C]/30"], [class*="border-[#B8FF2C]/40"], [class*="border-[#B8FF2C]/50"] {
      border-color: ${v.primaryBorder30} !important;
    }

    /* Neutral borders */
    [class*="border-[#272B30]"], .border-gravity {
      border-color: ${v.border} !important;
    }
    [class*="border-[#353B41]"], .border-gravity-strong {
      border-color: ${v.borderStrong} !important;
    }

    /* Typography */
    [class*="text-[#F4F5F2]"] {
      color: ${v.textPrimary} !important;
    }
    [class*="text-[#C4C8CC]"] {
      color: ${v.textSecondary} !important;
    }
    [class*="text-[#9CA3A8]"] {
      color: ${v.textMuted} !important;
    }
  `;
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

const VIEWS = [
  { key: '01_desktop_home', url: '/', width: 1280, height: 800, role: 'guest', name: 'صفحه اصلی دسکتاپ' },
  { key: '02_desktop_plans', url: '/plans', width: 1280, height: 800, role: 'guest', name: 'صفحه پلن‌ها و قیمت‌گذاری' },
  { key: '03_desktop_gym_detail', url: '/gyms/gym-elite-4', width: 1280, height: 800, role: 'guest', name: 'صفحه جزئیات باشگاه' },
  { key: '04_desktop_account', url: '/account', width: 1280, height: 800, role: 'member', name: 'حساب کاربری ورزشکار' },
  { key: '05_desktop_reception', url: '/reception', width: 1280, height: 800, role: 'staff', name: 'کانتر پذیرش باشگاه' },
  { key: '06_desktop_admin', url: '/admin', width: 1280, height: 800, role: 'admin', name: 'داشبورد مدیریت و اقتصاد' },
  { key: '07_mobile_home', url: '/', width: 390, height: 844, role: 'guest', name: 'صفحه اصلی موبایل' }
];

async function runValidation() {
  console.log('⚡ Starting Direction E (Hybrid / Kinetic Citron) Real-UI Validation...');

  const tokens = {
    member: await getJwtToken('09120000003'),
    staff: await getJwtToken('09120000002'),
    admin: await getJwtToken('09120000001')
  };

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

  // 1. Capture E1 across all 7 views
  console.log('\n🎨 Capturing Baseline Direction E1 (#D4FF00) across 7 views...');
  const cssE1 = generateRestrainedThemeCSS(VARIANTS.E1);

  for (const v of VIEWS) {
    await page.setViewport({ width: v.width, height: v.height });

    if (v.role === 'guest') {
      await page.evaluate(() => localStorage.removeItem('gym_app_token'));
    } else {
      await page.evaluate(tok => localStorage.setItem('gym_app_token', tok), tokens[v.role]);
    }

    await page.goto(`${BASE_URL}${v.url}`, { waitUntil: 'networkidle2' });
    await page.addStyleTag({ content: cssE1 });
    await new Promise(r => setTimeout(r, 600));

    const filename = `direction_e1_${v.key}.png`;
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    const docsPath = path.join(DOCS_DIR, filename);

    await page.screenshot({ path: artifactPath, fullPage: false });
    fs.copyFileSync(artifactPath, docsPath);
    console.log(`  ✓ Saved E1: ${filename}`);
  }

  // 2. Capture micro-variants E2 and E3 on key sample views (Home, Plans, Account)
  for (const vKey of ['E2', 'E3']) {
    const variant = VARIANTS[vKey];
    console.log(`\n🎨 Capturing Micro-variant ${variant.name} (${variant.primary})...`);
    const cssVar = generateRestrainedThemeCSS(variant);

    for (const v of [VIEWS[0], VIEWS[1], VIEWS[3]]) { // Home, Plans, Account
      await page.setViewport({ width: v.width, height: v.height });

      if (v.role === 'guest') {
        await page.evaluate(() => localStorage.removeItem('gym_app_token'));
      } else {
        await page.evaluate(tok => localStorage.setItem('gym_app_token', tok), tokens[v.role]);
      }

      await page.goto(`${BASE_URL}${v.url}`, { waitUntil: 'networkidle2' });
      await page.addStyleTag({ content: cssVar });
      await new Promise(r => setTimeout(r, 600));

      const filename = `direction_${variant.key}_${v.key}.png`;
      const artifactPath = path.join(ARTIFACT_DIR, filename);
      const docsPath = path.join(DOCS_DIR, filename);

      await page.screenshot({ path: artifactPath, fullPage: false });
      fs.copyFileSync(artifactPath, docsPath);
      console.log(`  ✓ Saved ${vKey}: ${filename}`);
    }
  }

  // 3. Create Micro-variants Comparison Plate (E1 vs E2 vs E3 on Home and Plans)
  console.log('\n🖼️ Creating Micro-variants Comparison Plate (E1 vs E2 vs E3)...');
  const imgHomeE1 = fs.readFileSync(path.join(DOCS_DIR, 'direction_e1_01_desktop_home.png')).toString('base64');
  const imgHomeE2 = fs.readFileSync(path.join(DOCS_DIR, 'direction_e2_01_desktop_home.png')).toString('base64');
  const imgHomeE3 = fs.readFileSync(path.join(DOCS_DIR, 'direction_e3_01_desktop_home.png')).toString('base64');

  const microPlateHtml = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
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
          width: 1720px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #1D232C;
          padding-bottom: 12px;
        }
        .title { font-size: 20px; font-weight: 800; }
        .badge { background: #182218; color: #D4FF00; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid #2B3D2B; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; direction: ltr; }
        .card { background: #0E1217; border-radius: 12px; border: 1px solid #1E2530; overflow: hidden; display: flex; flex-direction: column; }
        .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; border-bottom: 1px solid #1E2530; direction: rtl; }
        .card-header.E1 { border-top: 3px solid #D4FF00; color: #D4FF00; }
        .card-header.E2 { border-top: 3px solid #C8F500; color: #C8F500; }
        .card-header.E3 { border-top: 3px solid #C2EF00; color: #C2EF00; }
        .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
        .img-wrap { width: 100%; background: #000; overflow: hidden; }
        img { width: 100%; height: auto; display: block; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">مقایسه ریز-واریانت‌های Direction E (E1 vs E2 vs E3) در UI واقعی</div>
        <div class="badge">Hybrid Range Stability Test</div>
      </div>
      <div class="grid">
        <div class="card">
          <div class="card-header E1">
            <div>E1 — Kinetic Citron Baseline</div>
            <span>#D4FF00 / L: 50%</span>
          </div>
          <div class="img-wrap"><img src="data:image/png;base64,${imgHomeE1}" /></div>
        </div>
        <div class="card">
          <div class="card-header E2">
            <div>E2 — Calibrated Athletic Citron</div>
            <span>#C8F500 / L: 48%</span>
          </div>
          <div class="img-wrap"><img src="data:image/png;base64,${imgHomeE2}" /></div>
        </div>
        <div class="card">
          <div class="card-header E3">
            <div>E3 — Deep Chartreuse Citron</div>
            <span>#C2EF00 / L: 46.9%</span>
          </div>
          <div class="img-wrap"><img src="data:image/png;base64,${imgHomeE3}" /></div>
        </div>
      </div>
    </body>
    </html>
  `;

  const microPage = await browser.newPage();
  await microPage.setViewport({ width: 1720, height: 720 });
  await microPage.setContent(microPlateHtml, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));
  const microPlatePath = path.join(DOCS_DIR, 'plate_compare_e_micro_variants.png');
  await microPage.screenshot({ path: microPlatePath, fullPage: true });
  fs.copyFileSync(microPlatePath, path.join(ARTIFACT_DIR, 'plate_compare_e_micro_variants.png'));
  console.log('  ✓ Saved: plate_compare_e_micro_variants.png');
  await microPage.close();

  // 4. Create Direct A vs E Side-by-Side Comparison Plates
  console.log('\n🖼️ Creating Direct A vs E Side-by-Side Comparison Plates...');
  const DIR_OLD = 'c:/Users/P30/Desktop/Gravity/gym app/docs/real_ui_color_prototypes';

  const COMPARISON_VIEWS = [
    { key: '01_desktop_home', title: 'صفحه اصلی دسکتاپ (Homepage Desktop)', isMobile: false },
    { key: '02_desktop_plans', title: 'صفحه پلن‌ها و قیمت‌گذاری (Plans & Pricing)', isMobile: false },
    { key: '04_desktop_account', title: 'حساب کاربری ورزشکار (Member Account)', isMobile: false },
    { key: '05_desktop_reception', title: 'کانتر پذیرش باشگاه (Reception Kiosk)', isMobile: false },
    { key: '06_desktop_admin', title: 'داشبورد مدیریت و اقتصاد (Admin Dashboard)', isMobile: false },
    { key: '07_mobile_home', title: 'صفحه اصلی موبایل (Mobile Home 390px)', isMobile: true }
  ];

  for (const cv of COMPARISON_VIEWS) {
    const imgA = fs.readFileSync(path.join(DIR_OLD, `direction_a_${cv.key}.png`)).toString('base64');
    const imgE = fs.readFileSync(path.join(DOCS_DIR, `direction_e1_${cv.key}.png`)).toString('base64');

    const width = cv.isMobile ? 1200 : 1680;
    const height = cv.isMobile ? 960 : 780;

    const compHtml = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
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
          }
          .title { font-size: 20px; font-weight: 800; }
          .badge { background: #121915; color: #D4FF00; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid #233123; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; direction: ltr; }
          .card { background: #0E1217; border-radius: 12px; border: 1px solid #1E2530; overflow: hidden; display: flex; flex-direction: column; }
          .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; border-bottom: 1px solid #1E2530; direction: rtl; }
          .card-header.A { border-top: 3px solid #B8FF2C; color: #B8FF2C; }
          .card-header.E { border-top: 3px solid #D4FF00; color: #D4FF00; }
          .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
          .img-wrap { width: 100%; background: #000; overflow: hidden; }
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
            <div class="img-wrap"><img src="data:image/png;base64,${imgA}" /></div>
          </div>
          <div class="card">
            <div class="card-header E">
              <div>Direction E — Kinetic Citron (سنتز هایبرید)</div>
              <span>#D4FF00 / Pure Graphite</span>
            </div>
            <div class="img-wrap"><img src="data:image/png;base64,${imgE}" /></div>
          </div>
        </div>
      </body>
      </html>
    `;

    const cPage = await browser.newPage();
    await cPage.setViewport({ width, height });
    await cPage.setContent(compHtml, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 400));

    const compFilename = `plate_compare_a_vs_e_${cv.key}.png`;
    const artifactPath = path.join(ARTIFACT_DIR, compFilename);
    const docsPath = path.join(DOCS_DIR, compFilename);

    await cPage.screenshot({ path: artifactPath, fullPage: true });
    fs.copyFileSync(artifactPath, docsPath);
    console.log(`  ✓ Saved A vs E: ${compFilename}`);
    await cPage.close();
  }

  // 5. Create 7-view Composite Plate for Direction E
  console.log('\n🖼️ Creating 7-view Composite Plate for Direction E...');
  const eImages = {};
  for (const v of VIEWS) {
    eImages[v.key] = fs.readFileSync(path.join(DOCS_DIR, `direction_e1_${v.key}.png`)).toString('base64');
  }

  const allPlateHtml = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
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
          width: 1720px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #1D232C;
          padding-bottom: 12px;
        }
        .title { font-size: 22px; font-weight: 800; color: #D4FF00; }
        .badge { background: #182218; color: #D4FF00; padding: 5px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid #2B3D2B; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; direction: ltr; }
        .card { background: #0E1217; border-radius: 12px; border: 1px solid #1E2530; overflow: hidden; display: flex; flex-direction: column; }
        .card-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; border-bottom: 1px solid #1E2530; border-top: 3px solid #D4FF00; direction: rtl; color: #D4FF00; }
        .card-header span { color: #8F9BA8; font-size: 12px; font-weight: 500; }
        .img-wrap { width: 100%; background: #000; overflow: hidden; }
        img { width: 100%; height: auto; display: block; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">Direction E — Kinetic Citron (#D4FF00) ماتریس نمای کامل ۷ گانه</div>
        <div class="badge">Hybrid 7-View Composite Plate</div>
      </div>
      <div class="grid">
        <div class="card">
          <div class="card-header"><div>۱. صفحه اصلی دسکتاپ</div><span>Homepage Desktop</span></div>
          <div class="img-wrap"><img src="data:image/png;base64,${eImages['01_desktop_home']}" /></div>
        </div>
        <div class="card">
          <div class="card-header"><div>۲. پلن‌ها و قیمت‌گذاری</div><span>Plans & Pricing</span></div>
          <div class="img-wrap"><img src="data:image/png;base64,${eImages['02_desktop_plans']}" /></div>
        </div>
        <div class="card">
          <div class="card-header"><div>۳. جزئیات باشگاه</div><span>Gym Detail</span></div>
          <div class="img-wrap"><img src="data:image/png;base64,${eImages['03_desktop_gym_detail']}" /></div>
        </div>
        <div class="card">
          <div class="card-header"><div>۴. حساب کاربری ورزشکار</div><span>Member Account</span></div>
          <div class="img-wrap"><img src="data:image/png;base64,${eImages['04_desktop_account']}" /></div>
        </div>
        <div class="card">
          <div class="card-header"><div>۵. کانتر پذیرش باشگاه</div><span>Reception Kiosk</span></div>
          <div class="img-wrap"><img src="data:image/png;base64,${eImages['05_desktop_reception']}" /></div>
        </div>
        <div class="card">
          <div class="card-header"><div>۶. داشبورد مدیریت و اقتصاد</div><span>Admin Dashboard</span></div>
          <div class="img-wrap"><img src="data:image/png;base64,${eImages['06_desktop_admin']}" /></div>
        </div>
      </div>
    </body>
    </html>
  `;

  const allPlatePage = await browser.newPage();
  await allPlatePage.setViewport({ width: 1720, height: 1100 });
  await allPlatePage.setContent(allPlateHtml, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));
  const allPlatePath = path.join(DOCS_DIR, 'plate_direction_e_7_views.png');
  await allPlatePage.screenshot({ path: allPlatePath, fullPage: true });
  fs.copyFileSync(allPlatePath, path.join(ARTIFACT_DIR, 'plate_direction_e_7_views.png'));
  console.log('  ✓ Saved: plate_direction_e_7_views.png');
  await allPlatePage.close();

  await browser.close();
  console.log('\n🎉 ALL Direction E captures, A vs E plates, and composite matrices created successfully!');
}

runValidation().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
