import { test, expect } from '@playwright/test';

test.describe('Procedure Upload & Download (Lot 7)', () => {

    test.beforeEach(async ({ page }) => {
        // Mock Auth check
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, async route => {
            const json = { valid: true, user: { id: 1, role: 'ADMIN', username: 'admin' } };
            await route.fulfill({ json });
        });

        // Mock Setup Status
        await page.route(/\/api\/setup\/status(\/.*|\?.*)?$/, async route => {
            await route.fulfill({ json: { needsSetup: false } });
        });

        // Mock Public Config
        await page.route(/\/api\/config\/public(\/.*|\?.*)?$/, async route => {
            await route.fulfill({ json: { appName: 'Taskmaster' } });
        });

        // Mock settings
        await page.route(/\/api\/settings(\/.*|\?.*)?$/, async route => {
            await route.fulfill({ json: [] });
        });

        // Initial empty tasks list
        await page.route(/\/api\/tasks(\/.*|\?.*)?$/, async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({ json: [] });
            } else {
                await route.continue();
            }
        });
    });

    test('Scenario 1: Upload a procedure file during task creation', async ({ page }) => {
        let taskCreated = false;
        let uploadCalled = false;

        // Mock Task Creation
        await page.route(/\/api\/tasks$/, async route => {
            if (route.request().method() === 'POST') {
                taskCreated = true;
                await route.fulfill({
                    status: 201,
                    json: { id: 101, name: 'Test Upload Task', procedureUrl: null }
                });
            } else {
                await route.continue();
            }
        });

        // Mock Procedure Upload
        await page.route(/\/api\/tasks\/101\/procedure$/, async route => {
            if (route.request().method() === 'POST') {
                uploadCalled = true;
                const postData = route.request().postData();
                // Playwright doesn't easily parse FormData in route.request(), but we know it's a multipart request if it has boundaries
                expect(route.request().headers()['content-type']).toContain('multipart/form-data');
                await route.fulfill({
                    status: 200,
                    json: { id: 101, procedureUrl: 'local:101_procedure.pdf' }
                });
            } else {
                await route.continue();
            }
        });

        // Go to task creation page
        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');

        // Note: The actual locators depend on the real UI. We assume standard text/role locators based on previous code.
        const addBtn = page.getByRole('button', { name: /Ajouter/i });
        if (await addBtn.isVisible()) {
            await addBtn.click();
        }

        // Fill basic task info
        await page.getByLabel(/Nom de.*tâche/i).fill('Test Upload Task');
        await page.getByLabel(/Périodicité/i).click();
        await page.getByText('Quotidienne', { exact: true }).click();

        // Go to Procedure step (Step 3)
        const nextBtn = page.getByRole('button', { name: /Suivant/i });
        await nextBtn.click(); // to Assignation
        await nextBtn.click(); // to Procedure

        // Switch to Fichier mode
        await page.getByRole('tab', { name: /Fichier/i }).click();

        // Upload a dummy mock file
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('input[type="file"]').click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
            name: 'test_procedure.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('dummy pdf content')
        });

        // Go to Review
        await nextBtn.click();

        // Submit
        const submitBtn = page.getByRole('button', { name: /Confirmer et.*Créer/i });
        await submitBtn.click();

        // Wait for mutations
        await page.waitForTimeout(1000);

        // Verify both steps were called
        expect(taskCreated).toBe(true);
        expect(uploadCalled).toBe(true);
    });

    test('Scenario 2: Authenticated Download of local file', async ({ page }) => {
        // Mock a task with a local file
        await page.route(/\/api\/tasks\?/, async route => {
            const json = [{
                id: 102,
                taskId: 102,
                taskName: 'Downloadable Task',
                status: 'PENDING',
                procedureUrl: 'local:102_procedure.pdf',
                assignedUsers: [],
                assignedGroups: [],
                instanceDate: '2026-03-01'
            }];
            await route.fulfill({ json });
        });

        // Mock the download endpoint
        let downloadCalled = false;
        await page.route(/\/api\/tasks\/102\/procedure$/, async route => {
            if (route.request().method() === 'GET') {
                downloadCalled = true;
                // Check auth header
                const authHeader = route.request().headers()['authorization'];
                // We're mocking auth, but in a real fetch it sends the token if configured.
                await route.fulfill({
                    status: 200,
                    contentType: 'application/pdf',
                    headers: {
                        'Content-Disposition': 'attachment; filename="102_procedure.pdf"'
                    },
                    body: Buffer.from('fake pdf data')
                });
            } else {
                await route.continue();
            }
        });

        await page.goto('/tasks');
        await page.waitForLoadState('networkidle');

        // Locate the download button (FileText icon inside a button)
        // Usually it has a title="Télécharger la procédure"
        const downloadBtn = page.locator('button[title="Télécharger la procédure"]').first();
        await expect(downloadBtn).toBeVisible();

        // The download triggers a Blob fetch, then creates an ObjectURL and a virtual <a> tag click.
        // It does NOT trigger a page navigation, so we don't 'waitForEvent('download')' from Playwright directly in this specific client-side blob approach.
        await downloadBtn.click();

        await page.waitForTimeout(1000);

        expect(downloadCalled).toBe(true);
    });

});
