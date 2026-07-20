// src/components/RoleGate.jsx
//
// Conditionally renders children only if the current user's role is in
// `allow`. Used throughout the app to hide edit/delete/export/user-mgmt
// controls from roles that shouldn't see them (e.g. Team never sees an
// "Export CSV" button - it isn't just CSS-hidden, it's never rendered).
//
// NOTE: this only controls what renders in the browser. The actual
// authorization boundary is server-side in netlify/functions - see
// netlify/functions/utils/auth.js's requireRole().

import { useAuth } from '../AuthContext.jsx';

export default function RoleGate({ allow, children }) {
  const { role } = useAuth();
  if (!role || !allow.includes(role)) return null;
  return children;
}
