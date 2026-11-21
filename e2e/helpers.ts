import { expect, type Page } from "@playwright/test";

const b64url = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const API = "http://localhost:4010";

export const PAGES = ["dashboard", "transactions", "income", "budget", "net-worth", "goals", "debts", "stocks", "recurring", "categories", "freelancer", "household", "ask", "settings", "more", "notifications"] as const;

// Signs the browser in the way the app expects: a Supabase session in a cookie named for the project host.
export async function signIn(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "taha@example.com", app_metadata: {}, user_metadata: { full_name: "Taha" }, created_at: "2026-09-01T00:00:00Z" };
  const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: user.id, aud: "authenticated", role: "authenticated", exp })}.sig`;
  const value = "base64-" + b64url({ access_token: jwt, refresh_token: "r", expires_in: 86400, expires_at: exp, token_type: "bearer", user });
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value, domain: "localhost", path: "/" }]);
}

export async function resetBackend(page: Page) {
  const res = await page.request.post(`${API}/__reset`);
  expect(res.ok()).toBeTruthy();
}

export async function backendLog(page: Page): Promise<{ method: string; path: string; body: Record<string, unknown> }[]> {
  return (await page.request.get(`${API}/__log`)).json();
}

// Form fields are a label next to a control without a "for" link, so find them by label text.
export const field = (page: Page, label: string) => page.locator(".field", { has: page.locator("label", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).locator("input, select, textarea").first();

// Collects anything the page logs as an error or throws, so a test can assert the page was clean.
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // handled separately by response checks
    errors.push(`console: ${t}`);
  });
  return errors;
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 700;
