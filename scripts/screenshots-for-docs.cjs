/**
 * Prend les captures d'écran pour la doc : board avec données, analytics, wizard 5 étapes.
 * Prérequis : app lancée (npm run dev), base seedée (npm run db:seed-test-tasks + db:seed-demo depuis backend).
 * Usage : node scripts/screenshots-for-docs.cjs
 */
const puppeteer = require(require('path').join(__dirname, '..', 'node_modules/puppeteer'));
const { mkdirSync } = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'screenshots');
mkdirSync(DIR, { recursive: true });

const BASE = process.env.TASKMASTER_FRONTEND_URL || 'http://localhost:5173';
const EMAIL = process.env.TASKMASTER_LOGIN_EMAIL || 'admin@example.com';
const PASSWORD = process.env.TASKMASTER_LOGIN_PASSWORD || 'Lavieestbelle2026!';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickNextButton(page) {
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const next = buttons.find((b) => /next|suivant|→/i.test(b.innerText.trim()));
    if (next) {
      next.click();
      return true;
    }
    return false;
  });
  if (!clicked) {
    const btn = await page.$('button[type="button"]');
    if (btn) await btn.click();
  }
}

/** Ouvre le sélecteur Start Date, choisit la date du jour, ferme le popover. À appeler sur l'étape Scheduling (step 2). */
async function setStartDateToToday(page) {
  // Ouvrir le popover "Start Date" : clic sur le bouton "Pick a date"
  const pickDateBtn = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll('label, [class*="FormLabel"]'));
    const startLabel = labels.find((l) => /start date/i.test(l.textContent || ''));
    if (!startLabel) return null;
    const trigger = startLabel.closest('div')?.querySelector('button');
    return trigger || document.querySelector('button:has([class*="CalendarIcon"])');
  });
  const btn = pickDateBtn.asElement();
  if (btn) {
    await btn.click();
    await sleep(600);
  } else {
    // Fallback : premier bouton "Pick a date" ou avec CalendarIcon
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const pickBtn = buttons.find((b) => /pick a date|choisir/i.test(b.innerText) || b.querySelector('[class*="CalendarIcon"]'));
      if (pickBtn) pickBtn.click();
    });
    await sleep(600);
  }

  // Dans le popover : cliquer sur le jour "aujourd'hui" (react-day-picker)
  const dayClicked = await page.evaluate(() => {
    const today = new Date().getDate();
    const popover = document.querySelector('[data-slot="popover-content"]') || document.querySelector('[data-state="open"]') || document.querySelector('.rdp');
    if (!popover) return false;
    const buttons = popover.querySelectorAll('button');
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      const num = parseInt(text, 10);
      if (num === today && !b.disabled && !b.getAttribute('aria-disabled')) {
        b.click();
        return true;
      }
    }
    // Sinon premier jour cliquable (1-31) non disabled
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      const num = parseInt(text, 10);
      if (num >= 1 && num <= 31 && !b.disabled && !b.closest('[class*="outside"]')) {
        b.click();
        return true;
      }
    }
    return false;
  });
  if (!dayClicked) {
    await page.keyboard.press('Escape');
  }
  await sleep(400);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  const login = async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(1500);
    const emailSel = 'input[type="email"], input[name="email"], input[placeholder*="mail"], input[placeholder*="sername"]';
    await page.waitForSelector(emailSel, { timeout: 5000 }).catch(() => null);
    const emailInput = await page.$(emailSel) || await page.$('input:not([type="password"])');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(EMAIL);
    }
    const pwd = await page.$('input[type="password"]');
    if (pwd) {
      await pwd.click({ clickCount: 3 });
      await pwd.type(PASSWORD);
    }
    await page.click('button[type="submit"]');
    await sleep(4000);
  };

  try {
    await login();

    // 1. Task board avec données
    await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(3500);
    await page.screenshot({ path: path.join(DIR, '01-task-board.png') });
    console.log('✓ 01-task-board.png');

    // 2. Analytics (graphiques remplis)
    await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(DIR, '02-analytics.png') });
    console.log('✓ 02-analytics.png');

    // 3. Liste des définitions de tâches
    await page.goto(`${BASE}/task-definitions`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(3000);
    await page.screenshot({ path: path.join(DIR, '03-task-definitions.png') });
    console.log('✓ 03-task-definitions.png');

    // 4. Wizard création de tâche — les 5 étapes
    await page.goto(`${BASE}/task-definitions/new`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2000);

    // Step 1: Definition
    await page.screenshot({ path: path.join(DIR, 'wizard-01-definition.png') });
    console.log('✓ wizard-01-definition.png');

    // Remplir le minimum pour passer à l'étape 2
    const nameInput = await page.$('input[name="name"]') || await page.$('input[id*="name"]') || await page.$$('input[type="text"]').then((arr) => arr[0]);
    if (nameInput) await nameInput.type('Tâche démo', { delay: 50 });
    const descInput = await page.$('textarea[name="description"]') || await page.$('textarea');
    if (descInput) await descInput.type('Description de la tâche de démonstration.', { delay: 30 });
    await sleep(500);
    await clickNextButton(page);
    await sleep(1500);

    // Step 2: Scheduling — remplir la date de début pour pouvoir avancer vers les étapes 3–5
    await setStartDateToToday(page);
    await sleep(500);
    await page.screenshot({ path: path.join(DIR, 'wizard-02-scheduling.png') });
    console.log('✓ wizard-02-scheduling.png');
    await clickNextButton(page);
    await sleep(1500);

    // Step 3: Assignment (on y est grâce à la date renseignée à l’étape 2)
    await page.screenshot({ path: path.join(DIR, 'wizard-03-assignment.png') });
    console.log('✓ wizard-03-assignment.png');
    await clickNextButton(page);
    await sleep(1500);

    // Step 4: Notifications
    await page.screenshot({ path: path.join(DIR, 'wizard-04-notifications.png') });
    console.log('✓ wizard-04-notifications.png');
    await clickNextButton(page);
    await sleep(1500);

    // Step 5: Review & Create
    await page.screenshot({ path: path.join(DIR, 'wizard-05-review.png') });
    console.log('✓ wizard-05-review.png');

    // 5. Paramètres
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(DIR, '04-settings.png') });
    console.log('✓ 04-settings.png');

    // 6. Todos (liste simple)
    await page.goto(`${BASE}/todos`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(DIR, '06-todos.png') });
    console.log('✓ 06-todos.png');

    // 7. Profil
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(DIR, '07-profile.png') });
    console.log('✓ 07-profile.png');

    console.log('\n✅ Toutes les captures ont été enregistrées dans docs/screenshots/');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
