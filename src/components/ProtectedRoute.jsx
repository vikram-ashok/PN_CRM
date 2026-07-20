// src/components/ProtectedRoute.jsx
//
// Wraps a page element and redirects unauthenticated visitors to /login.
// This is a frontend convenience only - real protection of data lives in
// the Netlify Functions (they 401/403 regardless of what the UI shows).

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return <div className="loading-spinner">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
