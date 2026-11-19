import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { PreferencesProvider } from "@/lib/preferences";
import { SpaceProvider } from "@/lib/space";
import { ToastProvider } from "@/components/Toast";

// Everything a page expects around it: preferences, notifications and the active space.
export function AllProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider initialTheme="light" initialDensity="comfortable">
      <ToastProvider>
        <SpaceProvider>{children}</SpaceProvider>
      </ToastProvider>
    </PreferencesProvider>
  );
}

export const renderApp = (ui: ReactElement, options?: RenderOptions) => render(ui, { wrapper: AllProviders, ...options });

// A stand-in for api() that answers from a table of routes. Anything not listed answers with an empty list.
export type Routes = Record<string, unknown | ((call: { method: string; body: unknown; path: string }) => unknown)>;
export function fakeApi(routes: Routes) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const impl = async (path: string, options: { method?: string; body?: unknown } = {}) => {
    const method = options.method ?? "GET";
    calls.push({ method, path, body: options.body });
    const base = path.split("?")[0];
    const hit = routes[`${method} ${path}`] ?? routes[`${method} ${base}`] ?? (method === "GET" ? routes[path] ?? routes[base] : undefined);
    if (hit === undefined) return method === "GET" ? [] : { ok: true };
    const value = typeof hit === "function" ? (hit as (c: unknown) => unknown)({ method, body: options.body, path }) : hit;
    if (value instanceof Error) throw value;
    return value;
  };
  return { impl, calls, sent: (method: string, path: string) => calls.filter((c) => c.method === method && c.path.split("?")[0] === path) };
}

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Form fields in this app are a <label> followed by a control inside one wrapper, without a "for" link,
// so they are found by their label text. (Linking them would also help screen readers.)
const matches = (text: string, want: string | RegExp) => (typeof want === "string" ? text.trim() === want : want.test(text));
export function fields(label: string | RegExp, scope: ParentNode = document.body): HTMLElement[] {
  return [...scope.querySelectorAll("label")]
    .filter((l) => matches(l.textContent ?? "", label))
    .map((l) => (l.control ?? l.parentElement?.querySelector("input, select, textarea")) as HTMLElement)
    .filter(Boolean);
}
export function field(label: string | RegExp, scope: ParentNode = document.body): HTMLElement {
  const found = fields(label, scope);
  if (found.length === 0) throw new Error(`No field labelled ${String(label)}`);
  return found[0];
}
export async function findField(label: string | RegExp, scope: ParentNode = document.body): Promise<HTMLElement> {
  const { waitFor } = await import("@testing-library/react");
  let el!: HTMLElement;
  await waitFor(() => { el = field(label, scope); });
  return el;
}
