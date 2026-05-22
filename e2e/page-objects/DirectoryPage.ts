import { type Page, expect } from '@playwright/test';

export class DirectoryPage {
    constructor(readonly page: Page) {}
    async goto() { await this.page.goto('/directory'); }
    async expectLoaded() {
        await expect(this.page).toHaveURL(/\/directory/);
    }
}
