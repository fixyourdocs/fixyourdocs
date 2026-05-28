import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

const baseURL = process.env.BASE_URL!;

export default defineConfig({
    testDir: './tests',
    outputDir: './test-results',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 4,
    timeout: 60_000,
    reporter: process.env.CI
        ? [['junit', { outputFile: 'test-reports/results.xml' }], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'on-failure' }]],
    use: {
        baseURL,
        navigationTimeout: 60_000,
        trace: process.env.CI ? 'on' : 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'setup', testMatch: /.*\.setup\.ts/ },
        {
            name: 'authed',
            testMatch: /(integrations|auth)\.spec\.ts/,
            use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
            dependencies: ['setup'],
        },
        {
            name: 'public',
            testMatch: /landing\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'forwarder',
            testMatch: /forwarder\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            // P3-08 — "Sign in with GitHub". No storageState: this flow mints
            // its own session. The spec skips itself unless the sandbox env
            // (HUB_BASE_URL etc.) is present.
            name: 'github',
            testMatch: /auth-github\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
