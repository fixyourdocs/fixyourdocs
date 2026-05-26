import { test as setup, expect } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, '../playwright/.auth/user.json');

const EMAIL = process.env.FYD_TEST_EMAIL!;
const PASSWORD = process.env.FYD_TEST_PASSWORD!;

setup('authenticate', async ({ page }) => {
    await page.goto('/signin');
    await page.locator('#email').fill(EMAIL);
    await page.locator('#pw').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL(/\/integrations\/github/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/integrations\/github/);

    await page.context().storageState({ path: STORAGE_STATE });
});
