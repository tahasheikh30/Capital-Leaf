// The currencies the account can use. Keep in step with CURRENCIES in the backend.
export const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR", "INR", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

let current = "PKR";

// The currency money() uses when none is passed. Set once the profile has loaded.
export function setDefaultCurrency(code: string | null | undefined) {
  current = code && (CURRENCIES as readonly string[]).includes(code) ? code : "PKR";
}
export const getDefaultCurrency = () => current;

// A short symbol for input prefixes: "Rs" for rupees, otherwise the narrow symbol or the code.
export function currencySymbol(code: string = current) {
  if (code === "PKR") return "Rs";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

// Tells the app the account currency changed so every amount on screen redraws.
export const CURRENCY_EVENT = "coinleaf:currency";
export function announceCurrency(code: string) {
  setDefaultCurrency(code);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: code }));
}
