"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { SettingGroup } from "@/components/settings/controls";
import { cleanCode } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";

type Enrolling = { id: string; qr: string; secret: string };

// Two-step sign-in with an authenticator app (Google Authenticator, Authy, 1Password and so on).
export default function TwoFactor() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await createClient().auth.mfa.listFactors();
      if (error) throw error;
      setFactorId(data?.totp?.[0]?.id ?? null);
    } catch {
      setError("Could not load your two-step sign-in settings");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function start() {
    setBusy(true);
    setError("");
    const auth = createClient().auth;
    try {
      // A setup that was never finished would block a new one, so clear those first.
      const { data: list } = await auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await auth.mfa.enroll({ factorType: "totp", friendlyName: "CoinLeaf" });
      if (error || !data) throw error ?? new Error("Could not start setup");
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    if (code.length !== 6) return setError("Enter the 6 digit code from your app");
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enrolling.id, code });
    setBusy(false);
    if (error) return setError("That code did not work. Check the code and try again.");
    setEnrolling(null);
    setCode("");
    await refresh();
    toast.success("Two-step sign-in is on");
  }

  async function cancel() {
    if (enrolling) await createClient().auth.mfa.unenroll({ factorId: enrolling.id }).catch(() => {});
    setEnrolling(null);
    setError("");
  }

  async function turnOff() {
    if (!factorId || !window.confirm("Turn off two-step sign-in? Your account will be protected by your password only.")) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return setError(error.message);
    setFactorId(null);
    toast.success("Two-step sign-in is off");
  }

  return (
    <SettingGroup title="Two-step sign-in" hint="Ask for a 6 digit code from an authenticator app each time you log in, so a stolen password is not enough.">
      {error && <div className="error" role="alert">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : enrolling ? (
        <form onSubmit={confirm} className="setting-form">
          <p className="mt-0">Scan this with your authenticator app, then enter the code it shows.</p>
          {/* The QR code comes from our own auth service as an inline image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mfa-qr" src={enrolling.qr} alt="QR code for your authenticator app" width={180} height={180} />
          <p className="muted small">Cannot scan it? Enter this key instead: <code className="mfa-secret">{enrolling.secret}</code></p>
          <div className="field">
            <label htmlFor="mfa-setup-code">Code from your app</label>
            <input id="mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} />
          </div>
          <div className="flex-gap wrap">
            <button className="btn btn-primary" disabled={busy}>Turn on</button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>Cancel</button>
          </div>
        </form>
      ) : factorId ? (
        <div className="flex-gap wrap">
          <span className="chip-on">On</span>
          <button className="btn btn-ghost" onClick={turnOff} disabled={busy}>Turn off</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={start} disabled={busy}>Set up two-step sign-in</button>
      )}
    </SettingGroup>
  );
}
