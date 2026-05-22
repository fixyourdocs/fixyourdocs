import { type Page, expect } from '@playwright/test';

export class DashboardPage {
    constructor(readonly page: Page) {}
    async goto() { await this.page.goto('/app'); }
    async expectLoaded() {
        await expect(this.page).toHaveURL(/\/app($|\/|\?)/);
    }
}
