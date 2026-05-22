import type { Page, Locator } from '@playwright/test';

export class SignInPage {
    readonly page: Page;
    readonly email: Locator;
    readonly password: Locator;
    readonly submit: Locator;

    constructor(page: Page) {
        this.page = page;
        this.email = page.locator('#email');
        this.password = page.locator('#pw');
        this.submit = page.getByRole('button', { name: /sign in/i });
    }

    async goto() {
        await this.page.goto('/signin');
    }

    async signIn(email: string, password: string) {
        await this.email.fill(email);
        await this.password.fill(password);
        await this.submit.click();
    }
}
