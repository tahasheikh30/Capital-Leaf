import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

let originalMatchMedia: typeof window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.useRealTimers();
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  document.cookie.split(";").forEach((c) => (document.cookie = c.replace(/=.*/, "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/")));
  document.body.className = "";
});

// jsdom has no layout engine, so these browser features are stood in for.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
originalMatchMedia = window.matchMedia;
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
Element.prototype.scrollIntoView = vi.fn();
