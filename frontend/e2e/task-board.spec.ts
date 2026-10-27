import { test, expect, type BrowserContext } from '@playwright/test';
import type { BoardItem } from '../src/api/types';

function boardItem(id: number, status: BoardItem['status'] = 'RUNNING'): BoardItem {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
        taskId: id, taskName: `Contrôle ${id}`, status, periodicity: 'daily',
        instanceDate: date, originalDate: date, isShifted: false,
        periodStart: `${date}T00:00:00`, periodEnd: `${date}T23:59:59`,
        assignedUsers: [], assignedGroups: [],
    };
}

async function authenticatedSession(context: BrowserContext, role = 'ADMIN') {
    await context.addInitScript(() => localStorage.setItem('taskmaster-language', 'fr'));
    await context.route(/^https?:\/\/[^/]+\/api\//, route => {
        const path = new URL(route.request().url()).pathname;
        const json = path === '/api/health' ? { status: 'ok', db: 'up' }
            : path === '/api/setup/status' ? { needsSetup: false }
            : path === '/api/auth/session' ? { valid: true, user: { id: 1, role, username: 'admin', passkeyPolicy: 'disabled', passkeysEnabled: false, hasPasskey: false } }
            : path === '/api/config/public' ? { appName: 'Taskmaster' }
            : path === '/api/system/version' ? { updateAvailable: false }
            : [];
        return route.fulfill({ json });
    });
}

test.beforeEach(async ({ context }) => authenticatedSession(context));

test('affiche un état vide avec le contrat API actuel', async ({ page }) => {
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [], total: 0 } }));
    await page.goto('/');
    await expect(page.getByText('Aucune tâche en cours pour cette période')).toBeVisible();
});

test('valide une occurrence et actualise le tableau depuis le serveur', async ({ page }) => {
    const item = boardItem(1);
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [item], total: 1 } }));
    await page.route('**/api/tasks/1/status', async route => {
        expect(route.request().postDataJSON()).toEqual({ date: item.instanceDate, status: 'SUCCESS' });
        item.status = 'SUCCESS';
        await route.fulfill({ status: 201, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Valider Contrôle 1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Valider Contrôle 1', exact: true })).toHaveCount(0);
    await page.getByRole('switch', { name: 'Terminées', exact: true }).click();
    await expect(page.getByText('Contrôle 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Validé', { exact: true })).toBeVisible();
});

test('verrouille seulement la ligne en cours et empêche une double validation', async ({ page }) => {
    const items = [boardItem(1), boardItem(2)];
    let requests = 0;
    let finish!: () => void;
    const response = new Promise<void>(resolve => { finish = resolve; });
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items, total: items.length } }));
    await page.route('**/api/tasks/1/status', async route => {
        requests++;
        await response;
        items[0].status = 'SUCCESS';
        await route.fulfill({ status: 201, json: {} });
    });
    await page.goto('/');
    const first = page.getByRole('button', { name: 'Valider Contrôle 1', exact: true });
    await first.click();
    await expect(first).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Valider Contrôle 2', exact: true })).toBeEnabled();
    // A second DOM click must not send another request while the first is pending.
    await first.evaluate(button => (button as HTMLButtonElement).click());
    expect(requests).toBe(1);
    finish();
    await expect(first).toHaveCount(0);
});

test('conserve les tâches et affiche une erreur si la validation échoue', async ({ page }) => {
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [boardItem(1)], total: 1 } }));
    await page.route('**/api/tasks/1/status', route => route.fulfill({ status: 400, json: { message: 'Validation refusée' } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Valider Contrôle 1', exact: true }).click();
    await expect(page.getByText('Validation refusée')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider Contrôle 1', exact: true })).toBeEnabled();
});

test('un invité consulte le tableau sans action de validation', async ({ context, page }) => {
    await authenticatedSession(context, 'GUEST');
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [boardItem(1)], total: 1 } }));
    await page.goto('/');
    await expect(page.getByText('Contrôle 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider Contrôle 1', exact: true })).toHaveCount(0);
});

test('actualise les données au retour sur la fenêtre', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/tasks/board?*', route => {
        requests++;
        return route.fulfill({ json: { items: [boardItem(1)], total: 1 } });
    });
    await page.goto('/');
    await expect(page.getByText('Contrôle 1', { exact: true })).toBeVisible();
    const initial = requests;
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await expect.poll(() => requests).toBeGreaterThan(initial);
    await expect(page.getByText(/Dernière synchronisation/)).toBeVisible();
});


