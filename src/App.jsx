import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ROLES } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
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

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/equipments" 
            element={
              <ProtectedRoute>
                <Layout>
                  <Equipments />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/failures" 
            element={
              <ProtectedRoute>
                <Layout>
                  <Failures />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/work-orders" 
            element={
              <ProtectedRoute>
                <Layout>
                  <WorkOrders />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/fmea" 
            element={
              <ProtectedRoute allowedRoles={[ROLES.OWNER, ROLES.ADMIN]}>
                <Layout>
                  <FMEA />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/simulator" 
            element={
              <ProtectedRoute>
                <Layout>
                  <Simulator />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/settings" 
            element={
              <ProtectedRoute allowedRoles={[ROLES.OWNER, ROLES.ADMIN]}>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            } 
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </DataProvider>
  </AuthProvider>
  );
}

export default App;
