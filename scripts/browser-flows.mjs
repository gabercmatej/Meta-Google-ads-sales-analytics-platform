// End-to-end flows for scripts/browser-test.mjs. Each step is independent: a failure is reported and the next step runs.
// With SCREENSHOTS set, the README screenshots are captured along the way.
import { join } from 'node:path';

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
  const shot = async (name, p = page) => {
    if (!shots) return;
    await p.waitForTimeout(400); // let chart animations settle (reduced motion is on, but layout may still shift)
    await p.screenshot({ path: join(shots, `${name}.png`) });
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
    await shot('combined');
    await channel('google').click();
    await page.waitForURL(/\/overview\?.*platform=google/);
    await shot('overview-google');
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

  await step('overview: custom period with explicit dates', async () => {
    await go('/overview?platform=meta&period=last30');
    await shot('overview');
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
      await shot('comparison');
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
    await shot('campaigns');
    await go('/campaigns/meta-c1?platform=meta');
    await shot('campaign-detail');
  });

  await step('create: draft is saved and listed on Drafts', async () => {
    await go('/create?platform=meta');
    await next();
    await page.getByLabel('Campaign name').fill('Autumn consultation test');
    await page.getByLabel('Daily budget (EUR)').fill('25');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expectVisible(page.getByText(/Draft saved in this browser/), 'draft saved note');
    await go('/drafts?platform=meta');
    await expectVisible(page.getByText('Autumn consultation test'), 'draft on the Drafts page');
    await page.getByRole('button', { name: 'Validate' }).first().click();
    await expectVisible(page.locator('main article').first().locator('[role=status], [role=alert]'), 'validation result');
  });

  await step('create: Meta campaign with ad is created PAUSED and listed in Campaigns', async () => {
    await go('/create?platform=meta');
    await next();
    await page.getByLabel('Campaign name').fill('Winter documents demo');
    await page.getByLabel('Daily budget (EUR)').fill('30');
    await next();
    await next();
    await page.getByLabel('Ad name').fill('Winter documents ad');
    await page.getByLabel('Headline', { exact: true }).fill('Documents reviewed in two days');
    await page.getByLabel('Primary text', { exact: true }).fill('A fictional ad used only in this demo.');
    const url = page.getByLabel('Final URL');
    await url.fill((await url.inputValue()) + 'documents');
    await shot('create');
    await next();
    await next();
    await page.getByRole('button', { name: 'Create (PAUSED)' }).click();
    await expectVisible(page.getByText('Created in simulation (PAUSED)'), 'created confirmation');
    await go('/campaigns?platform=meta');
    await expectVisible(page.getByText('Winter documents demo'), 'created campaign row');
    await expectVisible(page.getByText('Created in demo').first(), 'created badge');
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
    await go('/users');
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

  await step('screenshots: analytics pages', async () => {
    if (!shots) return;
    for (const [path, name] of [['/sales?platform=meta', 'sales'], ['/leads?platform=meta', 'leads'], ['/attribution', 'attribution'], ['/data-sources', 'data-sources'], ['/activity', 'activity'], ['/drafts?platform=meta', 'drafts']]) {
      await go(path);
      await shot(name);
    }
  });

  await step('phone: navigation drawer opens and navigates', async () => {
    const { context, page: phone, problems } = await newPage({ name: 'phone', ...PHONE });
    try {
      await phone.goto(base + '/combined', { waitUntil: 'networkidle' });
      await phone.locator('h1').first().waitFor({ timeout: 8000 });
      await shot('mobile-overview', phone);
      await phone.getByRole('button', { name: 'Open menu' }).click();
      const drawer = phone.getByRole('dialog', { name: 'Main menu' });
      await expectVisible(drawer, 'navigation drawer');
      await shot('mobile-nav', phone);
      await drawer.getByRole('link', { name: /assistant/i }).click();
      await phone.waitForURL(/\/assistant/);
      await expectVisible(phone.locator('h1', { hasText: /assistant/i }), 'assistant heading on phone');
      expect(problems.length === 0, problems.join(' | '));
    } finally {
      await context.close();
    }
  });
}
