// src/pages/AddLead.jsx
//
// Add Lead form - available to ALL roles, including Team (this is Team's
// primary entry point into the CRM). Submits to the leads-create Netlify
// Function, which any authenticated role is allowed to call. Team members
// may also pick the initial Funnel Stage here (create-time only) - but they
// can never come back and change it afterwards (leads-update.js rejects
// "team" server-side).

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, FUNNEL_STAGES, LEAD_SOURCES } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
  leadSource: LEAD_SOURCES[0],
  sourceCampaignDetail: '',
  funnelStage: FUNNEL_STAGES[0],
  owner: '',
  notes: '',
};

export default function AddLead() {
  const { user, canEdit } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...emptyForm, owner: (user && user.email) || '' });
  const [companies, setCompanies] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCompanies().then((data) => setCompanies(data.records || [])).catch(() => {});
    // Owner dropdown source. Team members always own their own leads (the
    // server enforces this), so they don't need the roster.
    if (canEdit) {
      api.listMembers().then((data) => setMembers(data.members || [])).catch(() => {});
    }
  }, [canEdit]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.createLead(form);
      navigate('/leads');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <h1>Add Lead</h1>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={submit} className="card" style={{ maxWidth: 560 }}>
        <div className="form-field">
          <label>Full Name *</label>
          <input required value={form.fullName} onChange={update('fullName')} />
        </div>
        <div className="form-field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={update('email')} />
        </div>
        <div className="form-field">
          <label>Phone</label>
          <input value={form.phone} onChange={update('phone')} />
        </div>
        <div className="form-field">
          <label>Company</label>
          <input
            list="company-options"
            placeholder="Type a company name (new or existing)"
            value={form.companyName}
            onChange={update('companyName')}
          />
          <datalist id="company-options">
            {companies.map((c) => (
              <option key={c.id} value={c.fields['Company Name']} />
            ))}
          </datalist>
          <p className="muted">Pick an existing company or type a new one - a new name is created automatically.</p>
        </div>
        <div className="form-field">
          <label>Lead Source</label>
          <select value={form.leadSource} onChange={update('leadSource')}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Source / Campaign Detail</label>
          <input value={form.sourceCampaignDetail} onChange={update('sourceCampaignDetail')} />
        </div>
        <div className="form-field">
          <label>Funnel Stage (initial - can only be changed later by Admin/Super Admin)</label>
          <select value={form.funnelStage} onChange={update('funnelStage')}>
            {FUNNEL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {canEdit ? (
          <div className="form-field">
            <label>Lead Owner</label>
            <select value={form.owner} onChange={update('owner')}>
              {/* Ensure the current user is always selectable even if the
                  roster is still loading or empty. */}
              {!members.some((m) => m.email === (user && user.email)) && user && (
                <option value={user.email}>{user.email} (you)</option>
              )}
              {members.map((m) => (
                <option key={m.email} value={m.email}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-field">
            <label>Lead Owner</label>
            <input value={(user && user.email) || ''} disabled />
            <p className="muted">You'll be set as the owner of this lead.</p>
          </div>
        )}
        <div className="form-field">
          <label>Notes</label>
          <textarea rows={4} value={form.notes} onChange={update('notes')} />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Create Lead'}
        </button>
      </form>
    </div>
  );
}
