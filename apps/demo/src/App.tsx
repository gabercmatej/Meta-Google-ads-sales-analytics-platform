import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AppStateProvider } from './state/AppState';
import { SimProvider } from './sim/SimProvider';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));
const CreatePage = lazy(() => import('./pages/CreatePage'));
const DraftsPage = lazy(() => import('./pages/DraftsPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const AttributionPage = lazy(() => import('./pages/AttributionPage'));
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function page(el: React.ReactNode) {
  return <Suspense fallback={<div className="page-loading">Loading…</div>}>{el}</Suspense>;
}

export const routeObjects = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: 'overview', element: page(<OverviewPage />) },
      { path: 'campaigns', element: page(<CampaignsPage />) },
      { path: 'campaigns/:campaignId', element: page(<CampaignDetailPage />) },
      { path: 'create', element: page(<CreatePage />) },
      { path: 'drafts', element: page(<DraftsPage />) },
      { path: 'sales', element: page(<SalesPage />) },
      { path: 'leads', element: page(<LeadsPage />) },
      { path: 'attribution', element: page(<AttributionPage />) },
      { path: 'compare', element: page(<ComparisonPage />) },
      { path: 'assistant', element: page(<AssistantPage />) },
      { path: 'recommendations', element: page(<RecommendationsPage />) },
      { path: 'data-sources', element: page(<DataSourcesPage />) },
      { path: 'activity', element: page(<ActivityPage />) },
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
