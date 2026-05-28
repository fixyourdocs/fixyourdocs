import { Button } from './Button';
import { env } from '../lib/env';

// P3-08 — feature-flagged. Renders nothing until FEATURE_GITHUB_SIGNIN is on,
// so the button can't appear before the Hub route + Cognito triggers are live.
export function GithubSignInButton({ label = 'Sign in with GitHub' }: { label?: string }) {
  if (!env.FEATURE_GITHUB_SIGNIN) return null;
  return (
    <div className="mt-4">
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-2 text-xs text-slate-400">or</span>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => {
          window.location.href = `${env.HUB_BASE_URL}/v1/auth/github/start`;
        }}
      >
        {label}
      </Button>
    </div>
  );
}
