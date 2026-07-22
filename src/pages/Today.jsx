// src/pages/Today.jsx
//
// "Who to contact today" queue: leads whose Next Contact Date is due today or
// overdue, split into two sections. Scope comes from leads-list (server-side):
// a Team member sees only their own leads; Admin/Super Admin see everyone's.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { bucketDueLeads } from '../dueLeads.js';

export default function Today() {
  const { canEdit } = useAuth();
  const [leads, setLeads] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.listLeads()
      .then((d) => setLeads(d.records || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api.listCompanies().then((d) => setCompanies(d.records || [])).catch(() => {});
    api.listMembers().then((d) => setMembers(d.members || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const companyById = useMemo(() => {
    const m = {};
    companies.forEach((c) => { m[c.id] = c.fields['Company Name']; });
    return m;
  }, [companies]);

  const ownerNameByEmail = useMemo(() => {
    const m = {};
    members.forEach((mem) => { m[mem.email] = mem.name; });
    return m;
  }, [members]);

  const companyName = useCallback((lead) => {
    const linked = lead.fields['Company'];
    if (!linked || !linked.length) return '';
    return companyById[linked[0]] || '';
  }, [companyById]);

  const ownerName = useCallback(
    (email) => (email ? (ownerNameByEmail[email] || email) : ''),
    [ownerNameByEmail]
  );

  const { overdue, today } = useMemo(() => bucketDueLeads(leads), [leads]);

  const Section = ({ title, rows, overdueStyle }) => (
    <>
      <div className="section-title">
        {title} <span className="muted">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing here.</p></div>
      ) : (
        <div className="perf-table-wrap">
          <table className="perf-table leads-table">
            <thead>
              <tr>
                <th className="perf-sticky">Lead</th>
                <th>Company</th>
                <th>Due date</th>
                <th>Note</th>
                {canEdit && <th>Owner</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id}>
                  <td className="perf-sticky"><Link to={`/leads/${lead.id}`}>{lead.fields['Full Name']}</Link></td>
                  <td>{companyName(lead) || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: overdueStyle ? 'var(--pn-danger)' : 'inherit', fontWeight: 600 }}>
                    {lead.fields['Next Contact Date']}
                  </td>
                  <td>{lead.fields['Next Contact Note'] || '-'}</td>
                  {canEdit && <td>{ownerName(lead.fields['Owner']) || 'Unassigned'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  return (
    <div className="page-container">
      <h1>Today</h1>
      <p className="muted">
        Leads due for contact today or overdue. {canEdit ? 'Showing all team leads.' : 'Showing your leads.'}
      </p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-spinner">Loading...</div>}

      {!loading && (
        <>
          <Section title="Overdue" rows={overdue} overdueStyle />
          <Section title="Due today" rows={today} />
          {overdue.length === 0 && today.length === 0 && (
            <p className="muted">You're all caught up - no callbacks due. Set a "next contact date" on a lead to schedule one.</p>
          )}
        </>
      )}
    </div>
  );
}
