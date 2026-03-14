import { test, expect } from '@playwright/test';

/** Session admin + mocks API minimaux. */
async function setupAuthenticatedContext(context: import('@playwright/test').BrowserContext) {
    await context.route(/\/api\/setup\/status(\/.*|\?.*)?$/, route =>
        route.fulfill({ json: { needsSetup: false } })
    );
    await context.route(/\/api\/config\/public(\/.*|\?.*)?$/, route =>
        route.fulfill({ json: { appName: 'Taskmaster' } })
    );
    await context.route(/\/api\/auth\/session(\/.*|\?.*)?$/, route =>
        route.fulfill({
            json: {
                valid: true,
                user: {
                    id: 1,
                    role: 'ADMIN',
                    username: 'admin',
                    passkeysEnabled: false,
                    passkeyPolicy: 'disabled',
                    hasPasskey: false,
                },
            },
        })
    );
    await context.route(/\/api\/settings(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/health$/, route => route.fulfill({ json: { status: 'ok' } }));
    await context.route(/\/api\/users(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/groups(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/sites(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/tasks\/board(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/tasks(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
}

test.describe('Navigation — sidebar et routes', () => {

    test.beforeEach(async ({ context }) => {
        await setupAuthenticatedContext(context);
    });

    test('Scénario 1 : la sidebar est présente après authentification', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // La navigation latérale doit exister
        const nav = page.getByRole('navigation');
        await expect(nav).toBeVisible();
    });

    test('Scénario 2 : clic sur "Définitions de Tâches" navigue vers /task-definitions', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Lien de navigation
        const link = page
            .getByRole('link', { name: /définitions de tâches/i })
            .or(page.getByRole('link', { name: /task definitions/i }))
            .first();
        await expect(link).toBeVisible();
        await link.click();

        await expect(page).toHaveURL(/\/task-definitions/);
    });

    test('Scénario 3 : /task-definitions/new charge la page de création de tâche', async ({ page }) => {
        await page.goto('/task-definitions/new');
        await page.waitForLoadState('networkidle');

        // La page wizard doit charger sans erreur 404
        await expect(page).toHaveURL(/\/task-definitions\/new/);
        await expect(page.locator('body')).not.toHaveText(/not found/i);
        await expect(page.locator('body')).not.toHaveText(/404/i);
    });

    test('Scénario 4 : /task-definitions/archive charge la page des archives', async ({ page }) => {
        await page.route(/\/api\/tasks\/archived$/, route =>
            route.fulfill({ json: [] })
        );

        await page.goto('/task-definitions/archive');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/task-definitions\/archive/);
        await expect(page.locator('body')).not.toHaveText(/not found/i);
        await expect(page.locator('body')).not.toHaveText(/404/i);
    });

    test('Scénario 5 : une URL inconnue redirige vers la racine', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        await page.waitForLoadState('networkidle');

        // La route wildcard redirige vers /
        await expect(page).toHaveURL('/');
    });

    test('Scénario 6 : /settings charge la page des paramètres', async ({ page }) => {
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/settings/);
        await expect(page.locator('body')).not.toHaveText(/not found/i);
    });
});
