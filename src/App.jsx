import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, ROLES } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Toaster } from 'sonner';
import ProtectedRoute, { PageLoader, HomeRedirect } from './components/ProtectedRoute';
import Layout from './components/Layout';
import BackofficeLayout from './components/BackofficeLayout';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';

// Cada página vira um arquivo JS separado, carregado sob demanda (bundle inicial menor)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Equipments = lazy(() => import('./pages/Equipments'));
const Failures = lazy(() => import('./pages/Failures'));
const Simulator = lazy(() => import('./pages/Simulator'));
const FMEA = lazy(() => import('./pages/FMEA'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const PreventiveMaintenance = lazy(() => import('./pages/PreventiveMaintenance'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Settings = lazy(() => import('./pages/Settings'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Backoffice = lazy(() => import('./pages/Backoffice'));

const { ROOT, BACKOFFICE, ADMIN, MANAGER, USER } = ROLES;

// Páginas do sistema e perfis com acesso (o backend aplica as mesmas regras)
const APP_ROUTES = [
  { path: '/', element: <Dashboard />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { path: '/work-orders', element: <WorkOrders />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER, USER] },
  { path: '/equipments', element: <Equipments />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { path: '/preventive', element: <PreventiveMaintenance />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { path: '/inventory', element: <Inventory />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { path: '/failures', element: <Failures />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  { path: '/fmea', element: <FMEA />, roles: [ROOT, BACKOFFICE, ADMIN] },
  { path: '/simulator', element: <Simulator />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER] },
  // Configurações: todos (aba "Meu Perfil"); as demais abas são filtradas por perfil
  { path: '/settings', element: <Settings />, roles: [ROOT, BACKOFFICE, ADMIN, MANAGER, USER] },
];

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConfirmProvider>
          <DataProvider>
            <Router>
              <Toaster position="top-right" richColors />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {APP_ROUTES.map(({ path, element, roles }) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <ProtectedRoute allowedRoles={roles}>
                          <Layout>{element}</Layout>
                        </ProtectedRoute>
                      }
                    />
                  ))}

                  {/* Backoffice - APENAS Root e Suporte */}
                  <Route
                    path="/backoffice"
                    element={
                      <ProtectedRoute allowedRoles={[ROOT, BACKOFFICE]} requireTenant={false}>
                        <BackofficeLayout><Backoffice /></BackofficeLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Rotas desconhecidas: página inicial do perfil */}
                  <Route path="*" element={<HomeRedirect />} />
                </Routes>
              </Suspense>
            </Router>
          </DataProvider>
        </ConfirmProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
