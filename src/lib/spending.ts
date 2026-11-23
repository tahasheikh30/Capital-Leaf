// Told whenever spending may have changed, so category limits can be checked right away.
export const SPENDING_EVENT = "coinleaf:spending";

export function announceSpending() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SPENDING_EVENT));
}
