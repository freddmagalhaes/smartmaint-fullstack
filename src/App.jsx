import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ROLES } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { Toaster } from 'sonner';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Equipments from './pages/Equipments';
import Failures from './pages/Failures';
import Simulator from './pages/Simulator';
import FMEA from './pages/FMEA';
import WorkOrders from './pages/WorkOrders';
import Settings from './pages/Settings';
import Layout from './components/Layout';
import BackofficeLayout from './components/BackofficeLayout';
import Backoffice from './pages/Backoffice';

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Dashboard - Root, Backoffice, Admin, Gerente */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]}>
                  <Layout><Dashboard /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* O.S. - Todos os níveis */}
            <Route 
              path="/work-orders" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER, ROLES.USER]}>
                  <Layout><WorkOrders /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* Equipamentos - Root, Backoffice, Admin, Gerente */}
            <Route 
              path="/equipments" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]}>
                  <Layout><Equipments /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* Falhas - Root, Backoffice, Admin, Gerente */}
            <Route 
              path="/failures" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]}>
                  <Layout><Failures /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* FMEA - Root, Backoffice, Admin */}
            <Route 
              path="/fmea" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN]}>
                  <Layout><FMEA /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* Simulador - Root, Backoffice, Admin, Gerente */}
            <Route 
              path="/simulator" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.MANAGER]}>
                  <Layout><Simulator /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* Configurações - Root, Backoffice, Admin */}
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE, ROLES.ADMIN]}>
                  <Layout><Settings /></Layout>
                </ProtectedRoute>
              } 
            />

            {/* Backoffice - APENAS Root e Backoffice (Suporte) */}
            <Route 
              path="/backoffice" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ROOT, ROLES.BACKOFFICE]}>
                  <BackofficeLayout><Backoffice /></BackofficeLayout>
                </ProtectedRoute>
              } 
            />

            {/* Usuário (nível mais baixo) cai direto nas O.S. */}
            <Route path="*" element={<Navigate to="/work-orders" replace />} />
          </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
