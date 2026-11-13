// End-to-end flows for scripts/browser-test.mjs. Each step is independent: a failure is reported and the next step runs.
// With SCREENSHOTS set, the README screenshots are captured along the way.
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };

async function expectVisible(locator, what) {
  await locator.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {
    throw new Error(`${what} not visible`);
  });
}

function expect(ok, what) {
  if (!ok) throw new Error(what);
}

export async function runFlows({ page, base, step, shots, newPage }) {
  // Desktop only (1440x900, scale 1). `full` captures the whole document instead of the viewport.
  const shot = async (name, full = false) => {
    if (!shots) return;
    await page.waitForTimeout(400); // let chart animations settle (reduced motion is on, but layout may still shift)
    await page.screenshot({ path: join(shots, `${name}.png`), fullPage: full });
  };
  const go = async (path) => {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ timeout: 8000 });
  };

  // window.print would open a dialog; record the call and whether the print sheet held a chart at that moment.
  await page.addInitScript(() => {
    window.__prints = [];
    window.print = () => {
      const sheet = document.querySelector('.print-sheet');
      window.__prints.push({ sheet: Boolean(sheet), svg: Boolean(sheet?.querySelector('svg')), dashed: Boolean(sheet?.querySelector('.recharts-line-curve[stroke-dasharray]:not([stroke-dasharray=""])')) });
    };
  });

  const channel = (key) => page.locator(`nav[aria-label="Platform"] [data-channel="${key}"]`);
  const answers = () => page.locator('[data-testid="answer"]');

  await step('combined: overview renders and the platform switch drives the URL', async () => {
    await go('/combined');
    await shot('combined-hero');
    await shot('combined-full', true);
    await channel('google').click();
    await page.waitForURL(/\/overview\?.*platform=google/);
    await shot('google-overview');
    await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '90 days' }).click();
    await page.waitForURL(/period=last90/);
    await page.getByRole('group', { name: 'Show chart by day or month' }).first().getByRole('button', { name: 'Monthly' }).click();
    await page.waitForURL(/view=monthly/);
    await channel('meta').click();
    await page.waitForURL(/platform=meta/);
    expect(/period=last90/.test(page.url()), 'period was lost when switching platform');
    await channel('combined').click();
    await page.waitForURL(/\/combined/);
  });

  await step('screenshots: expanded chart and expanded KPI sparkline', async () => {
    await go('/combined?period=last90');
    await page.getByRole('button', { name: 'Expand chart: Daily spend by platform' }).click();
    await expectVisible(page.getByRole('dialog', { name: 'Daily spend by platform' }), 'card dialog');
    await shot('chart-expanded');
    await page.keyboard.press('Escape');
    await go('/overview?platform=meta&period=yearToDate');
    await page.locator('main [data-spark-trigger]').first().click();
    const dialog = page.getByRole('dialog');
    await expectVisible(dialog, 'sparkline dialog');
    await dialog.getByRole('group', { name: 'Show chart by day or month' }).getByRole('button', { name: 'Monthly' }).click();
    await shot('spark-expanded');
    await page.keyboard.press('Escape');
  });

  await step('overview: custom period with explicit dates', async () => {
    await go('/overview?platform=meta&period=last30');
    await shot('meta-overview');
    await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: 'Custom' }).click();
    await page.getByLabel('From date').fill('2026-06-01');
    await page.getByLabel('To date').fill('2026-08-31');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.waitForURL(/from=2026-06-01.*to=2026-08-31/);
  });

  await step('charts: expand dialog opens and closes', async () => {
    await go('/overview?platform=meta');
    await page.getByRole('button', { name: /^Expand chart: / }).first().click();
    await expectVisible(page.getByRole('dialog'), 'expanded chart dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 4000 });
  });

  await step('charts: print renders the chart sheet with solid lines', async () => {
    await go('/overview?platform=meta');
    await page.getByRole('button', { name: /^Print chart: / }).first().click();
    await page.waitForFunction(() => window.__prints.length > 0, null, { timeout: 4000 });
    const [p] = await page.evaluate(() => window.__prints);
    expect(p.sheet && p.svg, 'print sheet with a chart was not present when print() ran');
    expect(!p.dashed, 'print chart contains dashed lines');
  });

  await step('assistant: grounded answer has numbers, evidence, actions and a tool trace', async () => {
    await go('/assistant');
    await page.getByLabel('Your question').fill('Which campaign had the best cost per lead last month?');
    await page.getByLabel('Your question').press('Enter');
    const answer = answers().last();
    await expectVisible(answer, 'answer');
    await expectVisible(answer.getByText(/^Grounded: \d+\/\d+ numbers verified$/), 'grounding badge');
    for (const h of ['Key numbers', 'What I would do']) await expectVisible(answer.getByRole('heading', { name: h, exact: true }), `${h} section`);
    await expectVisible(answer.getByText('Why — evidence', { exact: true }), 'evidence section');
    if (shots) {
      await answer.evaluate((el) => el.parentElement.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -130));
    }
    await shot('assistant');
    await answer.getByRole('button', { name: 'Show tool calls' }).click();
    const trace = answer.getByRole('region', { name: 'Tool calls' });
    await expectVisible(trace, 'tool call trace');
    expect(/Intent:/.test(await trace.textContent()), 'trace lacks the intent');
  });

  await step('assistant: unsupported question gets a limitation and alternatives', async () => {
    await go('/assistant');
    await page.getByLabel('Your question').fill('What will the weather be in Ljubljana tomorrow?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const answer = answers().last();
    await expectVisible(answer.getByText('Limits', { exact: true }), 'limits section');
    const alts = answer.locator('[aria-label="Suggested alternatives"] button');
    await expectVisible(alts, 'alternative questions');
    await alts.first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="answer"]').length === 2, null, { timeout: 8000 });
    await expectVisible(answers().nth(1).getByRole('heading', { name: 'Key numbers', exact: true }), 'answer to the alternative');
  });

  await step('recommendations: cards carry evidence and links work', async () => {
    await go('/recommendations');
    const cards = page.locator('main article').filter({ has: page.getByRole('link', { name: 'Ask assistant' }) });
    await expectVisible(cards, 'recommendation card');
    expect((await cards.count()) >= 3, 'fewer than 3 recommendations');
    await shot('recommendations');
    await page.getByRole('button', { name: 'Prepare change' }).first().click();
    await expectVisible(page.getByRole('dialog').getByRole('list', { name: 'Change workflow' }), 'change workflow');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await cards.first().getByRole('link', { name: 'Open campaign' }).click();
    await page.waitForURL(/\/campaigns\//);
    await expectVisible(page.locator('h1'), 'campaign heading');
  });

  await step('recommendations: detail page shows evidence and charts', async () => {
    await go('/recommendations');
    await page.locator('[data-testid="rec-detail-link"]').first().click();
    await page.waitForURL(/recommendations[/].+/);
    await expectVisible(page.locator('[data-testid="rec-evidence"]'), 'evidence card');
    const charts = page.locator('[data-testid="rec-charts"]');
    await expectVisible(charts, 'chart grid');
    await expectVisible(charts.locator('svg.recharts-surface'), 'a rendered chart');
    await shot('recommendation-detail', true);
    expect((await charts.locator('.recharts-wrapper').count()) >= 2, 'fewer than 2 charts on the detail page');
  });

  await step('data sources: Refresh now updates the last-refresh timestamp', async () => {
    await go('/data-sources');
    const card = page.locator('[data-testid="source-card"]').first();
    await expectVisible(card, 'source card');
    const before = await card.locator('[data-testid="last-refresh-abs"]').textContent();
    await card.getByRole('button', { name: /Refresh .* now/ }).click();
    await page.waitForFunction((b) => document.querySelector('[data-testid="source-card"] [data-testid="last-refresh-abs"]')?.textContent !== b, before, { timeout: 8000 });
    expect(true, '');
  });

  await step('recommendations: ask assistant link carries the question', async () => {
    await go('/recommendations');
    await page.locator('main article').getByRole('link', { name: 'Ask assistant' }).first().click();
    await page.waitForURL(/\/assistant/);
    await expectVisible(answers(), 'pre-asked answer');
  });

  await step('comparison: preselected ads of one platform, add and remove', async () => {
    await go('/compare?platform=meta');
    const cardsBefore = await page.locator('.cmp-card').count();
    expect(cardsBefore >= 2, `expected preselected ads, got ${cardsBefore}`);
    if (shots) {
      await page.locator('.cmp-card').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -140));
      await shot('compare');
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const picker = page.getByRole('region', { name: 'Choose ads' });
    expect((await picker.getByText('Google', { exact: true }).count()) === 0, 'Google ads listed in the Meta comparison');
    await picker.locator('ul input[type=checkbox]:not(:checked):not([disabled])').first().click(); // URL-driven selection: state updates after navigation, so check() would race
    await page.waitForFunction((n) => document.querySelectorAll('.cmp-card').length === n + 1, cardsBefore, { timeout: 4000 });
    await page.getByRole('button', { name: /^Remove .* from comparison$/ }).first().click();
    await page.waitForFunction((n) => document.querySelectorAll('.cmp-card').length === n, cardsBefore, { timeout: 4000 });
  });

  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();

  await step('screenshots: campaigns before any simulated change', async () => {
    if (!shots) return;
    await go('/campaigns?platform=meta');
    await shot('campaigns-meta');
  });

  const cont = () => page.getByRole('button', { name: /^Create draft and continue/ }).click();

  await step('create: draft is saved and listed on Drafts', async () => {
    await go('/create?platform=meta');
    await page.getByLabel('Campaign name').fill('Autumn consultation test');
    await cont();
    await expectVisible(page.getByText(/Draft saved in this browser/), 'draft saved note');
    await go('/drafts?platform=meta');
    await expectVisible(page.getByText('Autumn consultation test'), 'draft on the Drafts page');
    await shot('drafts');
    await page.getByRole('button', { name: 'Validate' }).first().click();
    await expectVisible(page.locator('main article').first().locator('[role=status], [role=alert]'), 'validation result');
  });

  await step('create: Meta campaign with ad is created PAUSED and listed in Campaigns', async () => {
    await go('/create?platform=meta');
    await expectVisible(page.getByText('Step 1 of 6'), 'step eyebrow');
    await page.getByLabel('Campaign name').fill('Winter documents demo');
    await cont();
    await expectVisible(page.getByText('Step 2 of 6'), 'audience step');
    await cont();
    await page.getByLabel('Ad name').fill('Winter documents ad');
    await page.getByLabel('Headline', { exact: true }).fill('Documents reviewed in two days');
    await page.getByLabel('Primary text', { exact: true }).fill('A fictional ad used only in this demo.');
    const url = page.getByLabel('Final URL');
    await url.fill((await url.inputValue()) + 'documents');
    await shot('create-meta');
    await cont();
    await cont();
    await page.getByLabel('Daily budget (EUR)').fill('30');
    await cont();
    await expectVisible(page.getByText('Step 6 of 6'), 'review step');
    await page.getByRole('button', { name: 'Create (PAUSED)' }).click();
    await expectVisible(page.getByText('Created in simulation (PAUSED)'), 'created confirmation');
    await go('/campaigns?platform=meta');
    await expectVisible(page.getByText('Winter documents demo'), 'created campaign row');
    await expectVisible(page.getByText('Created in demo').first(), 'created badge');
  });

  await step('create: Google wizard reaches Review, validates only and saves a draft', async () => {
    await go('/create?platform=google');
    await expectVisible(page.getByText('Step 1 of 7'), 'google step eyebrow');
    await next();
    await page.getByRole('radio', { name: /Search/ }).first().check();
    await next();
    await page.getByLabel('Campaign name').fill('Google search demo');
    await page.getByLabel('Daily budget (EUR)').fill('20');
    await next();
    await page.getByLabel('Ad group name').fill('Core terms');
    await page.getByLabel('Keywords').fill('legal advice online, sample contract review'.replace(', ', '\n'));
    await next();
    await page.getByLabel('Ad name').fill('Search ad 1');
    await page.getByLabel('Headline 1').fill('Fast online advice');
    await page.getByLabel('Headline 2').fill('Fixed price review');
    await page.getByLabel('Headline 3').fill('Book in two minutes');
    await page.getByLabel('Description 1').fill('A fictional demo ad for a fictional company.');
    await page.getByLabel('Description 2').fill('Nothing here is sent to Google.');
    const url = page.getByLabel('Final URL');
    await url.fill((await url.inputValue()) + 'search');
    await shot('create-google');
    await next();
    await next();
    await expectVisible(page.getByText('Step 7 of 7'), 'google review step');
    await expectVisible(page.getByText('No validation issues.'), 'review without issues');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expectVisible(page.getByText(/Draft saved in this browser/), 'google draft saved');
    await page.getByRole('button', { name: 'Validate (no real change)' }).click();
    await expectVisible(page.getByText('Validated only').first(), 'validated-only result');
    await go('/drafts?platform=google');
    await expectVisible(page.getByText('Google search demo'), 'google draft listed');
  });

  await step('campaigns: Meta drill-down campaign to ad set to ad detail', async () => {
    await go('/campaigns?platform=meta');
    await page.locator('[data-testid="ads-navigator"] a[href*="level=adsets&campaign="]').first().click();
    await expectVisible(page.getByRole('tab', { name: /Ad sets/ }).or(page.getByRole('link', { name: /Ad sets/ })), 'ad sets level');
    await page.locator('[data-testid="ads-navigator"] a[href*="level=ads&"][href*="adset="]').first().click();
    await page.locator('[data-testid="ads-navigator"] a[href^="/ads/"]').first().click();
    await page.locator('h1').first().waitFor({ timeout: 8000 });
    await expectVisible(page.getByText('Ad settings'), 'ad detail settings card');
    await shot('campaign-drilldown');
  });

  await step('campaigns: Google Performance Max shows asset groups, not ad groups', async () => {
    await go('/campaigns?platform=google&level=adsets&campaign=google-c4');
    await expectVisible(page.getByText(/Asset group |/).first(), 'asset group rows');
    await shot('campaigns-google-assetgroups');
    expect((await page.getByRole('link', { name: /^Ad groups/ }).count()) === 0, 'PMax drill must not offer Ad groups');
  });

  await step('campaigns: column chooser hides and restores a column', async () => {
    await go('/campaigns?platform=meta');
    const header = page.locator('[data-testid="ads-navigator"] th', { hasText: /^CTR/ });
    await expectVisible(header, 'CTR column');
    await page.getByRole('button', { name: /^Columns/ }).click();
    await page.getByRole('checkbox', { name: /CTR/ }).uncheck();
    await header.first().waitFor({ state: 'detached', timeout: 4000 }).catch(() => {
      throw new Error('CTR column still visible after hiding it');
    });
    await page.getByRole('checkbox', { name: /CTR/ }).check();
    await expectVisible(header, 'CTR column restored');
    await page.keyboard.press('Escape');
  });

  await step('campaigns: pause a Meta campaign through the confirm flow, then it is logged', async () => {
    await go('/campaigns?platform=meta');
    const pause = page.getByRole('button', { name: /^Pause / }).first();
    const label = await pause.getAttribute('aria-label');
    await pause.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirm pause' }).click();
    await expectVisible(dialog.getByRole('button', { name: 'Close', exact: true }).last(), 'completed change');
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expectVisible(page.getByRole('button', { name: label.replace(/^Pause/, 'Resume') }), 'resume button after pausing');
    await go('/activity');
    await expectVisible(page.locator('tbody').getByText('Applied in simulation'), 'applied entry in the activity log');
  });

  await step('campaigns: Google change is validate-only', async () => {
    await go('/campaigns?platform=google');
    await shot('campaigns-google');
    await page.getByRole('button', { name: /^Pause / }).first().click();
    const dialog = page.getByRole('dialog');
    await expectVisible(dialog.getByText(/validate-only/i), 'validate-only notice');
    await dialog.getByRole('button', { name: 'Confirm pause' }).click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expectVisible(page.getByText('Validated only'), 'validated-only badge');
  });

  await step('campaigns: budget change above the limit is rejected', async () => {
    await go('/campaigns?platform=meta');
    await page.getByRole('button', { name: /^Change budget of / }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('New daily budget (EUR)').fill('9999');
    await dialog.getByRole('button', { name: 'Preview change' }).click();
    await expectVisible(dialog.getByRole('button', { name: 'Back' }), 'rejection with a way back');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  await step('roles: viewer cannot change anything', async () => {
    const setRole = async (name) => {
      await page.getByLabel('User menu').click();
      await page.getByRole('radiogroup', { name: 'Role' }).getByRole('radio', { name }).click();
      await page.getByLabel('User menu').click();
    };
    await go('/campaigns?platform=meta');
    await setRole('Viewer');
    expect(await page.getByRole('button', { name: /^(Pause|Resume) / }).first().isDisabled(), 'pause enabled for a viewer');
    await setRole('Administrator');
    // The role lives in memory, so navigate inside the app instead of reloading (a reload resets it to Ad editor).
    await page.evaluate(() => {
      window.history.pushState({}, '', '/users');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expectVisible(page.getByText('Users (').first(), 'user list for an administrator');
    await shot('users');
    await setRole('Ad editor');
  });

  await step('activity: reset clears the simulation', async () => {
    await go('/activity');
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset everything' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 4000 });
    expect((await page.locator('tbody').getByText('Applied in simulation').count()) === 0, 'applied entries survived the reset');
    await go('/campaigns?platform=meta');
    expect((await page.getByText('Winter documents demo').count()) === 0, 'created campaign survived the reset');
  });

  await step('sales: the date basis toggle switches the basis and the shown line', async () => {
    await go('/sales?platform=meta&period=last30');
    const shown = page.locator('[data-testid="basis-shown"]');
    await expectVisible(shown, 'basis line');
    expect(/order date/i.test(await shown.innerText()), 'default basis is not the order date');
    await page.getByRole('button', { name: 'By payment date' }).click();
    await page.waitForFunction(() => /payment date/i.test(document.querySelector('[data-testid="basis-shown"]')?.textContent ?? ''), null, { timeout: 4000 });
    await page.getByRole('button', { name: 'By order date (as in CRM)' }).click();
    await page.waitForFunction(() => /order date/i.test(document.querySelector('[data-testid="basis-shown"]')?.textContent ?? ''), null, { timeout: 4000 });
  });

  await step('leads: a chart opens in the expand dialog', async () => {
    await go('/leads?platform=meta&period=last30');
    await page.getByRole('button', { name: /^Expand chart: / }).first().click();
    await expectVisible(page.getByRole('dialog'), 'expanded leads chart dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 4000 });
  });

  // Chart inventory: every expandable chart (card expand buttons and clickable KPI sparklines) found on the
  // analytics pages is opened and exercised. The inventory is collected from the DOM, so a new chart is tested
  // without being listed here. Repeated table sparklines (one per row) are sampled.
  const CHART_PAGES = [
    '/combined',
    '/overview?platform=meta',
    '/overview?platform=google',
    '/campaigns/meta-c1?platform=meta',
    '/campaigns?platform=meta',
    '/ads/meta-c1-g1-a1?platform=meta',
    '/ads/google-c1-g1-a1?platform=google',
    '/sales?platform=meta',
    '/leads?platform=meta',
    '/leads?platform=google',
    '/attribution',
    '/compare?platform=meta',
    '/recommendations',
    'rec-detail',
  ];
  const TRIGGERS = 'main button[aria-label^="Expand chart: "], main [data-spark-trigger]';
  const TABLE_SAMPLE = 3;
  const inventory = [];
  const validatePdf = (buf, what) => {
    const text = buf.toString('latin1');
    expect(buf.length > 4000, `${what}: PDF too small (${buf.length} bytes)`);
    expect(text.startsWith('%PDF-'), `${what}: not a PDF`);
    expect(/%%EOF\s*$/.test(text), `${what}: PDF is truncated`);
    expect(/\/Type\s*\/Page\b/.test(text), `${what}: PDF has no page`);
    expect(!/\[\s*\d[\d.\s]*\]\s+[\d.]+\s+d\b/.test(text), `${what}: PDF chart has dashed strokes`);
  };
  for (const path of CHART_PAGES) {
    let url = path;
    await step(`chart inventory: ${path}`, async () => {
      if (path === 'rec-detail') {
        await go('/recommendations');
        await page.locator('[data-testid="rec-detail-link"]').first().click();
        await page.waitForURL(/recommendations[/].+/);
        url = new URL(page.url()).pathname + new URL(page.url()).search;
      } else await go(path);
      await page.waitForTimeout(300);
    });
    const labels = await page.locator(TRIGGERS).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    const inTable = await page.locator(TRIGGERS).evaluateAll((els) => els.map((e) => Boolean(e.closest('table'))));
    let tableSeen = 0;
    for (let i = 0; i < labels.length; i++) {
      if (inTable[i] && ++tableSeen > TABLE_SAMPLE) continue;
      const title = labels[i].replace(/^(Expand|Open) chart: /, '');
      const kind = labels[i].startsWith('Open') ? 'sparkline' : 'card';
      const entry = { page: url, title, kind, series: 0, monthly: false, metrics: 0, pdf: false };
      inventory.push(entry);
      await step(`chart ${url} [${kind}] ${title}`, async () => {
        if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
        const trigger = page.locator(TRIGGERS).nth(i);
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expectVisible(dialog, 'chart dialog');
        expect((await dialog.getAttribute('aria-label')) === title, `dialog title "${await dialog.getAttribute('aria-label')}" != "${title}"`);
        const plot = dialog.locator('svg.recharts-surface');
        await expectVisible(plot, 'dialog chart');
        const pills = dialog.locator('[aria-label="Legend"] button[aria-pressed]');
        entry.series = await pills.count();
        expect(entry.series >= 1, 'no legend series');
        if (entry.series >= 2) {
          await pills.first().click();
          expect((await pills.first().getAttribute('aria-pressed')) === 'false', 'legend pill did not hide its series');
          await pills.first().click();
          expect((await pills.first().getAttribute('aria-pressed')) === 'true', 'legend pill did not restore its series');
        }
        const gran = dialog.getByRole('group', { name: 'Show chart by day or month' });
        if (await gran.count()) {
          entry.monthly = true;
          await gran.getByRole('button', { name: 'Monthly' }).click();
          await expectVisible(gran.getByRole('button', { name: 'Monthly', pressed: true }), 'Monthly pressed');
          await expectVisible(plot, 'monthly chart');
          await gran.getByRole('button', { name: 'Daily' }).click();
          await expectVisible(gran.getByRole('button', { name: 'Daily', pressed: true }), 'Daily pressed');
        }
        const select = dialog.locator('select');
        if (await select.count()) {
          const opts = await select.first().locator('option').evaluateAll((o) => o.map((x) => x.value));
          entry.metrics = opts.length;
          if (opts.length > 1) {
            await select.first().selectOption(opts[1]);
            await expectVisible(plot, 'chart after metric switch');
            await select.first().selectOption(opts[0]);
          }
        }
        await expectVisible(dialog.getByText('How it is calculated'), 'calculation explanation');
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), dialog.getByRole('button', { name: 'Save PDF' }).click()]);
        validatePdf(await readFile(await download.path()), 'Save PDF');
        entry.pdf = true;
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached', timeout: 4000 });
        await trigger.click();
        await expectVisible(dialog, 'reopened dialog');
        await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
        await dialog.waitFor({ state: 'detached', timeout: 4000 });
      });
    }
  }
  await step('chart inventory: summary', async () => {
    const sparks = inventory.filter((c) => c.kind === 'sparkline').length;
    console.log(`chart inventory: ${inventory.length} charts (${inventory.length - sparks} cards, ${sparks} sparklines) on ${CHART_PAGES.length} pages`);
    if (process.env.CHART_INVENTORY) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(process.env.CHART_INVENTORY, JSON.stringify(inventory, null, 2));
    }
    expect(inventory.length >= 60, `only ${inventory.length} charts found`);
  });

  await step('screenshots: analytics pages', async () => {
    if (!shots) return;
    for (const [path, name] of [['/sales?platform=meta', 'sales'], ['/leads?platform=meta', 'leads'], ['/attribution', 'attribution'], ['/data-sources', 'data-sources'], ['/activity', 'activity']]) {
      await go(path);
      await shot(name, name === 'data-sources');
    }
  });

  await step('phone: navigation drawer opens and navigates', async () => {
    const { context, page: phone, problems } = await newPage({ name: 'phone', ...PHONE });
    try {
      await phone.goto(base + '/combined', { waitUntil: 'networkidle' });
      await phone.locator('h1').first().waitFor({ timeout: 8000 });
      await phone.getByRole('button', { name: 'Open menu' }).click();
      const drawer = phone.getByRole('dialog', { name: 'Main menu' });
      await expectVisible(drawer, 'navigation drawer');
      await drawer.getByRole('link', { name: /assistant/i }).click();
      await phone.waitForURL(/\/assistant/);
      await expectVisible(phone.locator('h1', { hasText: /assistant/i }), 'assistant heading on phone');
      expect(problems.length === 0, problems.join(' | '));
    } finally {
      await context.close();
    }
  });
}
