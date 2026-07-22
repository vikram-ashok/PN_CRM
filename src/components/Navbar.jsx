// src/components/Navbar.jsx
//
// Top navigation bar. Shows role-aware links: everyone sees Dashboard/Leads/
// Add Lead; only Super Admin sees "Manage Users". Also shows a role badge
// and the logout button.

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import RoleGate from './RoleGate.jsx';

export default function Navbar() {
  const { user, role, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <nav className="navbar">
      {/*
        Placeholder text logo. To swap in a real logo image later, replace
        the <span> below with e.g.:
          <img src="/logo.png" alt="ProductNova" style={{ height: 28 }} />
      */}
      <NavLink to="/" className="navbar-brand">ProductNova CRM</NavLink>

      <div className="navbar-links">
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/today">Today</NavLink>
        <NavLink to="/performance">Performance</NavLink>
        <NavLink to="/leads">Leads</NavLink>
        <NavLink to="/leads/new">Add Lead</NavLink>
        <RoleGate allow={['superadmin']}>
          <NavLink to="/users">Manage Users</NavLink>
        </RoleGate>
        <span className="role-badge">{role}</span>
        <span className="muted">{user && user.email}</span>
        <button className="secondary" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}
