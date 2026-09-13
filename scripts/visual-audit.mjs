import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4173/index.html';
const chrome = process.env.CHROME_PATH;
if (!chrome) throw new Error('CHROME_PATH is required');
const outDir = process.env.VISUAL_OUT_DIR || 'visual-qa';
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const viewports = [
  ['phone', 390, 844],
  ['tablet', 768, 1024],
  ['desktop', 1366, 768],
  ['landscape', 1024, 600],
];
const failures = [];
const report = { base, generatedAt: new Date().toISOString(), viewports: {}, failures };
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen';

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  for (const [name, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
    await page.addInitScript(() => {
      try {
        const current = JSON.parse(localStorage.getItem('sashka.settings') || '{}');
        localStorage.setItem('sashka.settings', JSON.stringify({ ...current, autoSpeak: false, voiceMode: 'de' }));
      } catch {}
    });

    const gotoHome = async () => {
      await page.goto(`${base}?visual=${Date.now()}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.locator('.home').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('.letters-entry').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(250);
    };
    const measure = async label => {
      const m = await page.evaluate(() => ({
        iw: innerWidth, ih: innerHeight,
        sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
        bsw: document.body.scrollWidth, bsh: document.body.scrollHeight,
      }));
      const ok = m.sw <= m.iw + 2 && m.sh <= m.ih + 2 && m.bsw <= m.iw + 2 && m.bsh <= m.ih + 2;
      if (!ok) failures.push(`${name}/${label}: overflow ${JSON.stringify(m)}`);
      return { ...m, ok };
    };
    const boundsCheck = async (selector, label) => {
      const boxes = await page.locator(selector).evaluateAll(nodes => nodes.filter(n => {
        const s = getComputedStyle(n); return s.display !== 'none' && s.visibility !== 'hidden';
      }).map(n => { const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; }));
      for (const b of boxes) {
        if (b.x < -2 || b.y < -2 || b.right > width + 2 || b.bottom > height + 2) failures.push(`${name}/${label}: offscreen ${JSON.stringify(b)}`);
      }
      return boxes;
    };

    await gotoHome();
    const homeMetrics = await measure('home');
    await boundsCheck('.topbar button,.big-play,.category-button', 'home-controls');
    await page.screenshot({ path: path.join(outDir, `${name}-home.png`), fullPage: false });

    const brand = page.locator('#brandButton');
    const bb = await brand.boundingBox();
    const dialog = page.locator('#parentDialog');
    if (bb) {
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(100);
    }
    let dialogOpen = await dialog.evaluate(el => el.open);
    if (!dialogOpen) { await dialog.evaluate(el => { if (!el.open) el.showModal(); }); dialogOpen = await dialog.evaluate(el => el.open); }
    if (dialogOpen) {
      await boundsCheck('#parentDialog', 'parent-dialog');
      await page.screenshot({ path: path.join(outDir, `${name}-settings.png`), fullPage: false });
      await page.keyboard.press('Escape');
    } else failures.push(`${name}/settings: dialog could not be opened for visual QA`);

    // Vowel module is tested as its own screen on every viewport.
    await gotoHome();
    await page.locator('.letters-entry').click();
    await page.locator('.letters-game').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    const lettersMetrics = await measure('letters');
    await boundsCheck('.letters-head button,.vowel-chip,.letters-task,.letter-choice,.letters-anchor', 'letters-controls');
    await page.screenshot({ path: path.join(outDir, `${name}-letters.png`), fullPage: false });

    await gotoHome();
    const regularButtons = page.locator('.category-button:not(.letters-entry)');
    const count = await regularButtons.count();
    const categories = [];
    for (let i = 0; i < count; i++) categories.push((await regularButtons.nth(i).innerText()).split('\n')[0].trim());

    const indices = name === 'tablet' ? [...Array(count).keys()] : [0];
    const gameMetrics = [];
    for (const i of indices) {
      await gotoHome();
      const buttons = page.locator('.category-button:not(.letters-entry)');
      const title = ((await buttons.nth(i).innerText()).split('\n')[0] || `cat-${i+1}`).trim();
      await buttons.nth(i).click();
      await page.locator('.game').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(300);
      gameMetrics.push({ category: title, ...(await measure(`game-${title}`)) });
      await boundsCheck('.game-header button,.question-card,.choice-card', `game-${title}-controls`);
      await page.screenshot({ path: path.join(outDir, `${name}-game-${String(i+1).padStart(2,'0')}-${slug(title)}.png`), fullPage: false });
    }

    if (errors.length) failures.push(...errors.map(e => `${name}: ${e}`));
    report.viewports[name] = { width, height, homeMetrics, lettersMetrics, categories, gameMetrics, errors };
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`VISUAL_AUDIT screens=${Object.values(report.viewports).reduce((n,v)=>n+2+v.gameMetrics.length,0)} failures=${failures.length}`);
for (const f of failures) console.log(`VISUAL_FAIL ${f}`);