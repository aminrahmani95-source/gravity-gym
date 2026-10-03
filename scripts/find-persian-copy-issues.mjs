// scripts/find-persian-copy-issues.mjs
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const targetDirs = [
  path.join(ROOT, 'apps', 'web', 'src'),
  path.join(ROOT, 'apps', 'api', 'src'),
  path.join(ROOT, 'packages', 'shared-types', 'src'),
];

function getAllFiles(dir, exts = ['.ts', '.tsx']) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'dist') {
        files = files.concat(getAllFiles(fullPath, exts));
      }
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const termsToAudit = [
  { id: 'SEAT', regex: /صندلی\s+آزاد|صندلی\s+خالی|خرید\s+صندلی/g, fix: 'جای خالی / ظرفیت باقیمانده' },
  { id: 'SINGLE_SESSION_SPACE', regex: /تک\s+جلسه/g, fix: 'تک‌جلسه' },
  { id: 'REGISTER_SPACE', regex: /ثبت\s+نام/g, fix: 'ثبت‌نام' },
  { id: 'REMAINING_SPACE', regex: /باقی\s+مانده/g, fix: 'باقی‌مانده' },
  { id: 'DEFAULT_SPACE', regex: /پیش\s+فرض/g, fix: 'پیش‌فرض' },
  { id: 'INACTIVE_SPACE', regex: /غیر\s+فعال/g, fix: 'غیرفعال' },
  { id: 'ATTENDEES_SPACE', regex: /شرکت\s+کنند/g, fix: 'شرکت‌کنند' },
  { id: 'CONFIRMED_SPACE', regex: /تایید\s+شده/g, fix: 'تأییدشده' },
  { id: 'CANCELLED_SPACE', regex: /لغو\s+شده/g, fix: 'لغوشده' },
  { id: 'EXPIRED_SPACE', regex: /منقضی\s+شده/g, fix: 'منقضی‌شده' },
  { id: 'PACKAGE_TERM', regex: /پکیج/g, fix: 'بسته' },
  { id: 'PREMIUM_SPELLING', regex: /پرمیوم/g, fix: 'پریمیوم' },
  { id: 'BE_ONVAN', regex: /به\s+عنوان/g, fix: 'به‌عنوان' },
  { id: 'BE_SOORAT', regex: /به\s+صورت/g, fix: 'به‌صورت' },
  { id: 'HAM_AKNOON', regex: /هم\s+اکنون/g, fix: 'هم‌اکنون' },
  { id: 'BASHGAH_HA', regex: /باشگاه\s+ها/g, fix: 'باشگاه‌ها' },
  { id: 'KLASS_HA', regex: /کلاس\s+ها/g, fix: 'کلاس‌ها' },
  { id: 'SANS_HA', regex: /سانس\s+ها/g, fix: 'سانس‌ها' },
  { id: 'BASTE_HA', regex: /بسته\s+ها/g, fix: 'بسته‌ها' },
  { id: 'MORABBI_HA', regex: /مربی\s+ها/g, fix: 'مربی‌ها' },
  { id: 'KARBAR_HA', regex: /کاربر\s+ها/g, fix: 'کاربران' },
  { id: 'OZO_HA', regex: /عضو\s+ها/g, fix: 'اعضا' },
  { id: 'DOWRE_HA', regex: /دوره\s+ها/g, fix: 'دوره‌ها' },
  { id: 'JALASE_HA', regex: /جلسه\s+ها/g, fix: 'جلسه‌ها / جلسات' },
];

const results = [];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = getAllFiles(dir);
  for (const file of files) {
    const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('import ') || trimmed.startsWith('*')) return;

      for (const term of termsToAudit) {
        if (term.regex.test(line)) {
          results.push({
            id: term.id,
            fix: term.fix,
            file: relPath,
            lineNum: idx + 1,
            lineContent: trimmed,
          });
        }
      }
    });
  }
}

console.log(`Found ${results.length} candidate issues across codebase:\n`);
const grouped = {};
results.forEach(r => {
  if (!grouped[r.id]) grouped[r.id] = [];
  grouped[r.id].push(r);
});

for (const [id, list] of Object.entries(grouped)) {
  console.log(`=== ${id} (${list.length} matches, Suggested fix: ${list[0].fix}) ===`);
  list.forEach(item => {
    console.log(`  ${item.file}:${item.lineNum} -> ${item.lineContent.slice(0, 120)}`);
  });
  console.log('');
}
