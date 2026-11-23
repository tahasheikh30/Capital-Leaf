import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/Toast";

const s = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
  signOut: vi.fn(async () => ({})), oauth: vi.fn(), session: vi.fn(),
  list: vi.fn(), enroll: vi.fn(), verify: vi.fn(), unenroll: vi.fn(), aal: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: s.push, replace: s.replace, refresh: s.refresh }), usePathname: () => "/settings" }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: s.signOut, signInWithOAuth: s.oauth, getSession: s.session,
      mfa: { listFactors: s.list, enroll: s.enroll, challengeAndVerify: s.verify, unenroll: s.unenroll, getAuthenticatorAssuranceLevel: s.aal },
    },
  }),
}));

import AppLock, { LOCK_CHANGED, LOCK_NOW } from "@/components/AppLock";
import GoogleButton from "@/components/GoogleButton";
import AppLockSettings from "@/components/settings/AppLockSettings";
import TwoFactor from "@/components/settings/TwoFactor";
import VerifyPage from "@/app/verify/page";
import { readLock, setPin } from "@/lib/applock";
import { cleanCode, needsSecondStep, safeNext } from "@/lib/mfa";

const U = "user-1";
beforeEach(() => {
  localStorage.clear();
  for (const f of Object.values(s)) f.mockReset();
  s.signOut.mockResolvedValue({});
  s.session.mockResolvedValue({ data: { session: { user: { id: U, email: "a@b.co" } } } });
  window.history.replaceState(null, "", "/");
});
const withToasts = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe("mfa helpers", () => {
  it("needs the second step only when the account asks for it and the session has not done it", async () => {
    const auth = { mfa: { getAuthenticatorAssuranceLevel: s.aal } } as never;
    s.aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" } });
    expect(await needsSecondStep(auth)).toBe(true);
    s.aal.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" } });
    expect(await needsSecondStep(auth)).toBe(false);
    s.aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" } });
    expect(await needsSecondStep(auth)).toBe(false);
    s.aal.mockRejectedValue(new Error("down"));
    expect(await needsSecondStep(auth)).toBe(false);
    expect(await needsSecondStep({} as never)).toBe(false);
  });
  it("only follows paths inside the app and cleans codes", () => {
    expect(safeNext("/budget")).toBe("/budget");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext(null, "/x")).toBe("/x");
    expect(cleanCode("123 456 789")).toBe("123456");
    expect(cleanCode("ab1c2")).toBe("12");
  });
});

