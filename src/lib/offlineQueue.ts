import { api } from "@/lib/api";

// Errors from api() carry the HTTP status; 0 means the server could not be reached at all.
const isNetworkError = (err: unknown) => (err as { status?: unknown })?.status === 0;
const statusOf = (err: unknown) => (typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 0);

// Transactions added while offline wait here, on this device, until the connection is back.
// Each one carries its own id, and the server treats a repeated id as "already saved", so a request
// that got through just before the connection dropped is never added twice.
export type Queued = { id: string; body: Record<string, unknown>; space: string; createdAt: number; error?: string };

export const QUEUE_EVENT = "coinleaf:queue";
const LAST_USER = "coinleaf.lastUser";
const key = (userId: string) => `coinleaf.queue.${userId}`;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));

export function rememberUser(userId: string) {
  try {
    localStorage.setItem(LAST_USER, userId);
  } catch {
    /* storage can be blocked */
  }
}

export function readQueue(userId: string): Queued[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(userId: string, items: Queued[]) {
  try {
    if (items.length) localStorage.setItem(key(userId), JSON.stringify(items));
    else localStorage.removeItem(key(userId));
  } catch {
    throw new Error("This device cannot keep the entry. Try again when you are online.");
  }
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function enqueue(userId: string, body: Record<string, unknown>, space: string, id: string) {
  write(userId, [...readQueue(userId), { id, body, space, createdAt: Date.now() }]);
}

export function discard(userId: string, id: string) {
  write(userId, readQueue(userId).filter((q) => q.id !== id));
}

// Saves a new transaction, or keeps it for later when the server cannot be reached.
export async function addOrQueue<T>(userId: string, body: Record<string, unknown>, space: string): Promise<{ queued: true } | { queued: false; saved: T }> {
  const id = newId();
  const payload = { ...body, id };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(userId, body, space, id);
    return { queued: true };
  }
  try {
    return { queued: false, saved: await api<T>("/transactions", { method: "POST", body: payload, space }) };
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue(userId, body, space, id);
      return { queued: true };
    }
    throw err;
  }
}

let flushing = false;

// Sends what is waiting, oldest first. Stops at the first sign the connection or server is not ready.
// An entry the server refuses (for example its category was deleted) stays in the list with the reason, so nothing vanishes silently.
export async function flushQueue(userId: string): Promise<{ sent: number; failed: number; left: number }> {
  if (flushing) return { sent: 0, failed: 0, left: readQueue(userId).length };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const item of readQueue(userId)) {
      if (item.error) continue;
      try {
        await api("/transactions", { method: "POST", body: { ...item.body, id: item.id }, space: item.space, quiet: true });
        write(userId, readQueue(userId).filter((q) => q.id !== item.id));
        sent++;
      } catch (err) {
        const status = statusOf(err);
        if (status >= 400 && status < 500 && status !== 429 && status !== 401) {
          failed++;
          write(userId, readQueue(userId).map((q) => (q.id === item.id ? { ...q, error: (err as Error).message } : q)));
          continue;
        }
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed, left: readQueue(userId).filter((q) => !q.error).length };
}
