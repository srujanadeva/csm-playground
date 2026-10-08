/**
 * Routes. Each module is code-split (React.lazy), so a browser only downloads the screens
 * it opens; the admin bundle is never fetched by a user who can't see the admin screens.
 */
import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './app/AppShell.tsx'
import { NotFound, RequireAuth, RequireScreen } from './app/guards.tsx'

const LoginPage = lazy(() => import('./modules/auth/LoginPage.tsx'))
const ChangePasswordPage = lazy(() => import('./modules/auth/ChangePasswordPage.tsx'))
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage.tsx'))
const OnboardWizard = lazy(() => import('./modules/customers/onboard/OnboardWizard.tsx'))
const CustomerSearchPage = lazy(() => import('./modules/customers/search/CustomerSearchPage.tsx'))
const Customer360Page = lazy(() => import('./modules/customers/c360/Customer360Page.tsx'))
const NewRequestPage = lazy(() => import('./modules/requests/NewRequestPage.tsx'))
const RequestBoardPage = lazy(() => import('./modules/requests/RequestBoardPage.tsx'))
const TellerCounterPage = lazy(() => import('./modules/teller/TellerCounterPage.tsx'))
const CashDrawerPage = lazy(() => import('./modules/teller/CashDrawerPage.tsx'))
const UsersPage = lazy(() => import('./modules/admin/UsersPage.tsx'))
const ScreensPage = lazy(() => import('./modules/admin/ScreensPage.tsx'))

const screen = (key: string, element: React.ReactNode) => (
  <RequireScreen screen={key}>{element}</RequireScreen>
)

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: screen('dashboard', <DashboardPage />) },
      { path: 'customers/new', element: screen('customers.onboard', <OnboardWizard />) },
      { path: 'customers', element: screen('customers.search', <CustomerSearchPage />) },
      { path: 'customers/:ref', element: screen('customers.360', <Customer360Page />) },
      { path: 'service-requests/new', element: screen('serviceRequests.new', <NewRequestPage />) },
      { path: 'service-requests', element: screen('serviceRequests.board', <RequestBoardPage />) },
      { path: 'teller', element: screen('teller.counter', <TellerCounterPage />) },
      { path: 'teller/drawer', element: screen('teller.drawer', <CashDrawerPage />) },
      { path: 'admin/users', element: screen('admin.users', <UsersPage />) },
      { path: 'admin/screens', element: screen('admin.screens', <ScreensPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
])
