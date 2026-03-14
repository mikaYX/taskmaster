import { test, expect } from '@playwright/test';

/** Mocks communs à tous les scénarios de cette suite. */
async function setupBaseMocks(page: import('@playwright/test').Page) {
    await page.route(/\/api\/setup\/status(\/.*|\?.*)?$/, route =>
        route.fulfill({ json: { needsSetup: false } })
    );
    await page.route(/\/api\/config\/public(\/.*|\?.*)?$/, route =>
        route.fulfill({ json: { appName: 'Taskmaster' } })
    );
}

test.describe('Authentification — page de connexion', () => {

    test.beforeEach(async ({ page }) => {
        await setupBaseMocks(page);

        // Pas de session active → utilisateur non connecté
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, route =>
            route.fulfill({ json: { valid: false } })
        );
    });

    test('Scénario 1 : page de login affichée pour un visiteur non authentifié', async ({ page }) => {
        await page.goto('/');

        // L'utilisateur est redirigé vers /login
        await expect(page).toHaveURL(/\/login/);

        // Les champs d'identifiants sont présents
        await expect(page.getByLabel(/nom d'utilisateur/i)).toBeVisible();
        await expect(page.getByLabel(/mot de passe/i)).toBeVisible();

        // Le bouton de connexion est présent
        await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
    });

    test('Scénario 2 : connexion réussie redirige vers le tableau de bord', async ({ page }) => {
        let sessionCalled = false;

        await page.route(/\/api\/auth\/login$/, async route => {
            await route.fulfill({
                status: 200,
                json: { accessToken: 'tok123' },
            });
        });

        // Après login, la session devient valide
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, async route => {
            if (sessionCalled) {
                await route.fulfill({
                    json: {
                        valid: true,
                        user: { id: 1, role: 'USER', username: 'alice' },
                    },
                });
            } else {
                sessionCalled = true;
                await route.fulfill({ json: { valid: false } });
            }
        });

        await page.route(/\/api\/settings(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
        await page.route(/\/api\/tasks(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
        await page.route(/\/api\/health$/, route => route.fulfill({ json: { status: 'ok' } }));

        await page.goto('/login');

        await page.getByLabel(/nom d'utilisateur/i).fill('alice');
        await page.getByLabel(/mot de passe/i).fill('password123');
        await page.getByRole('button', { name: /se connecter/i }).click();

        // Après connexion, redirection vers l'app
        await expect(page).not.toHaveURL(/\/login/);
    });

    test("Scénario 3 : identifiants invalides affichent un message d'erreur", async ({ page }) => {
        await page.route(/\/api\/auth\/login$/, route =>
            route.fulfill({ status: 401, json: { message: 'Invalid credentials' } })
        );

        await page.goto('/login');

        await page.getByLabel(/nom d'utilisateur/i).fill('wrong');
        await page.getByLabel(/mot de passe/i).fill('badpass');
        await page.getByRole('button', { name: /se connecter/i }).click();

        // Un message d'erreur doit apparaître
        const error = page.getByRole('alert').or(page.locator('[aria-live]')).first();
        await expect(error).toBeVisible();
    });

    test('Scénario 4 : utilisateur déjà connecté redirigé hors de /login', async ({ page }) => {
        // Remplace le beforeEach : session déjà valide
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, route =>
            route.fulfill({
                json: { valid: true, user: { id: 1, role: 'USER', username: 'alice' } },
            })
        );

        await page.route(/\/api\/settings(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
        await page.route(/\/api\/tasks(\/.*|\?.*)?$/, route => route.fulfill({ json: [] }));
        await page.route(/\/api\/health$/, route => route.fulfill({ json: { status: 'ok' } }));

        await page.goto('/login');

        // Le guard redirige vers l'app principale
        await expect(page).not.toHaveURL(/\/login/);
    });
});
