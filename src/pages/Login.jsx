// src/pages/Login.jsx
//
// Login screen with ProductNova branding. Uses the Netlify Identity widget's
// built-in modal (login / signup / forgot-password all live inside that
// widget - see AuthContext.jsx's login()/signup()). We don't hand-roll a
// password form ourselves; the widget handles validation, error display,
// and the "forgot password" reset-email flow out of the box.

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <div className="login-page">
      <div className="login-card card">
        {/* Placeholder text logo - swap for <img src="/logo.png" /> later */}
        <div className="login-logo">ProductNova CRM</div>
        <div className="login-subtitle">Sales funnel tracking, from lead to close.</div>
        <button onClick={login} style={{ width: '100%' }}>Log in</button>
        <p className="muted" style={{ marginTop: '1rem' }}>
          New here? Ask your Super Admin to invite you - self-signup is disabled.
        </p>
      </div>
    </div>
  );
}
