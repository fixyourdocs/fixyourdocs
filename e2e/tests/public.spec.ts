import { test } from '../fixtures/pages';

test.describe('Public pages', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('landing renders', async ({ landing }) => {
        await landing.goto();
        await landing.expectLoaded();
    });

    test('directory loads', async ({ directory }) => {
        await directory.goto();
        await directory.expectLoaded();
    });
});