test('signale un échec avec commentaire pour la bonne occurrence', async ({ page }) => {
    const item = boardItem(1);
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [item], total: 1 } }));
    await page.route('**/api/tasks/1/status', async route => {
        expect(route.request().postDataJSON()).toEqual({ date: item.instanceDate, status: 'FAILED', comment: 'Équipement indisponible' });
        item.status = 'FAILED';
        item.validation = { byUserId: 1, validatedAt: new Date().toISOString(), byUsername: 'admin', comment: 'Équipement indisponible' };
        await route.fulfill({ status: 201, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Signaler un échec pour Contrôle 1', exact: true }).click();
    await page.getByPlaceholder('Expliquez pourquoi cette tâche a échoué...').fill('Équipement indisponible');
    await page.getByRole('button', { name: "Confirmer l'échec", exact: true }).click();
    await page.getByRole('switch', { name: 'Terminées', exact: true }).click();
    await expect(page.getByText('Équipement indisponible', { exact: true })).toBeVisible();
});

test('exige la checklist puis affiche le compte rendu de l’occurrence', async ({ page }) => {
    const item = boardItem(1);
    item.executionChecklist = [
        { id: 'inspection', label: 'Inspecter le panneau', kind: 'CHECK', required: true },
        { id: 'measure', label: 'Température relevée', kind: 'NUMBER', required: true },
    ];
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [item], total: 1 } }));
    await page.route('**/api/tasks/1/status', async route => {
        const payload = route.request().postDataJSON();
        expect(payload.executionAnswers).toEqual([{ id: 'inspection', value: true }, { id: 'measure', value: 0 }]);
        item.status = 'SUCCESS';
        item.executionRecord = item.executionChecklist!.map(step => ({ ...step, value: payload.executionAnswers.find((answer: { id: string }) => answer.id === step.id).value }));
        await route.fulfill({ status: 200, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Valider Contrôle 1', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled();
    await dialog.getByRole('checkbox', { name: /Inspecter le panneau/ }).check();
    await dialog.getByRole('spinbutton', { name: /Température relevée/ }).fill('0');
    await dialog.getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('switch', { name: 'Terminées', exact: true }).click();
    await page.getByRole('button', { name: 'Compte rendu', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Effectué', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('0', { exact: true })).toBeVisible();
});

test('crée une action corrective avec un contrôle échoué', async ({ page }) => {
    const item = boardItem(1);
    // The due date is a picker that opens on the current month: pick the 20th of that month.
    const now = new Date();
    const expectedDueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-20`;
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [item], total: 1 } }));
    await page.route('**/api/tasks/1/status', async route => {
        expect(route.request().postDataJSON().correctiveAction).toEqual({ title: 'Remplacer le panneau', dueDate: expectedDueDate });
        item.status = 'FAILED';
        await route.fulfill({ status: 200, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Signaler un échec pour Contrôle 1', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Créer une action corrective' }).check();
    await page.getByRole('textbox', { name: 'Action à réaliser' }).fill('Remplacer le panneau');
    await page.getByLabel('Échéance (facultative)', { exact: true }).click();
    // Day buttons are named "mardi 20 octobre 2026"; the 20th never appears as an outside day.
    await page.getByRole('button', { name: /^\S+ 20 \S+ \d{4}$/ }).click();
    await page.getByRole('button', { name: "Confirmer l'échec", exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Valider Contrôle 1', exact: true })).toHaveCount(0);
});


test('attend l’envoi de la photo avant de valider une checklist', async ({ page }) => {
    const item = boardItem(1);
    item.executionChecklist = [{ id: 'photo', label: 'Photo du panneau', kind: 'PHOTO', required: true }];
    const photoId = '12345678-1234-4234-8234-123456789012';
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items: [item], total: 1 } }));
    await page.route('**/api/tasks/1/execution/evidence?*', route => route.fulfill({ status: 201, json: { id: photoId } }));
    await page.route('**/api/tasks/1/status', async route => {
        expect(route.request().postDataJSON().executionAnswers).toEqual([{ id: 'photo', value: photoId }]);
        item.status = 'SUCCESS';
        await route.fulfill({ status: 200, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Valider Contrôle 1', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Valider', exact: true })).toBeDisabled();
    await page.getByLabel('Photo du panneau', { exact: false }).setInputFiles({ name: 'panel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=', 'base64') });
    await expect(page.getByText('Photo enregistrée', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Valider', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('clôture une action corrective avec sa résolution', async ({ page }) => {
    const action = { id: 1, taskId: 1, title: 'Remplacer le panneau', instanceDate: '2026-10-16T00:00:00Z', assigneeId: 1, createdById: 1, dueDate: null, state: 'OPEN', canUpdate: true, resolution: null as string | null, closedAt: null, task: { name: 'Contrôle 1', siteId: 1 }, assignee: { id: 1, username: 'admin', fullname: null } };
    await page.route('**/api/corrective-actions/search?*', route => {
        const state = new URL(route.request().url()).searchParams.get('state');
        const items = action.state === state ? [action] : [];
        return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 50 } });
    });
    await page.route('**/api/corrective-actions/1', async route => {
        const data = route.request().postDataJSON();
        expect(data).toEqual({ state: 'CLOSED', resolution: 'Panneau remplacé et testé' });
        action.state = data.state; action.resolution = data.resolution;
        await route.fulfill({ json: action });
    });
    await page.goto('/corrective-actions');
    await expect(page.getByRole('heading', { name: 'Remplacer le panneau' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clôturer l’action', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Résolution', exact: true }).fill('Panneau remplacé et testé');
    await page.getByRole('button', { name: 'Clôturer l’action', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Remplacer le panneau' })).toHaveCount(0);
    await page.getByRole('button', { name: /Clôturées/ }).click();
    await expect(page.getByRole('heading', { name: 'Remplacer le panneau' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Résolution', exact: true })).toHaveValue('Panneau remplacé et testé');
});

test('enregistre et restaure une vue avec ses filtres et son affichage compact', async ({ page }) => {
    const items = [boardItem(1), boardItem(2)];
    await page.route('**/api/tasks/board?*', route => route.fulfill({ json: { items, total: 2 } }));
    await page.goto('/');
    const search = page.getByRole('textbox', { name: 'Rechercher des tâches...' });
    await search.fill('Contrôle 1');
    await page.getByRole('switch', { name: 'Affichage compact', exact: true }).click();
    await page.getByRole('button', { name: 'Vues enregistrées', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nom de la vue', exact: true }).fill('Ronde du matin');
    await page.getByRole('button', { name: 'Enregistrer la vue actuelle', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ronde du matin', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await search.fill('');
    await page.getByRole('switch', { name: 'Affichage compact', exact: true }).click();
    await expect(page.getByText('Contrôle 2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vues enregistrées', exact: true }).click();
    await page.getByRole('button', { name: 'Ronde du matin', exact: true }).click();
    await expect(search).toHaveValue('Contrôle 1');
    await expect(page.locator('[data-density]')).toHaveAttribute('data-density', 'compact');
    await expect(page.getByText('Contrôle 2', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(search).toHaveValue('Contrôle 1');
    await expect(page.locator('[data-density]')).toHaveAttribute('data-density', 'compact');
    await page.getByRole('button', { name: 'Vues enregistrées', exact: true }).click();
    await page.getByRole('button', { name: 'Supprimer la vue Ronde du matin', exact: true }).click();
    await expect(page.getByText('Aucune vue enregistrée.', { exact: true })).toBeVisible();
});

test('filtre et pagine les actions correctives côté serveur', async ({ page }) => {
    const requests: URLSearchParams[] = [];
    await page.route('**/api/corrective-actions/search?*', route => {
        const params = new URL(route.request().url()).searchParams;
        requests.push(params);
        return route.fulfill({ json: { items: [], total: params.get('search') ? 0 : 51, page: Number(params.get('page')), pageSize: 50 } });
    });
    await page.goto('/corrective-actions');
    await expect(page.getByText('Page 1 sur 2 · 51 action(s)')).toBeVisible();
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    await expect(page.getByText('Page 2 sur 2 · 51 action(s)')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Mes actions', exact: true }).check();
    await expect(page.getByText('Page 1 sur 2 · 51 action(s)')).toBeVisible();
    await page.getByRole('checkbox', { name: 'En retard uniquement', exact: true }).check();
    await page.getByLabel('Rechercher une action, une tâche ou un responsable').fill('panneau');
    await expect(page.getByText('Page 1 sur 1 · 0 action(s)')).toBeVisible();
    const last = requests.at(-1)!;
    expect(last.get('mine')).toBe('true');
    expect(last.get('overdueBefore')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(last.get('search')).toBe('panneau');
    expect(last.get('page')).toBe('1');
});
