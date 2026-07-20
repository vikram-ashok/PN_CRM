// src/AuthContext.jsx
//
// Wraps netlify-identity-widget in a small React context so any component
// can read the current user + derived role with `useAuth()`. This is the
// ONE place the frontend decides "what role am I displaying UI for" - but
// remember: this is purely a UI convenience. The REAL enforcement of what a
// role can actually DO happens server-side in netlify/functions/utils/auth.js
// (every mutating function re-checks the JWT role claim itself).

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import netlifyIdentity from 'netlify-identity-widget';

const AuthContext = createContext(null);

// Reads app_metadata.roles off the Identity user object and maps it to one
// of our three known roles, preferring the highest-privilege if multiple
// are somehow present.
function deriveRole(user) {
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];
  if (roles.includes('superadmin')) return 'superadmin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('team')) return 'team';
  return roles[0] || null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const onLogin = (u) => {
      setUser(u);
      netlifyIdentity.close();
    };
    const onLogout = () => setUser(null);
    const onInit = (u) => {
      setUser(u || null);
      setInitializing(false);
    };

    // IMPORTANT: event listeners must be registered BEFORE calling init().
    // netlify-identity-widget's init() reads the session from localStorage
    // and fires the 'init' event synchronously - if `.on('init', ...)` is
    // registered after `.init()` is called, the event has already fired and
    // is missed forever, leaving the app stuck on the loading screen with no
    // error (this was a real bug we hit: no console errors, no pending
    // network requests, just a permanently "initializing" state).
    netlifyIdentity.on('login', onLogin);
    netlifyIdentity.on('logout', onLogout);
    netlifyIdentity.on('init', onInit);

    netlifyIdentity.init(); // picks up an existing session if present

    return () => {
      netlifyIdentity.off('login', onLogin);
      netlifyIdentity.off('logout', onLogout);
      netlifyIdentity.off('init', onInit);
    };
  }, []);

  const login = useCallback(() => netlifyIdentity.open('login'), []);
  const signup = useCallback(() => netlifyIdentity.open('signup'), []);
  const logout = useCallback(() => netlifyIdentity.logout(), []);

  const role = deriveRole(user);

  const value = {
    user,
    role,
    initializing,
    isAuthenticated: !!user,
    isTeam: role === 'team',
    isAdmin: role === 'admin',
    isSuperAdmin: role === 'superadmin',
    canEdit: role === 'admin' || role === 'superadmin',
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
