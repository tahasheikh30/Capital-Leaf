// CoinLeaf service worker. It makes the app installable, shows an offline page (where entries can still be noted
// down), and feeds the optional Windows widget. It caches no pages and no financial data of its own:
// the only thing kept for the widget is its read-only token, in a cache the person can remove by turning the widget off.
const CACHE = "coinleaf-shell-v3";
const SHELL = ["/offline.html", "/offline.css", "/offline.js", "/icons/icon-192.png"];
const WIDGET_CACHE = "coinleaf-widget";
const WIDGET_CONFIG = "/__widget-config";
const WIDGET_TAG = "left-to-spend";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== WIDGET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});

// ---- Widget (Windows widgets board in Edge; other platforms ignore these events) ----

async function widgetConfig() {
  try {
    const hit = await (await caches.open(WIDGET_CACHE)).match(WIDGET_CONFIG);
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

const formatMoney = (n, currency) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency || "PKR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
};

// What the card shows. Never throws: a widget must always have something to display.
async function widgetData() {
  const cfg = await widgetConfig();
  if (!cfg || !cfg.token) return { amount: "Not set up", tone: "Default", note: "Turn on the widget in CoinLeaf, Settings." };
  try {
    const res = await fetch(`${cfg.api}/widget/summary`, { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" });
    if (res.status === 401) return { amount: "Turned off", tone: "Default", note: "This widget was turned off in CoinLeaf Settings." };
    if (!res.ok) throw new Error(String(res.status));
    const s = await res.json();
    return {
      amount: formatMoney(s.leftToSpend, s.currency),
      tone: s.leftToSpend < 0 ? "Attention" : "Good",
      note: `Spent ${formatMoney(s.spent, s.currency)} of ${formatMoney(s.income, s.currency)} in ${s.month}`,
    };
  } catch {
    return { amount: "Offline", tone: "Default", note: "Could not refresh. It will try again soon." };
  }
}

async function updateWidget(widget) {
  if (!widget || !self.widgets) return;
  const template = await (await fetch(widget.definition.msAcTemplate)).text();
  const data = await widgetData();
  await self.widgets.updateByInstanceId(widget.instanceId, { template, data: JSON.stringify(data) });
}

async function updateAllWidgets() {
  if (!self.widgets) return;
  const list = await self.widgets.getByTag(WIDGET_TAG);
  await Promise.all((list || []).map(updateWidget));
}

self.addEventListener("widgetinstall", (event) => event.waitUntil(updateWidget(event.widget)));
self.addEventListener("widgetresume", (event) => event.waitUntil(updateWidget(event.widget)));
self.addEventListener("widgetclick", (event) => {
  if (event.action === "open") event.waitUntil(self.clients.openWindow("/dashboard"));
});
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "coinleaf-widgets") event.waitUntil(updateAllWidgets());
});
// The app tells the worker when the widget was turned on, off, or should refresh.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "widget-refresh") event.waitUntil(updateAllWidgets());
});
