"use client";

import Logo from "@/components/Logo";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cleanCode, safeNext } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";

// The second step of signing in: the 6 digit code from the person's authenticator app.
export default function VerifyPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        const totp = data?.totp?.[0];
        if (totp) setFactorId(totp.id);
        else router.replace("/dashboard");
      })
      .catch(() => setError("Could not load your sign-in settings. Refresh and try again."))
      .finally(() => setReady(true));
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6 digit code");
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setError("That code did not work. Check the code and try again.");
      setCode("");
      setBusy(false);
      return;
    }
    router.push(safeNext(new URLSearchParams(window.location.search).get("next")));
    router.refresh();
  }

  async function cancel() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <Logo className="auth-logo" />
        <h1>Two-step sign-in</h1>
        <p className="muted mt-0">Open your authenticator app and enter the 6 digit code for CoinLeaf.</p>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="mfa-code">Authentication code</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(cleanCode(e.target.value))} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !ready || !factorId}>{busy ? "Checking..." : "Verify"}</button>
        <div className="auth-links">
          <button type="button" className="onboard-skip" onClick={cancel}>Use a different account</button>
        </div>
      </form>
    </div>
  );
}
