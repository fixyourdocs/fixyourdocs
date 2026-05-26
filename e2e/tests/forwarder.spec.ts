import { test, expect, request } from '@playwright/test';

// Forwarder smoke test. POSTs a v0 report to the Hub and asserts the
// response shape. While the FileReport handler is a 501 stub (P0-08
// Step 0d), any 5xx-or-4xx response from the Hub URL counts as a
// pass -- we are just checking that the endpoint is reachable and
// returns valid JSON. After Step 2 + Step 3 land, this test tightens
// to expect a 201 with an `id` and idempotent dedup on a second post.
//
// Skipped unless HUB_BASE_URL is set in the env. CI does not run e2e;
// this spec is meant for the maintainer running `pnpm --filter @fyd/e2e
// test` against a live Hub URL.

const HUB_BASE_URL = process.env.HUB_BASE_URL;

test.describe('forwarder smoke', () => {
    test.skip(!HUB_BASE_URL, 'HUB_BASE_URL not set; skipping live forwarder smoke');

    test('POST /v1/reports responds with structured JSON', async () => {
        const ctx = await request.newContext({ baseURL: HUB_BASE_URL });
        const res = await ctx.post('/v1/reports', {
            data: {
                protocol_version: '0',
                doc_url: 'https://docs.example.com/sso/setup',
                agent: { name: 'fyd-e2e-smoke' },
                report: {
                    kind: 'outdated',
                    summary: 'e2e smoke test report -- safe to delete',
                },
            },
        });
        // Either 201 (Step 2+ landed) or 501 (still on stub).
        expect([201, 501]).toContain(res.status());
        const body = await res.json();
        if (res.status() === 201) {
            expect(body).toHaveProperty('id');
            expect(typeof body.id).toBe('string');
        } else {
            expect(body).toHaveProperty('error');
        }
    });
});
