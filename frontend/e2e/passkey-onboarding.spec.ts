import { test, expect } from '@playwright/test';

test.describe('Passkey Onboarding Modal', () => {

    // Configure default mocks for every test
    test.beforeEach(async ({ context }) => {

        await context.addInitScript(() => localStorage.setItem('taskmaster-language', 'en'));
        await context.route(/^https?:\/\/[^/]+\/api\//, route => {
            const path = new URL(route.request().url()).pathname;
            return route.fulfill({ json: path === '/api/health' ? { status: 'ok', db: 'up' }
                : path === '/api/tasks/board' ? { items: [], total: 0 } : [] });
        });

        // Mock Setup Status
        await context.route(/\/api\/setup\/status(\/.*|\?.*)?$/, async route => {
            await route.fulfill({ json: { needsSetup: false } });
        });

        // Mock Public Config
        await context.route(/\/api\/config\/public(\/.*|\?.*)?$/, async route => {
            await route.fulfill({ json: { appName: 'Taskmaster' } });
        });

        // Mock settings
        await context.route(/\/api\/settings(\/.*|\?.*)?$/, async route => {
            await route.fulfill({ json: [] });
        });

        // Initial empty tasks list for /tasks route
        await context.route(/\/api\/tasks(\/.*|\?.*)?$/, async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({ json: [] });
            } else {
                await route.continue();
            }
        });

        // Suppress credential prompts with a mock globally for the context
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'credentials', {
                value: {
                    create: async () => {
                        return {
                            id: 'mock-credential-id',
                            rawId: new ArrayBuffer(0),
                            response: {
                                clientDataJSON: new ArrayBuffer(0),
                                attestationObject: new ArrayBuffer(0),
                                getTransports: () => ['internal'],
                            },
                            getClientExtensionResults: () => ({}),
                            type: 'public-key'
                        };
                    },
                    get: async () => null,
                },
                configurable: true
            });
        });
    });

    test('Scenario 1: Login MFA + policy required + no passkey => modale bloquante', async ({ page }) => {
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, async route => {
            await route.fulfill({
                json: {
                    valid: true,
                    user: {
                        id: 1, role: 'USER', username: 'john',
                        passkeysEnabled: true,
                        passkeyPolicy: 'required',
                        hasPasskey: false
                    }
                }
            });
        });

        await page.goto('/');

        // Modal should appear
        const modal = page.getByRole('dialog', { name: /Setup a Passkey/i });
        await expect(modal).toBeVisible();

        // Should have "Configure Now"
        const configBtn = page.getByRole('button', { name: /Configure Now/i });
        await expect(configBtn).toBeVisible();

        // Should NOT have "Later" (Skip) because policy is required
        const skipBtn = page.getByRole('button', { name: /Later/i });
        await expect(skipBtn).not.toBeVisible();
    });

    test('Scenario 2: Enrolement passkey reussi => acces autorise immediatement', async ({ page }) => {
        let hasPasskeyState = false;

        // Mock session: first time no passkey, second time has passkey
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, async route => {
            await route.fulfill({
                json: {
                    valid: true,
                    user: {
                        id: 1, role: 'USER', username: 'john',
                        passkeysEnabled: true,
                        passkeyPolicy: 'required',
                        hasPasskey: hasPasskeyState
                    }
                }
            });
        });

        // Mock Passkey Generate Options
        await page.route(/\/api\/auth\/passkeys\/register\/options$/, async route => {
            await route.fulfill({
                json: {
                    rp: { name: 'Test', id: 'localhost' },
                    user: { id: 'user_id', name: 'john', displayName: 'John' },
                    challenge: 'chal',
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                    timeout: 60000,
                    attestation: 'none',
                    excludeCredentials: [],
                    authenticatorSelection: { userVerification: 'preferred' }
                }
            });
        });

        // Mock Passkey Verify
        await page.route(/\/api\/auth\/passkeys\/register\/verify$/, async route => {
            hasPasskeyState = true;
            await route.fulfill({
                json: { verified: true }
            });
        });

        await page.goto('/');

        const modal = page.getByRole('dialog', { name: /Setup a Passkey/i });
        await expect(modal).toBeVisible();

        const configBtn = page.getByRole('button', { name: /Configure Now/i });
        await configBtn.click();
        await page.getByLabel('Device Name', { exact: true }).fill('Test device');
        await page.getByRole('button', { name: 'Create Passkey', exact: true }).click();

        // Wait for modal to disappear (since we mocked credentials.create and verify route)
        await expect(modal).not.toBeVisible();

        // Check if page displays standard authenticated content
        await expect(page.locator('body')).not.toHaveText(/Setup a Passkey/i);
    });

    test('Scenario 3: Deux onglets ouverts, enrolement dans A => modale fermee dans B', async ({ context, page }) => {
        let hasPasskeyState = false;

        // Route for both pages in the context
        await context.route(/\/api\/auth\/session(\/.*|\?.*)?$/, async route => {
            await route.fulfill({
                json: {
                    valid: true,
                    user: {
                        id: 1, role: 'USER', username: 'john',
                        passkeysEnabled: true,
                        passkeyPolicy: 'required',
                        hasPasskey: hasPasskeyState
                    }
                }
            });
        });

        await context.route(/\/api\/auth\/passkeys\/register\/options$/, async route => {
            await route.fulfill({ json: { challenge: 'chal', rp: { id: 'localhost', name: 'rp' }, user: { id: 'dXNlcg', name: 'p', displayName: 'p' }, pubKeyCredParams: [] } });
        });

        await context.route(/\/api\/auth\/passkeys\/register\/verify$/, async route => {
            hasPasskeyState = true; // Update state for other tabs parsing the refetched session
            await route.fulfill({ json: { verified: true } });
        });

        const pageA = page; // use the default page
        const pageB = await context.newPage();

        await pageA.goto('/');
        await pageB.goto('/');

        const modalA = pageA.getByRole('dialog', { name: /Setup a Passkey/i });
        const modalB = pageB.getByRole('dialog', { name: /Setup a Passkey/i });

        await expect(modalA).toBeVisible();
        await expect(modalB).toBeVisible();

        // Enroll in Page A
        const configBtnA = pageA.getByRole('button', { name: /Configure Now/i });
        await configBtnA.click();
        await pageA.getByLabel('Device Name', { exact: true }).fill('Test device');
        await pageA.getByRole('button', { name: 'Create Passkey', exact: true }).click();

        // Modals should close in both pages due to BroadcastChannel / refetch
        await expect(modalA).not.toBeVisible();
        await expect(modalB).not.toBeVisible();
    });

    test('Scenario 4: Deja equipe passkey => aucun blocage', async ({ page }) => {
        await page.route(/\/api\/auth\/session(\/.*|\?.*)?$/, async route => {
            await route.fulfill({
                json: {
                    valid: true,
                    user: {
                        id: 1, role: 'USER', username: 'john',
                        passkeysEnabled: true,
                        passkeyPolicy: 'required',
                        hasPasskey: true // User already has a passkey
                    }
                }
            });
        });

        await page.goto('/');

        // Modal should never appear
        const modal = page.getByRole('dialog', { name: /Setup a Passkey/i });
        await expect(modal).not.toBeVisible();
    });
});
