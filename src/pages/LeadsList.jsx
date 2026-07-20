// src/pages/LeadsList.jsx
//
// Leads board/list, grouped by Funnel Stage (simple Kanban-style columns).
// - Team: fully read-only view (no edit/delete affordances at all), plus
//   the "Add Lead" button (handled by Navbar). Copy/export is blocked by
//   TeamLockdown (see components/TeamLockdown.jsx) and the Export button
//   below is never rendered for Team (RoleGate), not just hidden by CSS.
// - Admin/Super Admin: see a "Delete" control per card and an "Export CSV"
//   button in the toolbar.

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, FUNNEL_STAGES } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import RoleGate from '../components/RoleGate.jsx';

function exportToCsv(leads) {
  const headers = ['Full Name', 'Email', 'Phone', 'Lead Source', 'Funnel Stage', 'Owner'];
  const rows = leads.map((l) => [
    l.fields['Full Name'] || '',
    l.fields['Email'] || '',
    l.fields['Phone'] || '',
    l.fields['Lead Source'] || '',
    l.fields['Funnel Stage'] || '',
    l.fields['Owner'] || '',
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `productnova-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsList() {
  const { canEdit } = useAuth();
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listLeads()
      .then((data) => setLeads(data.records || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (recordId) => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    try {
      await api.deleteLead(recordId);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const grouped = FUNNEL_STAGES.map((stage) => ({
    stage,
    items: leads.filter((l) => l.fields['Funnel Stage'] === stage),
  }));

  return (
    <div className="page-container">
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Leads</h1>
        {/* Export button only exists in the DOM for admin/superadmin - not
            just CSS-hidden - satisfying the "no copy/export for Team" rule. */}
        <RoleGate allow={['admin', 'superadmin']}>
          <button className="secondary" onClick={() => exportToCsv(leads)}>Export CSV</button>
        </RoleGate>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-spinner">Loading leads...</div>}

      <div className="kanban-board">
        {grouped.map(({ stage, items }) => (
          <div key={stage} className="kanban-column">
            <div className="kanban-column-title">{stage} ({items.length})</div>
            {items.map((lead) => (
              <div key={lead.id} className="kanban-card">
                <Link to={`/leads/${lead.id}`}>{lead.fields['Full Name']}</Link>
                <div className="muted">{lead.fields['Owner'] || 'Unassigned'}</div>
                {/* Delete control only rendered for admin/superadmin */}
                <RoleGate allow={['admin', 'superadmin']}>
                  <div style={{ marginTop: '0.4rem' }}>
                    <button className="danger" onClick={() => handleDelete(lead.id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                      Delete
                    </button>
                  </div>
                </RoleGate>
              </div>
            ))}
            {items.length === 0 && <div className="muted">No leads</div>}
          </div>
        ))}
      </div>

      {!canEdit && (
        <p className="muted" style={{ marginTop: '1rem' }}>
          Read-only view - Team members can create leads (via "Add Lead") but cannot edit, delete, or export existing records.
        </p>
      )}
    </div>
  );
}
