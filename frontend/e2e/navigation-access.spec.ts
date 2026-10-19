import { test, expect, type BrowserContext } from '@playwright/test';

async function session(context: BrowserContext, role: string) {
    await context.addInitScript(() => localStorage.setItem('taskmaster-language', 'fr'));
    const privateReads: string[] = [];
    await context.route(/^https?:\/\/[^/]+\/api\//, route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/settings' || path.startsWith('/api/settings/email/') || path.startsWith('/api/audit') || path.startsWith('/api/backups')) privateReads.push(path);
        const json = path === '/api/health' ? { status: 'ok' }
            : path === '/api/setup/status' ? { needsSetup: false }
            : path === '/api/auth/session' ? { valid: true, user: { id: 1, role, username: 'alice', passkeyPolicy: 'disabled', hasPasskey: false } }
            : path === '/api/settings/public/branding' ? { 'app.title': 'Équipe maintenance', 'app.subtitle': 'Site principal', 'app.showSubtitle': 'false', 'addons.todolist.enabled': false }
            : path === '/api/users/me/profile' ? { id: 1, username: 'alice', fullname: 'Alice', role, mfaEnabled: false, mfaRequired: false }
            : path === '/api/tasks/board' ? { items: [], total: 0 } : [];
        return route.fulfill({ json });
    });
    return privateReads;
}

for (const role of ['USER', 'GUEST']) {
    test(`${role} reçoit un accès refusé sans charger les API administrateur`, async ({ context, page }) => {
        const privateReads = await session(context, role);
        for (const path of ['/settings', '/admin/audit', '/backups']) {
            await page.goto(path);
            await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
        }
        await page.getByRole('link', { name: 'Retour au tableau de bord' }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole('link', { name: 'Paramètres', exact: true })).toHaveCount(0);
        await expect(page.getByRole('link', { name: "Journal d'audit", exact: true })).toHaveCount(0);
        expect(privateReads).toEqual([]);
        await expect(page).toHaveTitle('Équipe maintenance');
    });
}

test('le super administrateur conserve les liens de gestion et le branding public', async ({ context, page }) => {
    const privateReads = await session(context, 'SUPER_ADMIN');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Paramètres', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: "Journal d'audit", exact: true })).toBeVisible();
    await expect(page.getByText('Site principal', { exact: true })).toHaveCount(0);
    await expect(page).toHaveTitle('Équipe maintenance');
    expect(privateReads).toEqual([]);
});

test('le manager accède à Paramètres, mais uniquement à Sécurité (utilisateurs et groupes)', async ({ context, page }) => {
    const privateReads = await session(context, 'MANAGER');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Paramètres', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Utilisateurs', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: "Journal d'audit", exact: true })).toHaveCount(0);

    await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('tab', { name: 'Sécurité' })).toBeVisible();
    for (const hidden of ['Général', 'Authentification', 'Email', 'Export', 'Sauvegarde', 'Planificateur', 'Mises à jour']) {
        await expect(page.getByRole('tab', { name: hidden })).toHaveCount(0);
    }
    // Inside Security, a manager gets users and groups (of their own sites).
    await expect(page.getByRole('tab', { name: 'Utilisateurs' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Groupes' })).toBeVisible();

    for (const path of ['/admin/audit', '/backups']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
    }
    // Reading the settings of the application stays reserved to super administrators.
    expect(privateReads).toEqual([]);
});

test("le super administrateur n'a pas d'entrée Utilisateurs dans le menu : elle est dans Paramètres > Sécurité", async ({ context, page }) => {
    await session(context, 'SUPER_ADMIN');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Utilisateurs', exact: true })).toHaveCount(0);
});
