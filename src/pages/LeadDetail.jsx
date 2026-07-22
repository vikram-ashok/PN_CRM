// src/pages/LeadDetail.jsx
//
// Lead detail view: shows the lead plus its linked Company, Deals, and
// Activities.
//   - Admin / Super Admin: full edit form (all fields + delete + reassign
//     owner + change stage).
//   - Team: a LIMITED edit form on the leads they own - they may move the
//     lead through the funnel (Funnel Stage) and keep Email / Phone / Notes
//     current, but cannot rename it, change its source, or reassign the
//     owner. (leads-list only ever returns a Team member their own leads, and
//     leads-update.js re-checks ownership + the field whitelist server-side.)
//   - Everyone can log Activities (a create action).

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, FUNNEL_STAGES, ACTIVITY_TYPES, CALL_OUTCOMES, EMAIL_EVENTS, LINKEDIN_EVENTS } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import RoleGate from '../components/RoleGate.jsx';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, isTeam } = useAuth();

  const [lead, setLead] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [members, setMembers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const emptyActivity = { summary: '', activityType: ACTIVITY_TYPES[0], callOutcome: '', emailEvent: 'Sent', linkedinEvent: 'Request Sent', messageContent: '', isFollowUp: false, dnpAttempt: '' };
  const [newActivity, setNewActivity] = useState(emptyActivity);

  // Suggested next DNP attempt for this lead: count unanswered calls since the
  // last "Connected" (chronological), +1, capped at 5. No date enforcement.
  const suggestedDnp = (() => {
    const calls = activities
      .filter((a) => a.fields['Activity Type'] === 'Call')
      .sort((a, b) => new Date(a.fields['Date'] || 0) - new Date(b.fields['Date'] || 0));
    let n = 0;
    calls.forEach((c) => {
      const o = c.fields['Call Outcome'];
      if (o === 'Connected') n = 0;
      else if (o === 'DNP') n = Math.min(n + 1, 5);
    });
    return Math.min(n + 1, 5);
  })();

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
          nextContactDate: found.fields['Next Contact Date'] || '',
          nextContactNote: found.fields['Next Contact Note'] || '',
          linkedinUrl: found.fields['LinkedIn URL'] || '',
        });
      }
    }).catch((err) => setError(err.message));

    api.listDeals(id).then((data) => setDeals(data.records || [])).catch(() => {});
    api.listActivities(id).then((data) => setActivities(data.records || [])).catch(() => {});
    api.listCompanies().then((data) => setCompanies(data.records || [])).catch(() => {});
    if (canEdit) {
      api.listMembers().then((data) => setMembers(data.members || [])).catch(() => {});
    }
  }, [id, canEdit]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async (e) => {
    e.preventDefault();
    setError('');
    // Team members may only change a subset of fields; send exactly those so
    // the server's field whitelist never trips on an unchanged locked field.
    const payload = isTeam
      ? {
          funnelStage: editForm.funnelStage,
          notes: editForm.notes,
          email: editForm.email,
          phone: editForm.phone,
          nextContactDate: editForm.nextContactDate,
          nextContactNote: editForm.nextContactNote,
          linkedinUrl: editForm.linkedinUrl,
        }
      : editForm;
    try {
      await api.updateLead(id, payload);
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
    // Email / LinkedIn entries can stand on their event + content, so give
    // them a sensible default summary when the rep leaves it blank. Call /
    // Meeting / Note still need a typed summary.
    let summary = (newActivity.summary || '').trim();
    if (!summary) {
      if (newActivity.activityType === 'Email') summary = `Email: ${newActivity.emailEvent}`;
      else if (newActivity.activityType === 'LinkedIn') summary = `LinkedIn: ${newActivity.linkedinEvent}`;
      else return;
    }
    // For an unanswered call, default the attempt to the suggested next level
    // if the rep didn't pick one explicitly.
    const dnpAttempt =
      newActivity.activityType === 'Call' && newActivity.callOutcome === 'DNP'
        ? Number(newActivity.dnpAttempt) || suggestedDnp
        : undefined;
    try {
      await api.createActivity({ ...newActivity, summary, dnpAttempt, leadId: id });
      setNewActivity(emptyActivity);
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
      {lead.fields['Next Contact Date'] && (
        <span className="badge-nextcontact" style={{ marginLeft: '0.5rem' }}>
          Next contact: {lead.fields['Next Contact Date']}
        </span>
      )}
      {lead.fields['LinkedIn URL'] && (
        <a href={lead.fields['LinkedIn URL']} target="_blank" rel="noreferrer" style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>
          LinkedIn profile ↗
        </a>
      )}

      <div className="section-title">Lead Details</div>
      {!canEdit ? (
        // ---- LIMITED EDIT FORM (Team, own leads only) ----
        // Team may progress the lead through the funnel and keep contact
        // details / notes current. Company, Lead Source and Owner are shown
        // read-only - the server also blocks any attempt to change them.
        <form onSubmit={saveEdit} className="card" style={{ maxWidth: 560 }}>
          <div className="form-field">
            <label>Funnel Stage</label>
            <select value={editForm.funnelStage} onChange={(e) => setEditForm({ ...editForm, funnelStage: e.target.value })}>
              {FUNNEL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="muted">Move the lead as it progresses. "Nurture" only tags the record - the CRM sends no emails.</p>
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
            <label>Notes</label>
            <textarea rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Next contact date</label>
            <input type="date" value={editForm.nextContactDate} onChange={(e) => setEditForm({ ...editForm, nextContactDate: e.target.value })} />
            <p className="muted">Set this when the lead asks you to call/contact them on a certain day - it shows up in "Today" when due.</p>
          </div>
          <div className="form-field">
            <label>Next contact note</label>
            <input value={editForm.nextContactNote} placeholder="e.g. asked to call back re pricing" onChange={(e) => setEditForm({ ...editForm, nextContactNote: e.target.value })} />
          </div>
          <div className="form-field">
            <label>LinkedIn URL</label>
            <input value={editForm.linkedinUrl} placeholder="https://www.linkedin.com/in/..." onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })} />
          </div>
          <div className="card" style={{ background: 'var(--pn-bg, #f7f7f8)', marginBottom: '1rem' }}>
            <p><strong>Company:</strong> {companyName || '-'}</p>
            <p><strong>Lead Source:</strong> {lead.fields['Lead Source'] || '-'}</p>
            <p style={{ margin: 0 }}><strong>Owner:</strong> {lead.fields['Owner'] || '-'}</p>
          </div>
          <button type="submit">Save Changes</button>
        </form>
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
            <label>Lead Owner (reassign)</label>
            <select value={editForm.owner} onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })}>
              {/* Keep the current owner selectable even if not in the roster. */}
              {editForm.owner && !members.some((m) => m.email === editForm.owner) && (
                <option value={editForm.owner}>{editForm.owner}</option>
              )}
              {members.map((m) => (
                <option key={m.email} value={m.email}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Lost Reason</label>
            <input value={editForm.lostReason} onChange={(e) => setEditForm({ ...editForm, lostReason: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Notes</label>
            <textarea rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Next contact date</label>
            <input type="date" value={editForm.nextContactDate} onChange={(e) => setEditForm({ ...editForm, nextContactDate: e.target.value })} />
            <p className="muted">Shows in "Today" when due (e.g. a requested callback).</p>
          </div>
          <div className="form-field">
            <label>Next contact note</label>
            <input value={editForm.nextContactNote} placeholder="e.g. asked to call back re pricing" onChange={(e) => setEditForm({ ...editForm, nextContactNote: e.target.value })} />
          </div>
          <div className="form-field">
            <label>LinkedIn URL</label>
            <input value={editForm.linkedinUrl} placeholder="https://www.linkedin.com/in/..." onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })} />
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
        {activities.map((a) => {
          const tags = [];
          if (a.fields['Call Outcome']) {
            const co = a.fields['Call Outcome'];
            tags.push(co === 'DNP' && a.fields['DNP Attempt'] ? `DNP ${a.fields['DNP Attempt']}` : co);
          }
          if (a.fields['Email Event']) tags.push(a.fields['Email Event']);
          if (a.fields['LinkedIn Event']) tags.push(a.fields['LinkedIn Event']);
          if (a.fields['Is Follow-Up']) tags.push('Follow-up');
          const isReply = a.fields['Email Event'] === 'Replied' || a.fields['LinkedIn Event'] === 'Replied';
          const content = a.fields['Message Content'];
          return (
            <div key={a.id} style={{ marginBottom: '0.5rem', borderBottom: '1px solid var(--pn-border)', paddingBottom: '0.5rem' }}>
              <strong>[{a.fields['Activity Type']}]</strong> {a.fields['Summary']}
              {tags.map((t) => <span key={t} className="activity-tag">{t}</span>)}
              {content && (
                <div
                  style={{
                    marginTop: '0.35rem', padding: '0.4rem 0.6rem',
                    background: 'var(--pn-bg-alt)', borderRadius: 'var(--pn-radius)',
                    borderLeft: `3px solid ${isReply ? 'var(--pn-success)' : 'var(--pn-border)'}`,
                    whiteSpace: 'pre-wrap', fontSize: '0.88rem',
                  }}
                >
                  {isReply ? <strong>Reply: </strong> : null}{content}
                </div>
              )}
              <div className="muted">{a.fields['Logged By']} - {a.fields['Date']}</div>
            </div>
          );
        })}

        {/* Logging an activity is a create action - allowed for every role. */}
        <form onSubmit={logActivity} style={{ marginTop: '1rem' }}>
          <div className="form-field">
            <label>Log New Activity</label>
            <select value={newActivity.activityType} onChange={(e) => setNewActivity({ ...newActivity, activityType: e.target.value })}>
              {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Call-specific: outcome (Connected / DNP). */}
          {newActivity.activityType === 'Call' && (
            <div className="form-field">
              <label>Call Outcome</label>
              <select value={newActivity.callOutcome} onChange={(e) => setNewActivity({ ...newActivity, callOutcome: e.target.value })}>
                <option value="">-- Not set --</option>
                {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o === 'DNP' ? 'DNP (did not pick up)' : o}</option>)}
              </select>
            </div>
          )}

          {/* DNP attempt (1-5): pre-filled with the suggested next level. */}
          {newActivity.activityType === 'Call' && newActivity.callOutcome === 'DNP' && (
            <div className="form-field">
              <label>DNP attempt</label>
              <select
                value={newActivity.dnpAttempt || suggestedDnp}
                onChange={(e) => setNewActivity({ ...newActivity, dnpAttempt: e.target.value })}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>DNP {n}</option>)}
              </select>
              <p className="muted">Suggested from earlier unanswered calls (resets after a Connected call). You can override it - no waiting period is enforced.</p>
            </div>
          )}

          {/* Email-specific: which event this row records. */}
          {newActivity.activityType === 'Email' && (
            <div className="form-field">
              <label>Email Event</label>
              <select value={newActivity.emailEvent} onChange={(e) => setNewActivity({ ...newActivity, emailEvent: e.target.value })}>
                {EMAIL_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
              <p className="muted">Log an open or reply as its own entry - the original "Sent" email stays as it was.</p>
            </div>
          )}

          {/* LinkedIn-specific: which outreach step this row records. */}
          {newActivity.activityType === 'LinkedIn' && (
            <div className="form-field">
              <label>LinkedIn step</label>
              <select value={newActivity.linkedinEvent} onChange={(e) => setNewActivity({ ...newActivity, linkedinEvent: e.target.value })}>
                {LINKEDIN_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
              <p className="muted">Log each step as its own entry: connection Request Sent → Accepted, then Message Sent → Read → Replied.</p>
            </div>
          )}

          {/* Message body / reply text - for the content-bearing Email & LinkedIn steps. */}
          {((newActivity.activityType === 'Email' && (newActivity.emailEvent === 'Sent' || newActivity.emailEvent === 'Replied')) ||
            (newActivity.activityType === 'LinkedIn' && (newActivity.linkedinEvent === 'Message Sent' || newActivity.linkedinEvent === 'Replied'))) && (
            <div className="form-field">
              <label>
                {(newActivity.emailEvent === 'Replied' || newActivity.linkedinEvent === 'Replied')
                  ? 'Reply received (paste it here)'
                  : 'Message content'}
              </label>
              <textarea
                rows={4}
                placeholder={(newActivity.emailEvent === 'Replied' || newActivity.linkedinEvent === 'Replied')
                  ? "What did they say?"
                  : "Paste the message you sent"}
                value={newActivity.messageContent}
                onChange={(e) => setNewActivity({ ...newActivity, messageContent: e.target.value })}
              />
            </div>
          )}

          {/* Follow-up flag applies to Calls, Emails and LinkedIn messages. */}
          {(newActivity.activityType === 'Call' || newActivity.activityType === 'Email' || newActivity.activityType === 'LinkedIn') && (
            <div className="form-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={newActivity.isFollowUp}
                  onChange={(e) => setNewActivity({ ...newActivity, isFollowUp: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                This is a follow-up {newActivity.activityType === 'Call' ? 'call' : newActivity.activityType === 'Email' ? 'email' : 'message'}
              </label>
            </div>
          )}

          <div className="form-field">
            <textarea
              rows={2}
              placeholder={(newActivity.activityType === 'Email' || newActivity.activityType === 'LinkedIn')
                ? "Summary (optional - a default is used if blank)"
                : "What happened?"}
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
