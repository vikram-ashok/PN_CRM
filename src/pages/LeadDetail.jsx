// src/pages/LeadDetail.jsx
//
// Lead detail view: shows the lead plus its linked Company, Deals, and
// Activities. Editable only for Admin/Super Admin (edit form + delete +
// reassign owner + change stage). Team sees a read-only detail page (still
// can log Activities - that's a create action, allowed for everyone - and
// the "log activity" mini-form is shown to all roles).

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, FUNNEL_STAGES, ACTIVITY_TYPES } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import RoleGate from '../components/RoleGate.jsx';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();

  const [lead, setLead] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [newActivity, setNewActivity] = useState({ summary: '', activityType: ACTIVITY_TYPES[0] });

  const load = useCallback(() => {
    // leads-list doesn't support fetching a single record by id directly in
    // this simple implementation, so we filter the full list client-side.
    // (For a larger dataset you'd add a dedicated leads-get.js function.)
    api.listLeads().then((data) => {
      const found = (data.records || []).find((r) => r.id === id);
      setLead(found || null);
      if (found) {
        setEditForm({
          fullName: found.fields['Full Name'] || '',
          email: found.fields['Email'] || '',
          phone: found.fields['Phone'] || '',
          leadSource: found.fields['Lead Source'] || '',
          funnelStage: found.fields['Funnel Stage'] || FUNNEL_STAGES[0],
          owner: found.fields['Owner'] || '',
          notes: found.fields['Notes'] || '',
          lostReason: found.fields['Lost Reason'] || '',
        });
      }
    }).catch((err) => setError(err.message));

    api.listDeals(id).then((data) => setDeals(data.records || [])).catch(() => {});
    api.listActivities(id).then((data) => setActivities(data.records || [])).catch(() => {});
    api.listCompanies().then((data) => setCompanies(data.records || [])).catch(() => {});
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.updateLead(id, editForm);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    try {
      await api.deleteLead(id);
      navigate('/leads');
    } catch (err) {
      setError(err.message);
    }
  };

  const logActivity = async (e) => {
    e.preventDefault();
    if (!newActivity.summary) return;
    try {
      await api.createActivity({ ...newActivity, leadId: id });
      setNewActivity({ summary: '', activityType: ACTIVITY_TYPES[0] });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <div className="page-container"><div className="error-banner">{error}</div></div>;
  if (!lead || !editForm) return <div className="page-container loading-spinner">Loading lead...</div>;

  const companyName = (() => {
    const linked = lead.fields['Company'];
    if (!linked || !linked.length) return null;
    const c = companies.find((co) => co.id === linked[0]);
    return c ? c.fields['Company Name'] : linked[0];
  })();

  return (
    <div className="page-container">
      <h1>{lead.fields['Full Name']}</h1>
      <span className="badge-stage">{lead.fields['Funnel Stage']}</span>

      <div className="section-title">Lead Details</div>
      {!canEdit ? (
        // ---- READ-ONLY VIEW (Team) ----
        <div className="card">
          <p><strong>Email:</strong> {lead.fields['Email'] || '-'}</p>
          <p><strong>Phone:</strong> {lead.fields['Phone'] || '-'}</p>
          <p><strong>Company:</strong> {companyName || '-'}</p>
          <p><strong>Lead Source:</strong> {lead.fields['Lead Source'] || '-'}</p>
          <p><strong>Owner:</strong> {lead.fields['Owner'] || '-'}</p>
          <p><strong>Notes:</strong> {lead.fields['Notes'] || '-'}</p>
        </div>
      ) : (
        // ---- EDIT FORM (Admin / Super Admin only) ----
        <form onSubmit={saveEdit} className="card" style={{ maxWidth: 560 }}>
          <div className="form-field">
            <label>Full Name</label>
            <input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Phone</label>
            <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Funnel Stage</label>
            <select value={editForm.funnelStage} onChange={(e) => setEditForm({ ...editForm, funnelStage: e.target.value })}>
              {FUNNEL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="muted">Setting this to "Nurture" only tags the record - the CRM sends no emails; an external automation handles Nurture drips outside this app.</p>
          </div>
          <div className="form-field">
            <label>Owner (reassign)</label>
            <input value={editForm.owner} onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Lost Reason</label>
            <input value={editForm.lostReason} onChange={(e) => setEditForm({ ...editForm, lostReason: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Notes</label>
            <textarea rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit">Save Changes</button>
            <RoleGate allow={['admin', 'superadmin']}>
              <button type="button" className="danger" onClick={handleDelete}>Delete Lead</button>
            </RoleGate>
          </div>
        </form>
      )}

      <div className="section-title">Linked Deals</div>
      <div className="card">
        {deals.length === 0 && <p className="muted">No deals yet.</p>}
        {deals.map((d) => (
          <div key={d.id} style={{ marginBottom: '0.5rem' }}>
            <strong>{d.fields['Deal Name']}</strong> - {d.fields['Stage']} - ₹{d.fields['Deal Value'] || 0}
          </div>
        ))}
      </div>

      <div className="section-title">Activity Timeline</div>
      <div className="card">
        {activities.length === 0 && <p className="muted">No activities logged yet.</p>}
        {activities.map((a) => (
          <div key={a.id} style={{ marginBottom: '0.5rem', borderBottom: '1px solid var(--pn-border)', paddingBottom: '0.5rem' }}>
            <strong>[{a.fields['Activity Type']}]</strong> {a.fields['Summary']}
            <div className="muted">{a.fields['Logged By']} - {a.fields['Date']}</div>
          </div>
        ))}

        {/* Logging an activity is a create action - allowed for every role. */}
        <form onSubmit={logActivity} style={{ marginTop: '1rem' }}>
          <div className="form-field">
            <label>Log New Activity</label>
            <select value={newActivity.activityType} onChange={(e) => setNewActivity({ ...newActivity, activityType: e.target.value })}>
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-field">
            <textarea
              rows={2}
              placeholder="What happened?"
              value={newActivity.summary}
              onChange={(e) => setNewActivity({ ...newActivity, summary: e.target.value })}
            />
          </div>
          <button type="submit">Add Activity</button>
        </form>
      </div>
    </div>
  );
}
