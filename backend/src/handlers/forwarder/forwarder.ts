import type { Handler } from 'aws-lambda';

interface ForwarderEvent {
  report_id: string;
  user_id: string;
}

// P0-08 Step 0d scaffold. Full implementation lands in Step 6: read the
// report + the maintainer's GitHub integration, mint a GitHub App
// installation token, POST a new Issue via the GitHub API. Idempotent on
// `report_id`.
export const handler: Handler<ForwarderEvent, { ok: false; reason: string }> = async (event) => {
  console.log('forwarder invoked (stub)', { report_id: event.report_id, user_id: event.user_id });
  return { ok: false, reason: 'not_implemented' };
};
