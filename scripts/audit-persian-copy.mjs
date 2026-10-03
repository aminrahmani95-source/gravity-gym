// scripts/audit-persian-copy.mjs
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

const suspiciousPatterns = [
  { name: 'Seat / صندلی', regex: /صندلی/g },
  { name: 'می بدون نیم‌فاصله', regex: /می\s+(باشد|شود|کند|گردد|تواند|ماند|دارد|باید|باشد|شوند|کنند|توانند|دانید)/g },
  { name: 'نمی بدون نیم‌فاصله', regex: /نمی\s+(باشد|شود|کند|گردد|تواند|ماند|دارد|باید|باشد|شوند|کنند|توانند|دانید)/g },
  { name: 'ها بدون نیم‌فاصله', regex: /([آ-ی])\s+ها([ییاًء]|\b)/g },
  { name: 'غیر بدون نیم‌فاصله', regex: /غیر\s+(فعال|مجاز|قابل|مستقیم|رسمی|واقعی)/g },
  { name: 'پیش بدون نیم‌فاصله', regex: /پیش\s+(فرض|پرداخت|فروش|فاکتور|نیاز)/g },
  { name: 'تک بدون نیم‌فاصله', regex: /تک\s+(جلسه|نفره|ستاره)/g },
  { name: 'باقی مانده', regex: /باقی\s+مانده/g },
  { name: 'ثبت نام بدون نیم‌فاصله', regex: /ثبت\s+نام/g },
  { name: 'شرکت کننده بدون نیم‌فاصله', regex: /شرکت\s+کنند/g },
  { name: 'به عنوان', regex: /به\s+عنوان/g },
  { name: 'مشتری (باید عضو یا کاربر باشد)', regex: /مشتری/g },
  { name: 'English words in Persian quotes', regex: /['"][A-Za-z0-9_\-\s]{3,}['"]/g },
];

console.log('--- SCANNING FOR PERSIAN COPY & TERMINOLOGY ISSUES ---');
let totalMatches = 0;
const findings = {};

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = getAllFiles(dir);
  for (const file of files) {
    const relPath = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Ignore imports, comments or code identifiers
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('import ') || trimmed.startsWith('*')) return;

      for (const pattern of suspiciousPatterns) {
        if (pattern.regex.test(line)) {
          if (!findings[pattern.name]) findings[pattern.name] = [];
          findings[pattern.name].push({
            file: relPath,
            lineNum: idx + 1,
            snippet: trimmed.slice(0, 140),
          });
          totalMatches++;
        }
      }
    });
  }
}

for (const [cat, items] of Object.entries(findings)) {
  console.log(`\n### ${cat} (${items.length} occurrences)`);
  items.slice(0, 15).forEach(item => {
    console.log(`  ${item.file}:${item.lineNum} -> ${item.snippet}`);
  });
  if (items.length > 15) {
    console.log(`  ... and ${items.length - 15} more`);
  }
}

console.log(`\nTotal potential issues scanned: ${totalMatches}`);
