import { type Page, expect } from '@playwright/test';

export class LandingPage {
    constructor(readonly page: Page) {}
    async goto() { await this.page.goto('/'); }
    async expectLoaded() {
        await expect(this.page).toHaveURL(/\/$/);
    }
}
