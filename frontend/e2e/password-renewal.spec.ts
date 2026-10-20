import { test, expect } from '@playwright/test';

test('après connexion avec un mot de passe réinitialisé, impose son remplacement avant la passkey', async ({ context, page }) => {
    let authenticated = false;
    let mustChangePassword = true;
    await context.addInitScript(() => localStorage.setItem('taskmaster-language', 'fr'));
    await context.route(/^https?:\/\/[^/]+\/api\//, async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/login') {
            authenticated = true;
            return route.fulfill({ json: { expiresIn: 900, mustChangePassword: true } });
        }
        if (path === '/api/auth/password') {
            expect(route.request().postDataJSON()).toEqual({ currentPassword: 'Temporary!Password42', password: 'Replacement!Password43' });
            mustChangePassword = false;
            return route.fulfill({ json: { ok: true } });
        }
        const json = path === '/api/health' ? { status: 'ok' }
            : path === '/api/setup/status' ? { needsSetup: false }
            : path === '/api/auth/session' ? authenticated ? { valid: true, user: { id: 1, username: 'operator', fullname: 'Operator', role: 'USER', mustChangePassword, passkeysEnabled: true, passkeyPolicy: 'required', hasPasskey: false } } : { valid: false, user: null }
            : path === '/api/tasks/board' ? { items: [], total: 0 }
            : {};
        return route.fulfill({ json });
    });
    await page.goto('/login');
    await page.getByLabel(/Nom d’utilisateur|Nom d'utilisateur|Username/i).fill('operator');
    await page.getByLabel(/Mot de passe|Password/i, { exact: true }).fill('Temporary!Password42');
    await page.getByRole('button', { name: /Se connecter|Sign in/i, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choisissez un nouveau mot de passe' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Configurer une passkey' })).toHaveCount(0);
    await dialog.getByLabel('Mot de passe actuel', { exact: true }).fill('Temporary!Password42');
    await dialog.getByLabel('Nouveau mot de passe', { exact: true }).fill('Replacement!Password43');
    await dialog.getByLabel('Confirmer le nouveau mot de passe', { exact: true }).fill('Replacement!Password43');
    await dialog.getByRole('button', { name: 'Changer le mot de passe', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Configurer une passkey' })).toBeVisible();
});

test('détecte une réinitialisation au retour dans un onglet déjà connecté sans effacer la saisie', async ({ context, page }) => {
    let mustChangePassword = false;
    await context.addInitScript(() => localStorage.setItem('taskmaster-language', 'fr'));
    await context.route(/^https?:\/\/[^/]+\/api\//, route => {
        const path = new URL(route.request().url()).pathname;
        const json = path === '/api/health' ? { status: 'ok' }
            : path === '/api/setup/status' ? { needsSetup: false }
            : path === '/api/auth/session' ? { valid: true, user: { id: 1, username: 'operator', role: 'USER', mustChangePassword, passkeysEnabled: false, passkeyPolicy: 'disabled', hasPasskey: false } }
            : path === '/api/tasks/board' ? { items: [], total: 0 } : {};
        return route.fulfill({ json });
    });
    await page.goto('/');
    await expect(page.getByText('Aucune tâche en cours pour cette période')).toBeVisible();
    const dialog = page.getByRole('dialog', { name: 'Choisissez un nouveau mot de passe' });
    await expect(dialog).toHaveCount(0);
    mustChangePassword = true;
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Mot de passe actuel', { exact: true }).fill('Temporary!Password42');
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(dialog.getByLabel('Mot de passe actuel', { exact: true })).toHaveValue('Temporary!Password42');
});
