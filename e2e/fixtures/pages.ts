import { test as base } from '@playwright/test';
import { SignInPage } from '../page-objects/SignInPage';
import { DashboardPage } from '../page-objects/DashboardPage';
import { DirectoryPage } from '../page-objects/DirectoryPage';
import { LandingPage } from '../page-objects/LandingPage';

type Fixtures = {
    signIn: SignInPage;
    dashboard: DashboardPage;
    directory: DirectoryPage;
    landing: LandingPage;
};

export const test = base.extend<Fixtures>({
    signIn:    async ({ page }, use) => { await use(new SignInPage(page)); },
    dashboard: async ({ page }, use) => { await use(new DashboardPage(page)); },
    directory: async ({ page }, use) => { await use(new DirectoryPage(page)); },
    landing:   async ({ page }, use) => { await use(new LandingPage(page)); },
});

export { expect } from '@playwright/test';
