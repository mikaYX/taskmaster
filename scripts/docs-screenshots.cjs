/**
 * Captures the README screenshots (light and dark) and demo GIFs into docs/screenshots/.
 *
 * Run it against a THROWAWAY instance: it completes the setup wizard and seeds demo data.
 *   1. Empty database (migrations applied) and Redis; backend built and started with
 *      BOOTSTRAP_SECRET set, e.g. on PORT=3100.
 *   2. Frontend production build served by vite preview, proxying to that backend:
 *        npm -w frontend run build
 *        cd frontend && TASKMASTER_API_URL=http://localhost:3100 npx vite preview --port 5173
 *   3. DATABASE_URL in the environment pointing to that same database (used by the demo seed).
 *   4. npm run docs:screenshots   (TASKMASTER_URL overrides http://localhost:5173)
 * GIFs need ImageMagick (`convert` and `mogrify`) on the PATH.
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { mkdirSync, mkdtempSync, writeFileSync, rmSync } = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const BASE = process.env.TASKMASTER_URL || 'http://localhost:5173';
const EMAIL = 'admin@example.com';
const PASSWORD = 'Demo-Password-2026!';
const VIEWPORT = { width: 1440, height: 900 };
const GIF_WIDTH = 1200;

mkdirSync(OUT, { recursive: true });

/** Records the page through the CDP screencast, then encodes a GIF with ImageMagick. */
async function recordGif(page, name, scenario) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `taskmaster-${name}-`));
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, time: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height });
  await scenario();
  await page.waitForTimeout(1500);
  await cdp.send('Page.stopScreencast');

  // At most 10 frames per second, each shrunk first: full-size frames exhaust ImageMagick's cache.
  const sampled = [];
  for (const frame of frames) {
    if (!sampled.length || frame.time - sampled[sampled.length - 1].time >= 0.1) sampled.push(frame);
  }
  execFileSync('mogrify', ['-resize', `${GIF_WIDTH}x`, ...sampled.map((frame) => frame.file)]);

  // Each frame lasts until the next one; the last frame holds 2.5 s before the loop restarts.
  const args = ['-loop', '0'];
  sampled.forEach((frame, i) => {
    const next = sampled[i + 1];
    const delay = next ? Math.max(2, Math.round((next.time - frame.time) * 100)) : 250;
    args.push('-delay', String(delay), frame.file);
  });
  const gif = path.join(OUT, `${name}.gif`);
  args.push('-fuzz', '2%', '-layers', 'Optimize', gif);
  execFileSync('convert', args);
  rmSync(dir, { recursive: true, force: true });
  console.log(`✓ ${name}.gif (${frames.length} frames)`);
}

/** Types like a person, so the GIFs show the input being filled. */
async function type(locator, text) {
  await locator.click();
  await locator.pressSequentially(text, { delay: 35 });
}

async function completeSetup(page) {
  await page.goto(`${BASE}/setup`);
  await page.getByRole('button', { name: 'Next' }).waitFor();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Next' }).click();
  await type(page.locator('#email'), EMAIL);
  await type(page.locator('#password'), PASSWORD);
  await page.locator('#confirmPassword').fill(PASSWORD);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Complete Setup' }).waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Complete Setup' }).click();
  await page.waitForTimeout(2000);
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="password"]').waitFor();
  await page.locator('input:not([type="password"])').first().fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function validateTasks(page) {
  await page.goto(`${BASE}/tasks`);
  await page.getByRole('button', { name: 'Complete Morning operations briefing' }).waitFor();
  await page.waitForTimeout(1500);
  for (const task of ['Morning operations briefing', 'Server room temperature check', 'Daily safety walkthrough']) {
    await page.getByRole('button', { name: `Complete ${task}` }).click();
    await page.waitForTimeout(1600);
  }
  await page.getByText('Completed', { exact: true }).last().click();
  await page.waitForTimeout(1000);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(1500);
}

async function createTask(page) {
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.goto(`${BASE}/task-definitions/new`);
  await page.locator('input[name="name"]').waitFor();
  await page.waitForTimeout(800);
  await type(page.locator('input[name="name"]'), 'Fire alarm test');
  await type(page.locator('textarea[name="description"]'), 'Trigger a test alarm and check every sounder.');
  await page.getByText('Weekly', { exact: true }).click();
  await page.waitForTimeout(800);
  await next();
  await page.getByText('Pick a date').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-today] button, button[data-today]').first().click();
  await page.waitForTimeout(800);
  await next();
  await page.getByText('Sam Chen', { exact: true }).click();
  await page.waitForTimeout(800);
  await next();
  await page.waitForTimeout(1000);
  await next();
  await page.getByRole('button', { name: 'Create Task' }).waitFor();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Create Task' }).click();
  await page.waitForTimeout(2000);
}

/** Pages captured in both themes, as <name>-light.png and <name>-dark.png. */
const PAGES = [
  { name: 'board', path: '/tasks' },
  { name: 'analytics', path: '/analytics' },
  { name: 'analytics-tv', path: '/analytics', after: (page) => page.getByRole('button', { name: 'TV mode' }).click() },
  { name: 'task-definitions', path: '/task-definitions' },
  { name: 'settings', path: '/settings' },
  { name: 'todos', path: '/todos' },
  { name: 'profile', path: '/profile' },
];

async function captureTheme(newPage, theme) {
  const loginPage = await newPage(theme);
  await loginPage.goto(`${BASE}/login`);
  await loginPage.locator('input[type="password"]').waitFor();
  await loginPage.waitForTimeout(800);
  await loginPage.screenshot({ path: path.join(OUT, `login-${theme}.png`) });
  await login(loginPage);

  for (const { name, path: route, after } of PAGES) {
    await loginPage.goto(`${BASE}${route}`);
    await loginPage.waitForLoadState('networkidle');
    if (after) await after(loginPage);
    await loginPage.waitForTimeout(2500);
    await loginPage.screenshot({ path: path.join(OUT, `${name}-${theme}.png`) });
  }
  await loginPage.context().close();
  console.log(`✓ ${PAGES.length + 1} ${theme} screenshots`);
}

async function main() {
  const browser = await chromium.launch();
  const newPage = async (colorScheme) =>
    (await browser.newContext({ viewport: VIEWPORT, locale: 'en-US', colorScheme })).newPage();

  try {
    const setupPage = await newPage('light');
    await recordGif(setupPage, 'setup-wizard', () => completeSetup(setupPage));
    await setupPage.context().close();

    execFileSync('npm', ['-w', 'backend', 'run', 'db:seed-demo'], { cwd: ROOT, stdio: 'inherit' });

    const page = await newPage('light');
    await login(page);
    await recordGif(page, 'validate-task', () => validateTasks(page));

    await captureTheme(newPage, 'light');
    await captureTheme(newPage, 'dark');

    await recordGif(page, 'create-task', () => createTask(page));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
