import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { Layout } from './components/Layout';
import { LogoMark } from './components/Logo';
import { ToastProvider } from './components/ui';
import { ApiError, refreshSession } from './lib/api';
import { PanelProvider } from './lib/panels';
import { can, useUser } from './lib/session';
import { AuditLog } from './pages/AuditLog';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Orders } from './pages/Orders';
import { Restaurants } from './pages/Restaurants';
import { Riders } from './pages/Riders';
import { Team } from './pages/Team';
import { UsersPage } from './pages/Users';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

function App() {
  const user = useUser();
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    // Restore the session silently from the HttpOnly refresh cookie.
    void refreshSession().finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    if (!user) queryClient.clear(); // never keep another session's data in memory
  }, [user]);

  if (restoring) {
    return (
      <div className="boot">
        <div className="boot-mark">
          <LogoMark size={64} />
        </div>
      </div>
    );
  }
  if (!user) return <Login />;

  const ops = can(user, 'view_ops');
  return (
    <PanelProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {ops && <Route path="orders" element={<Orders />} />}
          {ops && <Route path="riders" element={<Riders />} />}
          {ops && <Route path="restaurants" element={<Restaurants />} />}
          {ops && <Route path="users" element={<UsersPage />} />}
          {can(user, 'super') && <Route path="team" element={<Team />} />}
          {can(user, 'super') && <Route path="audit" element={<AuditLog />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </PanelProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
