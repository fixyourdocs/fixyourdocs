import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { getIdToken, onAuthChange } from './lib/auth';
import { Landing } from './pages/Landing';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { ConfirmEmail } from './pages/ConfirmEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { Domains } from './pages/Domains';
import { DomainDetail } from './pages/DomainDetail';
import { ReportDetail } from './pages/ReportDetail';
import { Directory } from './pages/Directory';
import { PublicDomain } from './pages/PublicDomain';
import { PublicReport } from './pages/PublicReport';
import { Nav } from './components/Nav';
import { Spinner } from './components/Spinner';

function useAuthed(): 'loading' | 'yes' | 'no' {
  const [state, setState] = useState<'loading' | 'yes' | 'no'>('loading');
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      getIdToken().then((t) => {
        if (!cancelled) setState(t ? 'yes' : 'no');
      });
    refresh();
    const off = onAuthChange(refresh);
    return () => {
      cancelled = true;
      off();
    };
  }, []);
  return state;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const state = useAuthed();
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (state === 'no') navigate(`/signin?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
  }, [state, navigate, loc]);
  if (state !== 'yes') return <Spinner />;
  return <>{children}</>;
}

function Shell() {
  const authed = useAuthed() === 'yes';
  return (
    <div className="min-h-full">
      <Nav authed={authed} />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signup/confirm" element={<ConfirmEmail />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/app/domains" element={<RequireAuth><Domains /></RequireAuth>} />
        <Route path="/app/domains/:domain" element={<RequireAuth><DomainDetail /></RequireAuth>} />
        <Route path="/app/reports/:domain/:reportId" element={<RequireAuth><ReportDetail /></RequireAuth>} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/r/:domain" element={<PublicDomain />} />
        <Route path="/r/:domain/:reportId" element={<PublicReport />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
