import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// All data goes through the backend API. The browser only holds the login session
// (Supabase Auth) and sends its access token with every request.
export async function api<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

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
    throw new ApiError("Cannot reach the server. Please try again.", 0);
  }

  if (res.status === 429) throw new ApiError("Too many requests. Please wait a moment and try again.", 429);

  if (res.status === 401) {
    await supabase.auth.signOut();
    window.location.href = "/login";
    throw new ApiError("Session expired", 401);
  }
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? "Request failed", res.status);
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
