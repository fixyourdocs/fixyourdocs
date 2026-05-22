import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '../lib/auth';
import { Button } from '../components/Button';

export function Nav({ authed }: { authed: boolean }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const showDash = authed && loc.pathname.startsWith('/app');

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-600" />
          FixYourDocs
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/directory" className="px-2 py-1 text-slate-600 hover:text-slate-900">Directory</Link>
          {showDash && (
            <>
              <Link to="/app" className="px-2 py-1 text-slate-600 hover:text-slate-900">Dashboard</Link>
              <Link to="/app/domains" className="px-2 py-1 text-slate-600 hover:text-slate-900">Domains</Link>
            </>
          )}
          {authed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                navigate('/');
              }}
            >
              Sign out
            </Button>
          ) : (
            <>
              <Link to="/signin" className="px-2 py-1 text-slate-700 hover:text-slate-900">Sign in</Link>
              <Link to="/signup" className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-700">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
