"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { readLock, removeLock, tryPin, unlockWithBiometric } from "@/lib/applock";
import { createClient } from "@/lib/supabase/client";

export const LOCK_CHANGED = "coinleaf:lock-changed";
export const LOCK_NOW = "coinleaf:lock-now";

// Covers the app with a PIN screen when the person has turned the lock on: when the app opens, and again
// when it has been in the background longer than their chosen time.
export default function AppLock({ userId }: { userId: string }) {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const sync = useCallback(() => {
    const s = readLock(userId);
    setHasBiometric(!!s?.credentialId);
    return s;
  }, [userId]);

  // Decide before the first paint so a locked app does not flash its contents.
  useLayoutEffect(() => {
    if (sync()) setLocked(true);
  }, [sync]);

  useEffect(() => {
    const onVisibility = () => {
      const s = readLock(userId);
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (s && hiddenAt.current !== null && (Date.now() - hiddenAt.current) / 1000 >= s.autoLockSeconds) setLocked(true);
      if (document.visibilityState === "visible") hiddenAt.current = null;
    };
    const onChanged = () => {
      const s = sync();
      if (!s) setLocked(false);
    };
    const onLockNow = () => {
      if (sync()) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(LOCK_CHANGED, onChanged);
    window.addEventListener(LOCK_NOW, onLockNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(LOCK_CHANGED, onChanged);
      window.removeEventListener(LOCK_NOW, onLockNow);
    };
  }, [userId, sync]);

  // While locked, nothing behind the screen can be reached by keyboard or screen reader.
  useEffect(() => {
    const shell = document.querySelector(".shell");
    if (locked) {
      shell?.setAttribute("inert", "");
      input.current?.focus();
    } else shell?.removeAttribute("inert");
    return () => shell?.removeAttribute("inert");
  }, [locked]);

  async function signOut() {
    removeLock(userId);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    const result = await tryPin(userId, pin);
    setBusy(false);
    setPin("");
    if (result.ok) {
      setMessage("");
      return setLocked(false);
    }
    if (result.reason === "too-many") {
      setMessage("Too many wrong PINs. Signing you out.");
      return void signOut();
    }
    if (result.reason === "cooldown") return setMessage(`Too many tries. Wait ${result.waitSeconds} seconds.`);
    setMessage(`That PIN is not right. ${result.remaining} tries left${result.waitSeconds ? `, and you must wait ${result.waitSeconds} seconds` : ""}.`);
  }

  async function biometric() {
    setMessage("");
    if (await unlockWithBiometric(userId)) setLocked(false);
    else setMessage("Could not unlock with your fingerprint or face. Use your PIN.");
  }

  if (!locked) return null;
  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="CoinLeaf is locked">
      <form className="lock-card" onSubmit={submit}>
        <Logo className="auth-logo" />
        <h1>Enter your PIN</h1>
        {message && <div className="error" role="alert">{message}</div>}
        <div className="field">
          <label htmlFor="lock-pin">PIN</label>
          <input id="lock-pin" ref={input} type="password" inputMode="numeric" autoComplete="off" maxLength={8} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || pin.length < 4}>Unlock</button>
        {hasBiometric && (
          <button type="button" className="btn btn-block" onClick={biometric}>Use fingerprint or face</button>
        )}
        <button type="button" className="onboard-skip" onClick={signOut}>Forgot your PIN? Sign out</button>
      </form>
    </div>
  );
}
