import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MenuPage from './features/customer/MenuPage';
import CartPage from './features/customer/CartPage';
import TrackPage from './features/customer/TrackPage';
import { useAuth } from './lib/auth';
import JoinPage from './features/auth/JoinPage';

const LandingPage = lazy(() => import('./features/site/LandingPage'));
const LoyaltyPortal = lazy(() => import('./features/customer/LoyaltyPortal'));
const LegalPage = lazy(() => import('./features/site/LegalPage'));
const AnalyticsGuidePage = lazy(() => import('./features/site/AnalyticsGuidePage'));
const DashboardApp = lazy(() => import('./features/dashboard/DashboardApp'));
const AdminApp = lazy(() => import('./features/admin/AdminApp'));

export default function App() {
  const { authed } = useAuth();
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Marketing landing (public) — but a session already in localStorage skips
            straight to the dashboard instead of showing the marketing page again;
            DashboardApp itself further routes platform admins on to /admin. */}
        <Route path="/" element={authed ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/guide/analytics" element={<AnalyticsGuidePage />} />

        {/* App A — customer (public) */}
        <Route path="/r/:slug" element={<MenuPage />} />
        <Route path="/r/:slug/b/:branchId" element={<MenuPage />} />
        <Route path="/r/:slug/b/:branchId/car" element={<MenuPage />} />
        <Route path="/r/:slug/b/:branchId/t/:tableToken" element={<MenuPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/order/:trackingToken" element={<TrackPage />} />
        <Route path="/loyalty" element={<LoyaltyPortal />} />

        {/* An invited staff member setting their password. Public: they have no account yet. */}
        <Route path="/join/:token" element={<JoinPage />} />

        {/* App B — Serva dashboard (JWT) */}
        <Route path="/dashboard/*" element={<DashboardApp />} />

        {/* App C — platform admin (JWT) */}
        <Route path="/admin/*" element={<AdminApp />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
