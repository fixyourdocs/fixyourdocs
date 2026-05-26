import { test as base } from '@playwright/test';
import { SignInPage } from '../page-objects/SignInPage';
import { IntegrationsSetupPage } from '../page-objects/IntegrationsSetupPage';
import { LandingPage } from '../page-objects/LandingPage';

type Fixtures = {
    signIn: SignInPage;
    integrations: IntegrationsSetupPage;
    landing: LandingPage;
};

export const test = base.extend<Fixtures>({
    signIn:       async ({ page }, use) => { await use(new SignInPage(page)); },
    integrations: async ({ page }, use) => { await use(new IntegrationsSetupPage(page)); },
    landing:      async ({ page }, use) => { await use(new LandingPage(page)); },
});

export { expect } from '@playwright/test';
