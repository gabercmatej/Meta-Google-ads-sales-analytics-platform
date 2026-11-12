// Browser tests for the static demo (apps/demo/dist).
//
//   node scripts/browser-test.mjs                 serve dist locally with the vercel.json headers
//   BASE_URL=https://… node scripts/browser-test.mjs   run against a deployed copy
//   SCREENSHOTS=assets/screenshots node scripts/browser-test.mjs   also capture README screenshots
//
// Every page is opened at desktop and phone size. A page fails on: a console error, a CSP violation,
// a request to any other host, horizontal overflow, a missing heading or a missing DEMO badge.
// The flows then exercise the interactive features end to end.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'apps/demo/dist');
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const SHOTS = process.env.SCREENSHOTS ? resolve(ROOT, process.env.SCREENSHOTS) : null;

const PAGES = [
  ['/combined', 'Combined'],
  ['/overview?platform=meta', 'Overview'],
  ['/overview?platform=google', 'Overview'],
  ['/campaigns?platform=meta', 'Campaigns'],
  ['/campaigns?platform=google', 'Campaigns'],
  ['/campaigns/meta-c1?platform=meta', ''],
  ['/campaigns?platform=meta&level=adsets&campaign=meta-c1', 'Campaigns'],
  ['/campaigns?platform=meta&level=ads&campaign=meta-c1', 'Campaigns'],
  ['/campaigns?platform=google&level=adsets&campaign=google-c4', 'Campaigns'],
  ['/ads/meta-c1-g1-a1?platform=meta', ''],
  ['/create?platform=meta', 'Create'],
  ['/create?platform=google', 'New Google campaign'],
  ['/drafts', 'Drafts'],
  ['/sales', 'Sales'],
  ['/leads', 'Leads'],
  ['/attribution', 'Attribution'],
  ['/compare', 'comparison'],
  ['/assistant', 'assistant'],
  ['/recommendations', 'Recommendations'],
  ['/data-sources', 'Data sources'],
  ['/activity', 'Change log'],
  ['/users', 'Users'],
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };

function headersFor(path) {
  const out = {};
  for (const rule of vercel.headers ?? []) {
    const re = new RegExp('^' + rule.source.replace('(.*)', '.*') + '$');
    if (re.test(path)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

async function serve() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('apps/demo/dist missing: run npm run build:demo first');
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !(await stat(file).then((s) => s.isFile(), () => false))) file = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...headersFor(path) });
    res.end(await readFile(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const failures = [];
let passed = 0;
function check(ok, label) {
  if (ok) passed++;
  else failures.push(label);
}

async function newPage(browser, base, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  const origin = new URL(base).origin;
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === origin || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    problems.push(`external request ${u.origin}`);
    return route.abort();
  });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  return { context, page, problems };
}

async function sweep(browser, base) {
  for (const vp of VIEWPORTS) {
    const { context, page, problems } = await newPage(browser, base, vp);
    for (const [path, heading] of PAGES) {
      problems.length = 0;
      const res = await page.goto(base + path, { waitUntil: 'networkidle' });
      if (path === '/overview') {
        const csp = res?.headers()['content-security-policy'] ?? '';
        check(csp.includes("connect-src 'none'"), `${vp.name} ${path}: CSP header present`);
      }
      const h1 = page.locator('h1').first();
      await h1.waitFor({ timeout: 8000 }).catch(() => {});
      const title = (await h1.textContent().catch(() => '')) ?? '';
      check(title.toLowerCase().includes(heading.toLowerCase()), `${vp.name} ${path}: heading contains "${heading}" (got "${title}")`);
      const badge = await page.getByTestId('demo-badge').isVisible().catch(() => false);
      check(badge, `${vp.name} ${path}: DEMO badge visible`);
      const noStripe = await page.locator('.demo-stripes').count();
      check(noStripe === 0, `${vp.name} ${path}: no full-width demo banner`);
      const yellow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); if (r.width < 240 || r.height < 28) return false; const m = getComputedStyle(el).backgroundColor.match(/[0-9.]+/g); if (!m) return false; const [R, G, B, A = 1] = m.map(Number); return A > 0.2 && R > 200 && G > 150 && B < 190 && R - B > 60; }).length);
      check(yellow === 0, `${vp.name} ${path}: no yellow/amber panels (${yellow})`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 1, `${vp.name} ${path}: no horizontal overflow (${overflow}px)`);
      const crashed = await page.getByText(/Unexpected Application Error|not implemented/i).count();
      check(crashed === 0, `${vp.name} ${path}: no error boundary`);
      check(problems.length === 0, `${vp.name} ${path}: ${problems.join(' | ') || 'clean'}`);
    }
    await context.close();
  }
}

async function flows(browser, base) {
  const { context, page, problems } = await newPage(browser, base, VIEWPORTS[0]);
  const step = async (label, fn) => {
    try {
      await fn();
      passed++;
    } catch (e) {
      failures.push(`flow ${label}: ${String(e.message ?? e).split('\n')[0].slice(0, 240)}`);
    }
  };
  const flowFile = join(ROOT, 'scripts/browser-flows.mjs');
  if (existsSync(flowFile)) {
    const { runFlows } = await import('./browser-flows.mjs');
    await runFlows({ page, base, step, shots: SHOTS, browser, newPage: (vp) => newPage(browser, base, vp) });
  }
  check(problems.length === 0, `flows: ${problems.join(' | ') || 'clean'}`);
  await context.close();
}

const local = process.env.BASE_URL ? null : await serve();
const base = process.env.BASE_URL?.replace(/\/$/, '') ?? local.base;
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const browser = await launch();
try {
  await sweep(browser, base);
  await flows(browser, base);
} finally {
  await browser.close();
  local?.server.close();
}
console.log(`browser tests against ${process.env.BASE_URL ? base : 'local dist'}: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL ' + f);
process.exit(failures.length ? 1 : 0);
