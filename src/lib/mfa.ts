import type { SupabaseClient } from "@supabase/supabase-js";

// True when the account has two-step sign-in on and this session has not passed the second step yet.
// A server or client that cannot answer counts as "no", so a hiccup never locks anyone out of the app.
export async function needsSecondStep(auth: SupabaseClient["auth"]): Promise<boolean> {
  try {
    const { data } = await auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

// Only ever go to a page inside this app.
export function safeNext(raw: string | null | undefined, fallback = "/dashboard") {
  return raw && /^\/[a-z]/i.test(raw) && !raw.startsWith("//") ? raw : fallback;
}

// People type codes with spaces ("123 456"); the service wants six plain digits.
export const cleanCode = (s: string) => s.replace(/\D/g, "").slice(0, 6);
