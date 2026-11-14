"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearApiCache, downloadFile } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setZones(Intl.supportedValuesOf("timeZone"));
    api<Profile>("/profile")
      .then((p) => {
        setProfile(p);
        setFullName(p.full_name ?? "");
        setTimezone(p.timezone);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const p = await api<Profile>("/profile", { method: "PATCH", body: { full_name: fullName, timezone } });
      setProfile(p);
      setMessage("Saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function exportFile(path: string, filename: string) {
    setError("");
    try {
      await downloadFile(path, filename);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("Please sign in again");
      // A fresh sign in proves it is really the account owner, and the server checks this too.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error("That password is not correct");
      await api("/account", { method: "DELETE", body: { confirm: "DELETE MY ACCOUNT" } });
      clearApiCache();
      await supabase.auth.signOut();
      router.push("/signup");
      router.refresh();
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <form className="card mb-16" onSubmit={save}>
        <h2>Profile</h2>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        <div className="row">
          <div className="field">
            <label>Your name</label>
            <input maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label>Time zone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezone && !zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!profile}>
            Save
          </button>
        </div>
        <p className="muted fs-sm mt-14">Your time zone decides when repeating items are added and what counts as today.</p>
      </form>

      <div className="card mb-16">
        <h2>Your data</h2>
        <p className="muted mt-0">Download everything you have recorded. Opens in Excel or Google Sheets.</p>
        <div className="flex-gap wrap">
          <button className="btn btn-ghost" onClick={() => exportFile("/export/transactions.csv", "transactions.csv")}>
            Transactions (CSV)
          </button>
          <button className="btn btn-ghost" onClick={() => exportFile("/export/all.json", "my-data.json")}>
            Everything (JSON)
          </button>
        </div>
      </div>

      <form className="card danger-zone" onSubmit={deleteAccount}>
        <h2>Delete account</h2>
        <p className="muted mt-0">
          This permanently deletes your login and all your transactions, budgets, holdings and settings. It cannot be undone. Export your data first if you want a copy.
        </p>
        {deleteError && <div className="error">{deleteError}</div>}
        <div className="row">
          <div className="field">
            <label>Your password</label>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Type DELETE to confirm</label>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <button className="btn btn-accent" disabled={deleting || confirmText !== "DELETE" || !password}>
            {deleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </form>
    </>
  );
}
