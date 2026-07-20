// src/App.jsx - top-level app shell: auth provider, routing, and the
// Team-role lockdown mount point.

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import TeamLockdown from './components/TeamLockdown.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Performance from './pages/Performance.jsx';
import AddLead from './pages/AddLead.jsx';
import LeadsList from './pages/LeadsList.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import UserManagement from './pages/UserManagement.jsx';

function AppRoutes() {
  const { initializing } = useAuth();

  if (initializing) {
    return <div className="loading-spinner">Loading ProductNova CRM...</div>;
  }

  return (
    <>
      {/* Mounted once at the app root - activates the copy/cut/right-click
          block + user-select:none only when the current user's role is
          "team" (see components/TeamLockdown.jsx for the full rationale). */}
      <TeamLockdown />
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
        <Route path="/leads" element={<ProtectedRoute><LeadsList /></ProtectedRoute>} />
        <Route path="/leads/new" element={<ProtectedRoute><AddLead /></ProtectedRoute>} />
        <Route path="/leads/:id" element={<ProtectedRoute><LeadDetail /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
