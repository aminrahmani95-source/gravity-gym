import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:/Users/P30/.gemini/antigravity/brain/3674d34a-ad71-4a47-a78b-1be589aa10a0/real_ui_prototypes';
const DOCS_DIR = 'c:/Users/P30/Desktop/Gravity/gym app/docs/real_ui_color_prototypes';
const BASE_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://localhost:4000/api/v1';

for (const d of [ARTIFACT_DIR, DOCS_DIR]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// Color direction definitions
const THEMES = {
  A: {
    key: 'A',
    name: 'Volt Lime',
    nameFa: 'ولت لایم',
    primary: '#B8FF2C',
    primaryHover: '#C5FF52',
    primaryActive: '#A8EF20',
    primaryMuted10: 'rgba(184, 255, 44, 0.10)',
    primaryMuted15: 'rgba(184, 255, 44, 0.15)',
    primaryBorder20: 'rgba(184, 255, 44, 0.20)',
    primaryBorder25: 'rgba(184, 255, 44, 0.25)',
    primaryBorder30: 'rgba(184, 255, 44, 0.30)',
    primaryBorder40: 'rgba(184, 255, 44, 0.40)',
    primaryBorder50: 'rgba(184, 255, 44, 0.50)',
    primary80: 'rgba(184, 255, 44, 0.80)',
    onPrimary: '#0D0F11',
    bg: '#0D0F10',
    bgInset: '#121517',
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
    textDisabled: '#62686D',
  },
  B: {
    key: 'B',
    name: 'Hyper Emerald',
    nameFa: 'هایپر امرالد',
    primary: '#00E599',
    primaryHover: '#1AFFAB',
    primaryActive: '#00CC88',
    primaryMuted10: 'rgba(0, 229, 153, 0.10)',
    primaryMuted15: 'rgba(0, 229, 153, 0.15)',
    primaryBorder20: 'rgba(0, 229, 153, 0.20)',
    primaryBorder25: 'rgba(0, 229, 153, 0.25)',
    primaryBorder30: 'rgba(0, 229, 153, 0.30)',
    primaryBorder40: 'rgba(0, 229, 153, 0.40)',
    primaryBorder50: 'rgba(0, 229, 153, 0.50)',
    primary80: 'rgba(0, 229, 153, 0.80)',
    onPrimary: '#0B0F12',
    bg: '#0B0F12',
    bgInset: '#0E1317',
    surface: '#131A1F',
    surfaceSec: '#1A242B',
    surfaceElevated: '#222F38',
    border: '#26323B',
    borderSubtle: '#1D272E',
    borderStrong: '#374652',
    borderHover: '#4C5D6C',
    textPrimary: '#F2F6F8',
    textSecondary: '#C0CCD6',
    textMuted: '#8A9BA8',
    textDisabled: '#586672',
  },
  C: {
    key: 'C',
    name: 'Solar Blaze',
    nameFa: 'سولار بلیز',
    primary: '#FF6B00',
    primaryHover: '#FF7F24',
    primaryActive: '#E65F00',
    primaryMuted10: 'rgba(255, 107, 0, 0.12)',
    primaryMuted15: 'rgba(255, 107, 0, 0.18)',
    primaryBorder20: 'rgba(255, 107, 0, 0.25)',
    primaryBorder25: 'rgba(255, 107, 0, 0.30)',
    primaryBorder30: 'rgba(255, 107, 0, 0.35)',
    primaryBorder40: 'rgba(255, 107, 0, 0.45)',
    primaryBorder50: 'rgba(255, 107, 0, 0.55)',
    primary80: 'rgba(255, 107, 0, 0.85)',
    onPrimary: '#0F0E0D',
    bg: '#0F0E0D',
    bgInset: '#141211',
    surface: '#191715',
    surfaceSec: '#23201D',
    surfaceElevated: '#2D2925',
    border: '#332D28',
    borderSubtle: '#27221E',
    borderStrong: '#4A413A',
    borderHover: '#61564C',
    textPrimary: '#F7F5F2',
    textSecondary: '#D1CBC5',
    textMuted: '#968E84',
    textDisabled: '#615B54',
  },
  D: {
    key: 'D',
    name: 'Cobalt Frost',
    nameFa: 'کبالت فراست',
    primary: '#3874FF',
    primaryHover: '#558AFF',
    primaryActive: '#2460EB',
    primaryMuted10: 'rgba(56, 116, 255, 0.12)',
    primaryMuted15: 'rgba(56, 116, 255, 0.18)',
    primaryBorder20: 'rgba(56, 116, 255, 0.25)',
    primaryBorder25: 'rgba(56, 116, 255, 0.30)',
    primaryBorder30: 'rgba(56, 116, 255, 0.35)',
    primaryBorder40: 'rgba(56, 116, 255, 0.45)',
    primaryBorder50: 'rgba(56, 116, 255, 0.55)',
    primary80: 'rgba(56, 116, 255, 0.85)',
    onPrimary: '#FFFFFF',
    bg: '#0A0D12',
    bgInset: '#0D1117',
    surface: '#121720',
    surfaceSec: '#19212E',
    surfaceElevated: '#212C3D',
    border: '#253042',
    borderSubtle: '#1B2432',
    borderStrong: '#384863',
    borderHover: '#4B5E80',
    textPrimary: '#F3F6FA',
    textSecondary: '#BFCAD9',
    textMuted: '#8694A6',
    textDisabled: '#546173',
  }
};

function generateThemeCSS(t) {
  return `
    :root {
      --gravity-bg: ${t.bg} !important;
      --gravity-surface: ${t.surface} !important;
      --gravity-surface-secondary: ${t.surfaceSec} !important;
      --gravity-surface-elevated: ${t.surfaceElevated} !important;
      --gravity-lime: ${t.primary} !important;
      --gravity-lime-hover: ${t.primaryHover} !important;
      --gravity-lime-active: ${t.primaryActive} !important;
      --gravity-lime-muted: ${t.primaryMuted15} !important;
      --gravity-border: ${t.border} !important;
      --gravity-border-subtle: ${t.borderSubtle} !important;
      --gravity-border-strong: ${t.borderStrong} !important;
      --gravity-text-primary: ${t.textPrimary} !important;
      --gravity-text-secondary: ${t.textSecondary} !important;
      --gravity-text-muted: ${t.textMuted} !important;
      --gravity-text-disabled: ${t.textDisabled} !important;
    }

    body, html, [class*="bg-[#0D0F10]"], .bg-gravity-bg {
      background-color: ${t.bg} !important;
    }
    [class*="bg-[#15181B]"], .bg-gravity-surface {
      background-color: ${t.surface} !important;
    }
    [class*="bg-[#1D2125]"], .bg-gravity-surface-secondary {
      background-color: ${t.surfaceSec} !important;
    }
    [class*="bg-[#22272C]"], .bg-gravity-surface-elevated {
      background-color: ${t.surfaceElevated} !important;
    }
    [class*="bg-[#121517]"], [class*="bg-[#0A0C0E]"] {
      background-color: ${t.bgInset} !important;
    }

    /* Solid Primary Buttons & Accents */
    [class*="bg-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]/"]) {
      background-color: ${t.primary} !important;
      color: ${t.onPrimary} !important;
    }
    [class*="bg-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]/"]) * {
      color: ${t.onPrimary} !important;
    }

    /* Translucent accents */
    [class*="bg-[#B8FF2C]/10"] {
      background-color: ${t.primaryMuted10} !important;
    }
    [class*="bg-[#B8FF2C]/15"] {
      background-color: ${t.primaryMuted15} !important;
    }

    /* Text accents */
    [class*="text-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]"]:not([class*="bg-[#B8FF2C]/"])) {
      color: ${t.primary} !important;
    }
    [class*="text-[#B8FF2C]/80"] {
      color: ${t.primary80} !important;
    }

    /* Border accents */
    [class*="border-[#B8FF2C]"]:not([class*="border-[#B8FF2C]/"]) {
      border-color: ${t.primary} !important;
    }
    [class*="border-[#B8FF2C]/20"] {
      border-color: ${t.primaryBorder20} !important;
    }
    [class*="border-[#B8FF2C]/25"] {
      border-color: ${t.primaryBorder25} !important;
    }
    [class*="border-[#B8FF2C]/30"] {
      border-color: ${t.primaryBorder30} !important;
    }
    [class*="border-[#B8FF2C]/40"] {
      border-color: ${t.primaryBorder40} !important;
    }
    [class*="border-[#B8FF2C]/50"] {
      border-color: ${t.primaryBorder50} !important;
    }

    /* Neutral borders */
    [class*="border-[#272B30]"], .border-gravity {
      border-color: ${t.border} !important;
    }
    [class*="border-[#202428]"] {
      border-color: ${t.borderSubtle} !important;
    }
    [class*="border-[#353B41]"], .border-gravity-strong {
      border-color: ${t.borderStrong} !important;
    }
    [class*="border-[#4B535B]"] {
      border-color: ${t.borderHover} !important;
    }

    /* Neutral typography */
    [class*="text-[#F4F5F2]"] {
      color: ${t.textPrimary} !important;
    }
    [class*="text-[#C4C8CC]"] {
      color: ${t.textSecondary} !important;
    }
    [class*="text-[#9CA3A8]"] {
      color: ${t.textMuted} !important;
    }
    [class*="text-[#62686D]"] {
      color: ${t.textDisabled} !important;
    }

    /* Custom scrollbars */
    ::-webkit-scrollbar-track {
      background: ${t.bg} !important;
    }
    ::-webkit-scrollbar-thumb {
      background: ${t.border} !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: ${t.borderStrong} !important;
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
  { key: '01_desktop_home', url: '/', width: 1280, height: 800, role: 'guest' },
  { key: '02_desktop_plans', url: '/plans', width: 1280, height: 800, role: 'guest' },
  { key: '03_desktop_gym_detail', url: '/gyms/gym-elite-4', width: 1280, height: 800, role: 'guest' },
  { key: '04_desktop_account', url: '/account', width: 1280, height: 800, role: 'member' },
  { key: '05_desktop_reception', url: '/reception', width: 1280, height: 800, role: 'staff' },
  { key: '06_desktop_admin', url: '/admin', width: 1280, height: 800, role: 'admin' },
  { key: '07_mobile_home', url: '/', width: 390, height: 844, role: 'guest' }
];

async function captureAll() {
  console.log('⚡ Starting Real UI Color Prototype captures across all 4 Directions...');
  
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

  for (const [themeKey, theme] of Object.entries(THEMES)) {
    console.log(`\n🎨 Processing Direction ${themeKey}: ${theme.name} (${theme.nameFa})...`);
    const css = generateThemeCSS(theme);

    for (const v of VIEWS) {
      await page.setViewport({ width: v.width, height: v.height });

      if (v.role === 'guest') {
        await page.evaluate(() => localStorage.removeItem('gym_app_token'));
      } else {
        await page.evaluate(tok => localStorage.setItem('gym_app_token', tok), tokens[v.role]);
      }

      await page.goto(`${BASE_URL}${v.url}`, { waitUntil: 'networkidle2' });
      await page.addStyleTag({ content: css });
      await new Promise(r => setTimeout(r, 600));

      const filename = `direction_${themeKey.toLowerCase()}_${v.key}.png`;
      const artifactPath = path.join(ARTIFACT_DIR, filename);
      const docsPath = path.join(DOCS_DIR, filename);

      await page.screenshot({ path: artifactPath, fullPage: false });
      fs.copyFileSync(artifactPath, docsPath);
      console.log(`  ✓ Saved: ${filename}`);
    }
  }

  // Now create composite comparison plates for each view!
  console.log('\n🖼️ Creating side-by-side comparison plates for each view...');
  for (const v of VIEWS) {
    const isMobile = v.width === 390;
    const plateWidth = isMobile ? 1640 : 1600;
    const plateHeight = isMobile ? 960 : 1080;

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: #050607;
            font-family: system-ui, -apple-system, sans-serif;
            color: #FFFFFF;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #1E232B;
            padding-bottom: 12px;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          .badge {
            background: #1A212D;
            color: #79A3FF;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 13px;
            font-weight: 600;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .mobile-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          }
          .card {
            background: #0E1218;
            border-radius: 12px;
            border: 1px solid #1F2733;
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
            border-bottom: 1px solid #1F2733;
          }
          .card-header.A { border-top: 3px solid #B8FF2C; color: #B8FF2C; }
          .card-header.B { border-top: 3px solid #00E599; color: #00E599; }
          .card-header.C { border-top: 3px solid #FF6B00; color: #FF6B00; }
          .card-header.D { border-top: 3px solid #3874FF; color: #3874FF; }
          .card-header span { color: #8F9BA8; font-size: 12px; font-weight: normal; }
          .img-wrap {
            width: 100%;
            height: 420px;
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
            height: 100%;
            object-fit: cover;
            object-position: top;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">مقایسه رنگ در UI واقعی — ${v.key}</div>
          <div class="badge">Gravity Real UI Color Direction Matrix</div>
        </div>
        <div class="${isMobile ? 'mobile-grid' : 'grid'}">
          <div class="card">
            <div class="card-header A">
              <div>Direction A — Volt Lime (ولت لایم)</div>
              <span>#B8FF2C / Obsidian</span>
            </div>
            <div class="${isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="file://${path.join(DOCS_DIR, `direction_a_${v.key}.png`).replace(/\\/g, '/')}" />
            </div>
          </div>
          <div class="card">
            <div class="card-header B">
              <div>Direction B — Hyper Emerald (هایپر امرالد)</div>
              <span>#00E599 / Titanium Slate</span>
            </div>
            <div class="${isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="file://${path.join(DOCS_DIR, `direction_b_${v.key}.png`).replace(/\\/g, '/')}" />
            </div>
          </div>
          <div class="card">
            <div class="card-header C">
              <div>Direction C — Solar Blaze (سولار بلیز)</div>
              <span>#FF6B00 / Warm Carbon</span>
            </div>
            <div class="${isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="file://${path.join(DOCS_DIR, `direction_c_${v.key}.png`).replace(/\\/g, '/')}" />
            </div>
          </div>
          <div class="card">
            <div class="card-header D">
              <div>Direction D — Cobalt Frost (کبالت فراست)</div>
              <span>#3874FF / Midnight Slate</span>
            </div>
            <div class="${isMobile ? 'mobile-img-wrap' : 'img-wrap'}">
              <img src="file://${path.join(DOCS_DIR, `direction_d_${v.key}.png`).replace(/\\/g, '/')}" />
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const platePage = await browser.newPage();
    await platePage.setViewport({ width: plateWidth, height: plateHeight });
    await platePage.setContent(htmlContent, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 400));

    const plateFilename = `plate_compare_${v.key}.png`;
    const plateArtifact = path.join(ARTIFACT_DIR, plateFilename);
    const plateDocs = path.join(DOCS_DIR, plateFilename);

    await platePage.screenshot({ path: plateArtifact, fullPage: true });
    fs.copyFileSync(plateArtifact, plateDocs);
    console.log(`  ✓ Saved composite plate: ${plateFilename}`);
    await platePage.close();
  }

  await browser.close();
  console.log('\n🎉 ALL 28 Real UI Screenshots and 7 Composite Comparison Plates captured successfully!');
}

captureAll().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
