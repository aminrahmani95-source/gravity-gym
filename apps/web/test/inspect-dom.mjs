import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });

  const info = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('section .grid-cols-1 > div'));
    return items.map(el => {
      const icon = el.children[0];
      const span = el.children[1];
      const elRect = el.getBoundingClientRect();
      const iconRect = icon ? icon.getBoundingClientRect() : null;
      const spanRect = span ? span.getBoundingClientRect() : null;
      return {
        text: el.textContent,
        elRect: { x: elRect.x, width: elRect.width },
        iconRect: iconRect ? { x: iconRect.x, width: iconRect.width } : null,
        spanRect: spanRect ? { x: spanRect.x, width: spanRect.width } : null,
        computedJustify: window.getComputedStyle(el).justifyContent,
        computedDirection: window.getComputedStyle(el).direction,
        computedTextAlign: window.getComputedStyle(el).textAlign
      };
    });
  });
  console.log('DOM info:', JSON.stringify(info, null, 2));
  await browser.close();
}
main().catch(err => { console.error(err); process.exit(1); });
