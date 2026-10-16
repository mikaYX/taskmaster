import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => localStorage.setItem('taskmaster-language', 'fr'));
    await context.route(/^https?:\/\/[^/]+\/api\//, route => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({ json: path === '/api/health' ? { status: 'ok', db: 'up' }
            : path === '/api/setup/status' ? { needsSetup: false }
            : path === '/api/auth/session' ? { valid: true, user: { id: 7, role: 'USER', username: 'alice', passkeyPolicy: 'disabled', passkeysEnabled: false, hasPasskey: false } }
            : path === '/api/config/public' ? { appName: 'Taskmaster' } : [] });
    });
});

const profile = { id: 7, username: 'alice', fullname: 'Alice', email: 'alice@example.org', role: 'USER', avatarUrl: null, mfaEnabled: true, mfaRequired: true };

test('enregistre le nom du compte courant et affiche la MFA réelle après rechargement', async ({ page }) => {
    let fullname = profile.fullname;
    let adminReads = 0;
    await page.route('**/api/users', route => { adminReads++; return route.fulfill({ status: 403, json: {} }); });
    await page.route('**/api/users/me/profile', async route => {
        if (route.request().method() === 'PATCH') {
            expect(route.request().postDataJSON()).toEqual({ fullname: 'Alice Martin' });
            fullname = 'Alice Martin';
        }
        await route.fulfill({ json: { ...profile, fullname } });
    });
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Gérer la MFA' })).toBeVisible();
    await page.getByLabel('Full Name', { exact: true }).fill('Alice Martin');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Alice Martin', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Full Name', { exact: true })).toHaveValue('Alice Martin');
    expect(adminReads).toBe(0);
    await page.getByRole('button', { name: 'Gérer la MFA' }).click();
    await expect(page.getByText('MFA is enabled', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disable MFA', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View Backup Codes', exact: true })).toHaveCount(0);
});

test('conserve la saisie lorsque l’enregistrement échoue', async ({ page }) => {
    await page.route('**/api/users/me/profile', route => route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, json: { message: 'Enregistrement indisponible' } })
        : route.fulfill({ json: profile }));
    await page.goto('/profile');
    await page.getByLabel('Full Name', { exact: true }).fill('Nom à conserver');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Enregistrement indisponible', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Full Name', { exact: true })).toHaveValue('Nom à conserver');
    await expect(page.getByRole('heading', { name: 'Alice', exact: true })).toBeVisible();
});
