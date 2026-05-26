import { test, expect } from '../fixtures/pages';

test.describe('Public pages', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('landing renders', async ({ landing, page }) => {
        await landing.goto();
        await landing.expectLoaded();
        await expect(page.getByRole('heading', { name: /When agents hit broken docs/i })).toBeVisible();
    });
});
