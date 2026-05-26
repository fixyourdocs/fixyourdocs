import { test, expect } from '@playwright/test';

// P0-08 Step 4a — Cognito SRP path. Uses the pre-seeded test user signed in
// by `*.setup.ts` (storage state). The full sign-up + email-confirmation
// flow is deferred to P3-07.
test.describe('Cognito SRP sign-in (4a)', () => {
    test('GET /v1/orgs/me returns the signed-in user', async ({ page }) => {
        await page.goto('/integrations/github');

        const result = await page.evaluate(async () => {
            // Runs in the browser; cast through any since the e2e tsconfig
            // only ships node types.
            const g = globalThis as unknown as {
                localStorage: { length: number; key(i: number): string | null; getItem(k: string): string | null };
                fetch: typeof fetch;
                __ENV__?: { HUB_BASE_URL?: string };
            };
            const ls = g.localStorage;
            let tokenKey: string | null = null;
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (k && k.endsWith('.idToken')) { tokenKey = k; break; }
            }
            if (!tokenKey) throw new Error('No Cognito idToken in localStorage');
            const token = ls.getItem(tokenKey)!;
            const base = g.__ENV__?.HUB_BASE_URL ?? 'https://hub.fixyourdocs.io';
            const res = await g.fetch(`${base}/v1/orgs/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return { status: res.status, body: await res.json() };
        });

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            sub: expect.any(String),
            email: expect.any(String),
        });
    });
});
