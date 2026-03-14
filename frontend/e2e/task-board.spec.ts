import { test, expect } from '@playwright/test';

/** Session admin authentifiée + configuration minimale. */
async function setupAuthenticatedSession(context: import('@playwright/test').BrowserContext) {
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
                user: { id: 1, role: 'ADMIN', username: 'admin', passkeysEnabled: false, passkeyPolicy: 'disabled', hasPasskey: false },
            },
        })
    );
    await context.route(/\/api\/settings(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/health$/, route => route.fulfill({ json: { status: 'ok' } }));
    await context.route(/\/api\/users(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/groups(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
    await context.route(/\/api\/sites(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
}

test.describe('Tableau de bord des tâches', () => {

    test.beforeEach(async ({ context }) => {
        await setupAuthenticatedSession(context);
    });

    test('Scénario 1 : état vide — message informatif quand aucune tâche planifiée', async ({ page }) => {
        await page.route(/\/api\/tasks\/board(\/.*|\?.*)?$/, route =>
            route.fulfill({ json: [] })
        );

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Le board doit afficher un message d'état vide
        const emptyMsg = page
            .getByText(/aucune tâche/i)
            .or(page.getByText(/no tasks/i))
            .first();
        await expect(emptyMsg).toBeVisible();
    });

    test('Scénario 2 : les tâches chargées sont affichées dans le board', async ({ page }) => {
        await page.route(/\/api\/tasks\/board(\/.*|\?.*)?$/, route =>
            route.fulfill({
                json: [
                    {
                        date: new Date().toISOString().slice(0, 10),
                        tasks: [
                            {
                                taskId: 1,
                                taskName: 'Vérification serveurs',
                                status: 'PENDING',
                                periodicity: 'DAILY',
                                assignedUsers: [],
                                assignedGroups: [],
                            },
                        ],
                    },
                ],
            })
        );

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Le nom de la tâche doit être visible
        await expect(page.getByText('Vérification serveurs')).toBeVisible();
    });

    test('Scénario 3 : une tâche validée affiche son statut visuellement', async ({ page }) => {
        await page.route(/\/api\/tasks\/board(\/.*|\?.*)?$/, route =>
            route.fulfill({
                json: [
                    {
                        date: new Date().toISOString().slice(0, 10),
                        tasks: [
                            {
                                taskId: 2,
                                taskName: 'Sauvegarde quotidienne',
                                status: 'VALIDATED',
                                periodicity: 'DAILY',
                                assignedUsers: [],
                                assignedGroups: [],
                            },
                        ],
                    },
                ],
            })
        );

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Le badge ou libellé de statut doit être visible
        const validatedBadge = page
            .getByText(/validé/i)
            .or(page.getByText(/validated/i))
            .first();
        await expect(validatedBadge).toBeVisible();
    });

    test('Scénario 4 : la route /tasks pointe bien vers le tableau de bord', async ({ page }) => {
        await page.route(/\/api\/tasks\/board(\/.*|\?.*)?$/, route =>
            route.fulfill({ json: [] })
        );

        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');

        // L'URL reste sur /tasks et la page se charge sans erreur
        await expect(page).toHaveURL(/\/tasks/);
        await expect(page.locator('body')).not.toHaveText(/not found/i);
    });
});
