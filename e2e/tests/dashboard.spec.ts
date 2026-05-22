import { test } from '../fixtures/pages';

test.describe('Dashboard', () => {
    test('authenticated user lands on /app', async ({ dashboard }) => {
        await dashboard.goto();
        await dashboard.expectLoaded();
    });
});
