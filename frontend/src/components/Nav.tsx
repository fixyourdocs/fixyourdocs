import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { signOut } from '../lib/auth';
import { Button } from '../components/Button';

export function Nav({ authed }: { authed: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile panel whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleSignOut = () => {
    signOut();
    setOpen(false);
    navigate('/');
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-600" />
          FixYourDocs
        </Link>

        {/* Desktop nav — unchanged inline row at sm:+ */}
        <nav className="hidden items-center gap-2 text-sm sm:flex">
          <a
            href="https://docs.fixyourdocs.io"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-slate-600 hover:text-slate-900"
          >
            Docs
          </a>
          <a
            href="https://docsfeedback.org"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-slate-600 hover:text-slate-900"
          >
            Protocol
          </a>
          {authed && (
            <Link to="/integrations/github" className="px-2 py-1 text-slate-600 hover:text-slate-900">
              Settings
            </Link>
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

        {/* Mobile toggle — hamburger below sm: */}
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 sm:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown panel */}
      {open && (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-slate-200 px-5 py-3 text-sm sm:hidden"
        >
          <a
            href="https://docs.fixyourdocs.io"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center text-slate-700 hover:text-slate-900"
          >
            Docs
          </a>
          <a
            href="https://docsfeedback.org"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center text-slate-700 hover:text-slate-900"
          >
            Protocol
          </a>
          {authed && (
            <Link
              to="/integrations/github"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center text-slate-700 hover:text-slate-900"
            >
              Settings
            </Link>
          )}
          {authed ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-[44px] items-center text-left text-slate-700 hover:text-slate-900"
            >
              Sign out
            </button>
          ) : (
            <>
              <Link
                to="/signin"
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center text-slate-700 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded-md bg-sky-600 px-3 text-white hover:bg-sky-700"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
