import { API_URL, api } from "@/lib/api";

// The "left to spend" widget: a read-only token the person can turn off at any time. The token is kept on
// this device so the widget link can be shown again and the Windows widget can refresh itself.
export const TOKEN_KEY = "coinleaf.widgetToken";
export const WIDGET_CACHE = "coinleaf-widget";
export const WIDGET_CONFIG = "/__widget-config";

export type Glance = { month: string; currency: string; leftToSpend: number; spent: number; income: number; updated_at: string };

export const widgetLink = (origin: string, token: string) => `${origin}/glance#t=${token}`;

export const savedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

async function tellWorker() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "widget-refresh" });
    // Ask for background refreshes where the browser allows it (installed app on Edge or Chrome).
    const periodic = (reg as unknown as { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } } | undefined)?.periodicSync;
    await periodic?.register("coinleaf-widgets", { minInterval: 60 * 60 * 1000 });
  } catch {
    /* the widget just refreshes when it is next opened */
  }
}

export async function widgetEnabled(): Promise<boolean> {
  return (await api<{ enabled: boolean }>("/widget")).enabled;
}

// Creates a new token (the old one stops working) and stores it where the widget can find it.
export async function enableWidget(): Promise<string> {
  const { token } = await api<{ token: string }>("/widget/token", { method: "POST" });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* without storage the link is shown once only */
  }
  try {
    const cache = await caches.open(WIDGET_CACHE);
    await cache.put(WIDGET_CONFIG, new Response(JSON.stringify({ token, api: API_URL })));
  } catch {
    /* no cache storage here, so no Windows widget; the link still works */
  }
  void tellWorker();
  return token;
}

export async function disableWidget() {
  await api("/widget/token", { method: "DELETE" });
  try {
    localStorage.removeItem(TOKEN_KEY);
    await caches.delete(WIDGET_CACHE);
  } catch {
    /* nothing stored */
  }
  void tellWorker();
}

export async function fetchGlance(token: string): Promise<Glance> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/widget/summary`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    throw Object.assign(new Error("Cannot reach CoinLeaf. Check your connection."), { status: 0 });
  }
  if (res.status === 401) throw Object.assign(new Error("This link was turned off. Make a new one in CoinLeaf, Settings."), { status: 401 });
  if (!res.ok) throw Object.assign(new Error("Could not load your numbers. Try again in a moment."), { status: res.status });
  return res.json();
}
