// src/components/TeamLockdown.jsx
//
// CORE PRINCIPLE #2 ENFORCEMENT (frontend UX deterrent):
// Team members must not be able to casually copy/paste or export CRM data.
// This component, mounted once near the app root, does two things when the
// logged-in user's role is "team":
//   1. Adds the `pn-team-lockdown` class to the document body, which applies
//      `user-select: none` (see styles.css) so text can't be drag-selected.
//   2. Attaches document-level listeners that call preventDefault() on
//      `copy`, `cut`, and `contextmenu` (right-click menu) events.
//
// IMPORTANT / HONEST DISCLAIMER: this is a UX deterrent only. It is trivially
// bypassable by a determined user via browser devtools (disabling JS,
// editing the DOM, or using the browser's console to read data directly).
// It does NOT protect against screenshots. The real security boundary - the
// thing that actually can't be bypassed by a browser trick - is the
// server-side role check in netlify/functions/leads-update.js,
// leads-delete.js, deals-update.js, etc., which reject the "team" role with
// an HTTP 403 no matter what the browser sends.

import { useEffect } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function TeamLockdown() {
  const { isTeam } = useAuth();

  useEffect(() => {
    if (!isTeam) return undefined; // admins/superadmins: no lockdown, no listeners

    const block = (e) => e.preventDefault();

    document.body.classList.add('pn-team-lockdown');
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);

    return () => {
      document.body.classList.remove('pn-team-lockdown');
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
    };
  }, [isTeam]);

  return null; // renders nothing - side-effect-only component
}
