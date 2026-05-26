import { test } from '../fixtures/pages';

test.describe('Integrations setup', () => {
    test('authenticated user lands on /integrations/github', async ({ integrations }) => {
        await integrations.goto();
        await integrations.expectLoaded();
    });
});
