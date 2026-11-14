# OWASP ZAP results (frontend)

Tool: OWASP ZAP 2.17.0, spider plus active scan on the login, signup, forgot-password, reset-password and auth callback pages,
plus a real Chromium check for Content Security Policy violations.

| Finding | Before | After |
| --- | --- | --- |
| CSP: `script-src 'unsafe-inline'` (Medium) | Present | **Fixed.** A fresh nonce per request, `'strict-dynamic'`, no inline scripts. Pages now render on every request. |
| CSP: `style-src 'unsafe-inline'` (Medium) | Present | **Fixed.** All 49 inline `style=` props moved to CSS classes. |
| Content-Type header missing (Informational) | /dashboard | Still shown. It is the empty-bodied redirect to /login for signed-out visitors. Harmless. |
| Modern Web Application, User Agent Fuzzer (Informational) | Present | Noise. |

Browser check (Chromium, production build): `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password` and a page with the dashboard's
chart types all loaded with 0 CSP violations, and the login form's JavaScript ran.

Not covered: the signed-in pages (dashboard, income, transactions, budget, stocks). ZAP needs a real Supabase session to reach them.
Scan a staging deployment with a test account: add a ZAP authentication context or paste a session cookie into a replacer rule.
The open-redirect probe on `/auth/callback` (`next=//evil.example`) redirects to `/login`, not to the other site.