describe("Google button", () => {
  it("starts Google sign-in and comes back through the callback", async () => {
    window.history.replaceState(null, "", "/login?next=/budget");
    s.oauth.mockResolvedValue({ error: null });
    render(<GoogleButton />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(s.oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=%2Fbudget` } });
  });
  it("shows why it could not start", async () => {
    s.oauth.mockResolvedValue({ error: { message: "Unsupported provider: provider is not enabled" } });
    render(<GoogleButton />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("provider is not enabled");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
});

describe("verify page", () => {
  const factors = { data: { totp: [{ id: "f1" }], all: [] } };
  it("checks the code and continues to where the person was going", async () => {
    window.history.replaceState(null, "", "/verify?next=/budget");
    s.list.mockResolvedValue(factors);
    s.verify.mockResolvedValue({ error: null });
    render(<VerifyPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    await userEvent.type(screen.getByLabelText("Authentication code"), "123 456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(s.verify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/budget"));
  });
  it("rejects a short code without asking the server", async () => {
    s.list.mockResolvedValue(factors);
    render(<VerifyPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    await userEvent.type(screen.getByLabelText("Authentication code"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6 digit code");
    expect(s.verify).not.toHaveBeenCalled();
  });
  it("clears a wrong code and lets the person try again", async () => {
    s.list.mockResolvedValue(factors);
    s.verify.mockResolvedValue({ error: { message: "Invalid TOTP code" } });
    render(<VerifyPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled());
    await userEvent.type(screen.getByLabelText("Authentication code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("did not work");
    expect(screen.getByLabelText("Authentication code")).toHaveValue("");
    expect(s.push).not.toHaveBeenCalled();
  });
  it("goes on to the app when there is nothing to verify", async () => {
    s.list.mockResolvedValue({ data: { totp: [], all: [] } });
    render(<VerifyPage />);
    await waitFor(() => expect(s.replace).toHaveBeenCalledWith("/dashboard"));
  });
  it("can sign out instead", async () => {
    s.list.mockResolvedValue(factors);
    render(<VerifyPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Use a different account" }));
    await waitFor(() => expect(s.push).toHaveBeenCalledWith("/login"));
    expect(s.signOut).toHaveBeenCalled();
  });
  it("reports a failure to load", async () => {
    s.list.mockRejectedValue(new Error("down"));
    render(<VerifyPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  });
});

describe("two-step settings", () => {
  it("sets up an authenticator app and turns it on", async () => {
    s.list.mockResolvedValue({ data: { totp: [], all: [{ id: "old", factor_type: "totp", status: "unverified" }] } });
    s.unenroll.mockResolvedValue({ error: null });
    s.enroll.mockResolvedValue({ data: { id: "f9", totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "ABCDEF" } }, error: null });
    s.verify.mockResolvedValue({ error: null });
    withToasts(<TwoFactor />);
    await userEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    expect(s.unenroll).toHaveBeenCalledWith({ factorId: "old" });
    expect(await screen.findByAltText("QR code for your authenticator app")).toBeInTheDocument();
    expect(screen.getByText("ABCDEF")).toBeInTheDocument();
    s.list.mockResolvedValue({ data: { totp: [{ id: "f9" }], all: [] } });
    await userEvent.type(screen.getByLabelText("Code from your app"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(s.verify).toHaveBeenCalledWith({ factorId: "f9", code: "654321" });
    expect(await screen.findByText("On")).toBeInTheDocument();
  });
  it("checks the code and can be cancelled", async () => {
    s.list.mockResolvedValue({ data: { totp: [], all: [] } });
    s.enroll.mockResolvedValue({ data: { id: "f9", totp: { qr_code: "x", secret: "S" } }, error: null });
    s.verify.mockResolvedValue({ error: { message: "bad" } });
    s.unenroll.mockResolvedValue({ error: null });
    withToasts(<TwoFactor />);
    await userEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6 digit code");
    await userEvent.type(screen.getByLabelText("Code from your app"), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("did not work");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(s.unenroll).toHaveBeenCalledWith({ factorId: "f9" });
    expect(await screen.findByRole("button", { name: "Set up two-step sign-in" })).toBeInTheDocument();
  });
  it("shows setup errors", async () => {
    s.list.mockResolvedValue({ data: { totp: [], all: [] } });
    s.enroll.mockResolvedValue({ data: null, error: { message: "MFA enroll is disabled" } });
    withToasts(<TwoFactor />);
    await userEvent.click(await screen.findByRole("button", { name: "Set up two-step sign-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MFA enroll is disabled");
  });
  it("turns it off after confirming", async () => {
    s.list.mockResolvedValue({ data: { totp: [{ id: "f1" }], all: [] } });
    s.unenroll.mockResolvedValue({ error: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    withToasts(<TwoFactor />);
    const off = await screen.findByRole("button", { name: "Turn off" });
    await userEvent.click(off);
    expect(s.unenroll).not.toHaveBeenCalled();
    await userEvent.click(off);
    expect(s.unenroll).toHaveBeenCalledWith({ factorId: "f1" });
    expect(await screen.findByRole("button", { name: "Set up two-step sign-in" })).toBeInTheDocument();
    confirm.mockRestore();
  });
  it("shows when it cannot load", async () => {
    s.list.mockRejectedValue(new Error("down"));
    withToasts(<TwoFactor />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  });
});

describe("app lock screen", () => {
  it("does nothing when there is no lock", () => {
    render(<AppLock userId={U} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("starts locked and opens with the right PIN", async () => {
    await setPin(U, "4827");
    render(<AppLock userId={U} />);
    expect(screen.getByRole("dialog", { name: "CoinLeaf is locked" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("PIN"), "4827");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("counts wrong tries and keeps the screen locked", async () => {
    await setPin(U, "4827");
    render(<AppLock userId={U} />);
    await userEvent.type(screen.getByLabelText("PIN"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("9 tries left");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toHaveValue("");
  });
  it("keeps the unlock button off until the PIN is long enough and ignores letters", async () => {
    await setPin(U, "4827");
    render(<AppLock userId={U} />);
    await userEvent.type(screen.getByLabelText("PIN"), "ab12");
    expect(screen.getByLabelText("PIN")).toHaveValue("12");
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });
  it("signs out after too many wrong PINs", async () => {
    await setPin(U, "4827");
    const stored = readLock(U)!;
    localStorage.setItem(`coinleaf.lock.${U}`, JSON.stringify({ ...stored, failures: 9 }));
    render(<AppLock userId={U} />);
    await userEvent.type(screen.getByLabelText("PIN"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(s.signOut).toHaveBeenCalled());
    expect(s.push).toHaveBeenCalledWith("/login");
    expect(readLock(U)).toBeNull();
  });
  it("lets someone who forgot the PIN sign out, which removes the lock", async () => {
    await setPin(U, "4827");
    render(<AppLock userId={U} />);
    await userEvent.click(screen.getByRole("button", { name: /Forgot your PIN/ }));
    await waitFor(() => expect(s.signOut).toHaveBeenCalled());
    expect(readLock(U)).toBeNull();
  });
  it("locks again after the app was away longer than the chosen time", async () => {
    await setPin(U, "4827");
    render(<AppLock userId={U} />);
    await userEvent.type(screen.getByLabelText("PIN"), "4827");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const vis = (state: string) => { Object.defineProperty(document, "visibilityState", { value: state, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); };
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    act(() => vis("hidden"));
    now.mockReturnValue(1_000 + 30_000);
    act(() => vis("visible"));
    expect(screen.queryByRole("dialog")).toBeNull();
    now.mockReturnValue(100_000);
    act(() => vis("hidden"));
    now.mockReturnValue(100_000 + 61_000);
    act(() => vis("visible"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    now.mockRestore();
  });
  it("locks on request and unlocks when the lock is removed", async () => {
    await setPin(U, "4827");
    render(<AppLock userId={U} />);
    await userEvent.type(screen.getByLabelText("PIN"), "4827");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    act(() => { window.dispatchEvent(new Event(LOCK_NOW)); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    localStorage.clear();
    act(() => { window.dispatchEvent(new Event(LOCK_CHANGED)); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("offers fingerprint unlock when it is set up", async () => {
    await setPin(U, "4827");
    const stored = readLock(U)!;
    localStorage.setItem(`coinleaf.lock.${U}`, JSON.stringify({ ...stored, credentialId: "AQID" }));
    const get = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "x" });
    Object.defineProperty(navigator, "credentials", { value: { get }, configurable: true });
    render(<AppLock userId={U} />);
    await userEvent.click(screen.getByRole("button", { name: "Use fingerprint or face" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use your PIN");
    await userEvent.click(screen.getByRole("button", { name: "Use fingerprint or face" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("makes the page behind it inert while locked", async () => {
    document.body.innerHTML = '<div class="shell"></div><div id="r"></div>';
    await setPin(U, "4827");
    render(<AppLock userId={U} />, { container: document.getElementById("r")! });
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    document.body.innerHTML = "";
  });
});

describe("app lock settings", () => {
  it("turns the lock on with a matching PIN", async () => {
    withToasts(<AppLockSettings />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn on app lock" })).toBeEnabled());
    await userEvent.type(screen.getByLabelText(/Choose a PIN/), "12");
    await userEvent.type(screen.getByLabelText("Repeat the PIN"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Turn on app lock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("4 to 8 digits");
    await userEvent.clear(screen.getByLabelText(/Choose a PIN/));
    await userEvent.type(screen.getByLabelText(/Choose a PIN/), "4827");
    await userEvent.clear(screen.getByLabelText("Repeat the PIN"));
    await userEvent.type(screen.getByLabelText("Repeat the PIN"), "4820");
    await userEvent.click(screen.getByRole("button", { name: "Turn on app lock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    await userEvent.clear(screen.getByLabelText("Repeat the PIN"));
    await userEvent.type(screen.getByLabelText("Repeat the PIN"), "4827");
    await userEvent.click(screen.getByRole("button", { name: "Turn on app lock" }));
    expect(await screen.findByText("App lock is on")).toBeInTheDocument();
    expect(readLock(U)).not.toBeNull();
    expect(screen.getByLabelText("Lock the app")).toHaveValue("60");
  });
  it("changes the time, the PIN, locks now and turns off", async () => {
    await setPin(U, "4827");
    const locked = vi.fn();
    window.addEventListener(LOCK_NOW, locked);
    withToasts(<AppLockSettings />);
    await userEvent.selectOptions(await screen.findByLabelText("Lock the app"), "300");
    expect(readLock(U)!.autoLockSeconds).toBe(300);
    await userEvent.click(screen.getByRole("button", { name: "Lock now" }));
    expect(locked).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Change PIN" }));
    await userEvent.type(screen.getByLabelText("New PIN"), "9999");
    await userEvent.type(screen.getByLabelText("Repeat the PIN"), "9999");
    await userEvent.click(screen.getByRole("button", { name: "Save new PIN" }));
    expect(await screen.findByText("PIN changed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn off app lock" }));
    expect(readLock(U)).toBeNull();
    expect(await screen.findByRole("button", { name: "Turn on app lock" })).toBeInTheDocument();
    window.removeEventListener(LOCK_NOW, locked);
  });
  it("offers fingerprint or face only where the device supports it", async () => {
    await setPin(U, "4827");
    Object.defineProperty(window, "PublicKeyCredential", { value: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true }, configurable: true });
    Object.defineProperty(navigator, "credentials", { value: { create: vi.fn().mockResolvedValue({ rawId: new Uint8Array([1]).buffer }) }, configurable: true });
    withToasts(<AppLockSettings />);
    await userEvent.click(await screen.findByRole("button", { name: "Use fingerprint or face" }));
    expect(await screen.findByText("Fingerprint and face unlock is on")).toBeInTheDocument();
    expect(readLock(U)!.credentialId).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Turn off fingerprint or face" }));
    expect(readLock(U)!.credentialId).toBeUndefined();
    Object.defineProperty(window, "PublicKeyCredential", { value: undefined, configurable: true });
  });
  it("hides the fingerprint option when unsupported", async () => {
    await setPin(U, "4827");
    withToasts(<AppLockSettings />);
    await screen.findByLabelText("Lock the app");
    expect(screen.queryByRole("button", { name: /fingerprint/ })).toBeNull();
  });
});


