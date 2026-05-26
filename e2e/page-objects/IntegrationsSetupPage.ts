import { type Page, expect } from '@playwright/test';

export class IntegrationsSetupPage {
  constructor(readonly page: Page) {}
  async goto() { await this.page.goto('/integrations/github'); }
  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/integrations\/github/);
    await expect(this.page.getByRole('heading', { name: /Connect a GitHub repo/i })).toBeVisible();
  }
}
