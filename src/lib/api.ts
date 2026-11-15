import { cleanApiUrl } from "@/lib/apiUrl";
import { createClient } from "@/lib/supabase/client";

export const API_URL = cleanApiUrl(process.env.NEXT_PUBLIC_API_URL);

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Answers from recent GET requests, kept in memory only (never saved to disk, gone on reload).
// Pages show them straight away while a fresh copy loads, so moving between pages feels instant.
// Any change (POST, PATCH, DELETE) or sign out clears everything, so stale numbers never stick around.
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
let cachedUser: string | null = null;

export function peek<T>(path: string): T | undefined {
  return cache.get(path) as T | undefined;
}

export function clearApiCache() {
  cache.clear();
  inflight.clear();
}

// All data goes through the backend API. The browser only holds the login session
// (Supabase Auth) and sends its access token with every request.
export async function api<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const isGet = (options.method ?? "GET") === "GET";
  if (isGet) {
    // Two parts of a page asking for the same thing share one request.
    const pending = inflight.get(path);
    if (pending) return pending as Promise<T>;
    const p = request<T>(path, options).finally(() => inflight.delete(path));
    inflight.set(path, p);
    return p;
  }
  const result = await request<T>(path, options);
  clearApiCache();
  return result;
}

async function request<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user.id ?? null;
  if (userId !== cachedUser) {
    clearApiCache();
    cachedUser = userId;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // The server may have gone to sleep: make the next page load check it again.
    try {
      sessionStorage.removeItem("cl-server-awake");
    } catch {}
    throw new ApiError("Cannot reach the server. Please try again.", 0);
  }

  if (res.status === 429) throw new ApiError("Too many requests. Please wait a moment and try again.", 429);

  if (res.status === 401) {
    clearApiCache();
    await supabase.auth.signOut();
    window.location.href = "/login";
    throw new ApiError("Session expired", 401);
  }
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? "Request failed", res.status);
  if ((options.method ?? "GET") === "GET") cache.set(path, json);
  return json as T;
}

// Downloads a file from the API (CSV or JSON export) using the signed-in session.
export async function downloadFile(path: string, filename: string) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Please try again.", 0);
  }
  if (res.status === 429) throw new ApiError("Too many exports. Please wait a minute and try again.", 429);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json.error ?? "Export failed", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
