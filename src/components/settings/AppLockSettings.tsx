"use client";

import { useEffect, useState } from "react";
import { LOCK_CHANGED, LOCK_NOW } from "@/components/AppLock";
import { useToast } from "@/components/Toast";
import { SettingGroup } from "@/components/settings/controls";
import {
  AUTO_LOCK_CHOICES, biometricsSupported, enrollBiometric, readLock, removeBiometric, removeLock, setAutoLock, setPin, validPin,
} from "@/lib/applock";
import { createClient } from "@/lib/supabase/client";

// Turn the PIN lock on or off for this device, and choose fingerprint or face unlock.
export default function AppLockSettings() {
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [bio, setBio] = useState(false);
  const [canBio, setCanBio] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [pin, setPinValue] = useState("");
  const [again, setAgain] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user;
        if (!u) return;
        setUserId(u.id);
        setEmail(u.email ?? "");
        const s = readLock(u.id);
        setEnabled(!!s);
        setBio(!!s?.credentialId);
        setSeconds(s?.autoLockSeconds ?? 60);
      });
    biometricsSupported().then(setCanBio);
  }, []);

  const announce = () => window.dispatchEvent(new Event(LOCK_CHANGED));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validPin(pin)) return setError("Use 4 to 8 digits for your PIN");
    if (pin !== again) return setError("The two PINs do not match");
    setBusy(true);
    try {
      await setPin(userId, pin, seconds);
      setEnabled(true);
      setChanging(false);
      setPinValue("");
      setAgain("");
      announce();
      toast.success(enabled ? "PIN changed" : "App lock is on");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function turnOff() {
    removeLock(userId);
    setEnabled(false);
    setBio(false);
    announce();
    toast.success("App lock is off");
  }

  async function toggleBio() {
    setError("");
    if (bio) {
      removeBiometric(userId);
      setBio(false);
      return toast.success("Fingerprint and face unlock is off");
    }
    try {
      await enrollBiometric(userId, email || "CoinLeaf");
      setBio(true);
      toast.success("Fingerprint and face unlock is on");
    } catch {
      setError("Could not turn on fingerprint or face unlock on this device");
    }
  }

  function changeAfter(v: number) {
    setSeconds(v);
    setAutoLock(userId, v);
  }

  return (
    <SettingGroup title="App lock" hint="Ask for a PIN when CoinLeaf opens and after it has been in the background. This is set per device and stays on this device. It does not replace your password.">
      {error && <div className="error" role="alert">{error}</div>}
      {(!enabled || changing) && (
        <form onSubmit={save} className="setting-form">
          <div className="field">
            <label htmlFor="lock-new">{enabled ? "New PIN" : "Choose a PIN (4 to 8 digits)"}</label>
            <input id="lock-new" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="field">
            <label htmlFor="lock-again">Repeat the PIN</label>
            <input id="lock-again" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="flex-gap wrap">
            <button className="btn btn-primary" disabled={busy || !userId}>{enabled ? "Save new PIN" : "Turn on app lock"}</button>
            {changing && <button type="button" className="btn btn-ghost" onClick={() => setChanging(false)}>Cancel</button>}
          </div>
        </form>
      )}
      {enabled && !changing && (
        <div className="setting-form">
          <div className="field">
            <label htmlFor="lock-after">Lock the app</label>
            <select id="lock-after" value={seconds} onChange={(e) => changeAfter(Number(e.target.value))}>
              {AUTO_LOCK_CHOICES.map((c) => (
                <option key={c.seconds} value={c.seconds}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-gap wrap">
            <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new Event(LOCK_NOW))}>Lock now</button>
            <button className="btn btn-ghost" onClick={() => setChanging(true)}>Change PIN</button>
            {canBio && <button className="btn btn-ghost" onClick={toggleBio}>{bio ? "Turn off fingerprint or face" : "Use fingerprint or face"}</button>}
            <button className="btn btn-ghost" onClick={turnOff}>Turn off app lock</button>
          </div>
        </div>
      )}
    </SettingGroup>
  );
}
