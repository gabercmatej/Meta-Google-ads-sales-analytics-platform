import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AppStateProvider } from './state/AppState';
import { SimProvider } from './sim/SimProvider';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const CombinedOverviewPage = lazy(() => import('./pages/CombinedOverviewPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));
const AdDetailPage = lazy(() => import('./pages/AdDetailPage'));
const CreatePage = lazy(() => import('./pages/CreatePage'));
const DraftsPage = lazy(() => import('./pages/DraftsPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const AttributionPage = lazy(() => import('./pages/AttributionPage'));
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const RecommendationDetailPage = lazy(() => import('./pages/RecommendationDetailPage'));
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function page(el: React.ReactNode) {
  return <Suspense fallback={<div className="py-16 text-center text-sm text-ink-3">Loading…</div>}>{el}</Suspense>;
}

export const routeObjects = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/combined" replace /> },
      { path: 'overview', element: page(<OverviewPage />) },
      { path: 'combined', element: page(<CombinedOverviewPage />) },
      { path: 'campaigns', element: page(<CampaignsPage />) },
      { path: 'campaigns/:campaignId', element: page(<CampaignDetailPage />) },
      { path: 'ads/:adId', element: page(<AdDetailPage />) },
      { path: 'create', element: page(<CreatePage />) },
      { path: 'drafts', element: page(<DraftsPage />) },
      { path: 'sales', element: page(<SalesPage />) },
      { path: 'leads', element: page(<LeadsPage />) },
      { path: 'attribution', element: page(<AttributionPage />) },
      { path: 'compare', element: page(<ComparisonPage />) },
      { path: 'assistant', element: page(<AssistantPage />) },
      { path: 'recommendations', element: page(<RecommendationsPage />) },
      { path: 'recommendations/:recKey', element: page(<RecommendationDetailPage />) },
      { path: 'data-sources', element: page(<DataSourcesPage />) },
      { path: 'activity', element: page(<ActivityPage />) },
      { path: 'users', element: page(<UsersPage />) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
];

const router = createBrowserRouter(routeObjects);

export function App() {
  return (
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>
  );
}
