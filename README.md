# CoinLeaf (frontend)

Next.js 16 web app for the CoinLeaf personal finance tracker. It shows the screens and handles login through Supabase Auth.
All data comes from the backend API in its own repo (`spend-tracker-backend`). This app never talks to the database.

## Run locally
```
cp .env.example .env.local    # fill in the values
npm install
npm run dev                   # http://localhost:3000
```
Start the backend first (`http://localhost:4000` by default).

## Environment variables
These are public. Anyone using the site can see them, so never put a secret here.

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xvisnggmgcdctkibrmzl.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable key (starts with `sb_publishable_`). Supabase > Project Settings > API Keys. |
| `NEXT_PUBLIC_API_URL` | The Render backend address, no trailing slash. Locally `http://localhost:4000`. |

`NEXT_PUBLIC_` values are baked in when the app is built, and they also set the Content Security Policy.
After changing one on Vercel, redeploy.

## Deploy to Vercel (do the backend first)
1. Deploy the backend to Render and copy its URL.
2. Push this repo to GitHub, then Vercel > Add New > Project > pick the repo. Framework is detected as Next.js.
3. Add the three environment variables above. Set `NEXT_PUBLIC_API_URL` to the Render URL.
4. Deploy and copy your Vercel address (for example `https://your-app.vercel.app`).
5. In Render, set `FRONTEND_URL` to that exact address and redeploy the backend. Without this the browser blocks every API call (CORS).
6. In Supabase > Authentication > URL Configuration:
   - Site URL: your Vercel address
   - Redirect URLs: add `https://your-app.vercel.app/auth/callback`
   Password reset and email confirmation links fail without this.

If you add a custom domain later, repeat steps 5 and 6 with the new address. Vercel preview deployments use different
addresses and will be blocked by CORS unless you add them to `FRONTEND_URL` (comma separated).

## What is in the app
- Sign up, log in, forgot and reset password
- Dashboard with earned vs spent for 6 months, spending by category and income by source
- Income sources, categories, transactions, budget rules (percent or fixed), PSX stock holdings. Everything can be edited, not just added and deleted
- Recurring bills and income (weekly, monthly, yearly) that are added automatically when due, with pause and resume
- Export transactions to CSV or everything to JSON, change time zone, delete the account (asks for the password again)
- Net worth in one number: cash, PSX stocks, gold (live rate with your own override), savings certificates, minus debts, with a daily trend
- PSX dividends (expected and received, tax withheld, yield) and price alerts in the app and by email
- Freelancer mode: average income, safe monthly budget, cash runway and a tax jar with payments
- Households: share transactions, categories, income sources, budgets and recurring items, with a personal/household switch
- Optional AI (OpenRouter): suggested categories you approve, and plain-English questions about your money
- Light and dark theme (saved in a cookie, so there is no flash), compact or comfortable density, and an animations switch
- Notifications: a bell with a list of what happened this session, plus pop-ups you can turn off per category
- Settings: account and password, notifications, display, features (freelancer, tax %, smooth budget, AI) and data and security. Display and notification choices are saved to the account (the `profiles.preferences` column) and cached on the device
- Installable on a phone (Add to Home Screen): bottom tab bar, app icon, offline notice. The service worker caches no pages or data

## Tests

```bash
npm test                # unit and component tests (Vitest, jsdom), about 650 tests
npm run test:coverage   # the same, with a coverage report (about 99% of lines)
npm run test:e2e        # browser tests with Playwright, desktop (1440 wide) and phone (390 wide)
```

- **Unit and component tests** live in `test/unit`. They cover the formatting and API helpers, the space and preference providers, every page and shared component (loading, empty, error and populated states, forms, payloads sent to the API, household versus personal behaviour), the sign-in pages and the request proxy (redirects and the nonce based CSP).
- **Browser tests** live in `e2e`. `e2e/mock-api.mjs` is a small in-memory stand-in for the Supabase auth server and the CoinLeaf API, so no real backend or database is needed. `npm run test:e2e` builds the app against it, starts both servers and walks through every page and the main flows. Set `CHROME_PATH` to use an installed Chrome instead of the Playwright download.
- GitHub Actions runs type checking, the unit tests with coverage and the browser tests on every pull request.

## Security notes
- A Content Security Policy with a fresh nonce per request is set in `src/proxy.ts`: no inline scripts or styles are allowed,
  and the browser may only contact this site, the API and Supabase. Because of the nonce every page renders on request
  (nothing is pre-built), which is slightly slower than static pages. Do not add inline `style={{...}}` props or
  `dangerouslySetInnerHTML`, because the policy will block them. Use CSS classes in `globals.css` or `design.css` (the visual design layer, with the dark theme tokens).
- The service worker (`public/sw.js`) caches only the offline page and icon, never pages or API data. `worker-src` and `manifest-src` are limited to this site in the policy.
- Other headers (HSTS, frame blocking, nosniff, referrer and permissions policies) are in `next.config.mjs`.
- The browser holds only the Supabase login session and sends its token to the API with each request.
- `security/` has the OWASP ZAP plan and the scan results.
