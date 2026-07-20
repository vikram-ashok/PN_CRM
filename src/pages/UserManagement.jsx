// src/pages/UserManagement.jsx
//
// Super Admin ONLY screen. Lists existing Netlify Identity users, lets the
// Super Admin invite a new user with a chosen role, and change an existing
// user's role. Backed by users-list.js / users-invite.js / users-update-role.js,
// each of which independently re-checks (server-side) that the caller is
// superadmin - this page being reachable is not the security boundary.
//
// This page is only linked from the Navbar for superadmin (RoleGate), and
// the route itself is also wrapped in a RoleGate-equivalent check below so
// that even a direct URL visit by a non-superadmin shows a polite message
// instead of a broken page (the functions would 403 anyway).

import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const ROLES = ['team', 'admin', 'superadmin'];

export default function UserManagement() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('team');

  const load = () => {
    setLoading(true);
    api
      .listUsers()
      .then((data) => setUsers(data.users || data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="page-container">
        <div className="error-banner">
          You do not have permission to view this page. User management is restricted to Super Admins.
        </div>
      </div>
    );
  }

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.inviteUser(inviteEmail, inviteRole);
      setInviteEmail('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeRole = async (userId, role) => {
    try {
      await api.updateUserRole(userId, role);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-container">
      <h1>Manage Users</h1>
      <p className="muted">
        Invite users and assign their role. If this fails in your environment, you can always manage
        users manually from Netlify: Site settings &rarr; Identity &rarr; Identity tab (see README).
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="section-title">Invite a New User</div>
      <form onSubmit={invite} className="card" style={{ maxWidth: 480, display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Email</label>
          <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        </div>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label>Role</label>
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button type="submit">Invite</button>
      </form>

      <div className="section-title">Existing Users</div>
      {loading && <div className="loading-spinner">Loading users...</div>}
      {!loading && (
        <table className="data-table">
          <thead>
            <tr><th>Email</th><th>Current Role</th><th>Change Role</th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const currentRole = (u.app_metadata && u.app_metadata.roles && u.app_metadata.roles[0]) || 'none';
              return (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{currentRole}</td>
                  <td>
                    <select value={currentRole} onChange={(e) => changeRole(u.id, e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
