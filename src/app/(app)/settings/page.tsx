"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import Tabs from "@/components/Tabs";
import { useNotifications, useToast } from "@/components/Toast";
import { SettingGroup, SettingRow, Switch } from "@/components/settings/controls";
import { api, clearApiCache, downloadFile } from "@/lib/api";
import { usePreferences, type NoteCategory } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Tab = "account" | "notifications" | "display" | "features" | "data";
const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "notifications", label: "Notifications" },
  { id: "display", label: "Display" },
  { id: "features", label: "Features" },
  { id: "data", label: "Data and security" },
];

const KINDS: { id: NoteCategory; title: string; description: string }[] = [
  { id: "alerts", title: "Price alerts", description: "A share you watch reached the price you set." },
  { id: "household", title: "Household", description: "Invitations, and you joining or leaving a shared budget." },
  { id: "activity", title: "Your own changes", description: "Confirmations such as a transaction added, a rule saved or a file downloaded." },
];

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const { prefs, update } = usePreferences();
  const { notes, clearAll } = useNotifications();

  const [tab, setTab] = useState<Tab>("account");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [features, setFeatures] = useState<{ email: boolean } | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
    setZones(Intl.supportedValuesOf("timeZone"));
    createClient().auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
    api<Profile>("/profile")
      .then((p) => {
        setProfile(p);
        setFullName(p.full_name ?? "");
        setTimezone(p.timezone);
      })
      .catch((e) => setError((e as Error).message));
    api<{ ai: boolean; email: boolean }>("/features")
      .then((f) => {
        setAiAvailable(f.ai);
        setFeatures({ email: f.email });
      })
      .catch(() => {});
  }, []);

  function choose(t: Tab) {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  }

  async function change(patch: Partial<Profile>, ok: string) {
    try {
      const p = await api<Profile>("/profile", { method: "PATCH", body: patch });
      setProfile(p);
      toast.success(ok);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const p = await api<Profile>("/profile", { method: "PATCH", body: { full_name: fullName, timezone } });
      setProfile(p);
      toast.success("Settings saved");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (next.length < 8) return setPwError("Use at least 8 characters for the new password");
    if (next !== again) return setPwError("The two new passwords do not match");
    setPwBusy(true);
    try {
      const supabase = createClient();
      // Signing in again proves it is really the account owner before the password changes.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInError) throw new Error("Your current password is not correct");
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw new Error(updateError.message);
      setCurrent("");
      setNext("");
      setAgain("");
      toast.success("Password changed");
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwBusy(false);
    }
  }

  async function exportFile(path: string, filename: string) {
    try {
      await downloadFile(path, filename);
      toast.success("Download started");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const supabase = createClient();
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

  const n = prefs.notifications;

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <div className="settings-tabs">
        <Tabs tabs={TABS} value={tab} onChange={choose} label="Settings sections" />
      </div>

      {tab === "account" && (
        <div className="settings-pane">
          <SettingGroup title="Profile" hint="Your time zone decides when repeating items are added and what counts as today.">
            <form onSubmit={save} className="setting-form">
              {error && <div className="error">{error}</div>}
              <div className="field">
                <label htmlFor="s-email">Email</label>
                <input id="s-email" value={email} readOnly disabled />
              </div>
              <div className="field">
                <label htmlFor="s-name">Your name</label>
                <input id="s-name" maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="s-tz">Time zone</label>
                <select id="s-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezone && !zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" disabled={!profile}>
                Save profile
              </button>
            </form>
          </SettingGroup>

          <SettingGroup title="Password" hint="Choose a new password. We ask for the current one first.">
            <form onSubmit={changePassword} className="setting-form">
              {pwError && <div className="error">{pwError}</div>}
              <div className="field">
                <label htmlFor="pw-cur">Current password</label>
                <input id="pw-cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pw-new">New password</label>
                <input id="pw-new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pw-again">New password again</label>
                <input id="pw-again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={pwBusy}>
                {pwBusy ? "Changing..." : "Change password"}
              </button>
            </form>
          </SettingGroup>
        </div>
      )}

      {tab === "notifications" && (
        <div className="settings-pane">
          <SettingGroup title="Notifications" hint="Error messages that need your attention are always shown, whatever you choose here. These choices apply to this browser.">
            <SettingRow title="All notifications" description={n.enabled ? "Messages appear as they happen and are kept in the Notifications list." : "Off: no messages appear and none are kept, except errors."}>
              <Switch label="All notifications" checked={n.enabled} onChange={(v) => update((d) => void (d.notifications.enabled = v))} />
            </SettingRow>
            <SettingRow title="Show pop-ups" description="Off: messages are only kept in the Notifications list and do not pop up in the corner.">
              <Switch label="Show pop-ups" checked={n.popups} disabled={!n.enabled} onChange={(v) => update((d) => void (d.notifications.popups = v))} />
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="What to tell me about" hint="Turn off the kinds of message you do not need.">
            {KINDS.map((k) => (
              <SettingRow key={k.id} title={k.title} description={k.description}>
                <Switch label={k.title} checked={n.categories[k.id] !== false} disabled={!n.enabled} onChange={(v) => update((d) => void (d.notifications.categories[k.id] = v))} />
              </SettingRow>
            ))}
          </SettingGroup>

          <SettingGroup title="Price alert emails" hint="Alerts are emailed by the server, so they arrive even when the app is closed.">
            <SettingRow
              title="Email me by default"
              description={features && !features.email ? "Email is not set up on this server yet, so alerts only show in the app." : "New price alerts start with the email option ticked. You can change it on each alert."}
            >
              <Switch label="Email me by default" checked={prefs.emailNewAlerts} onChange={(v) => update((d) => void (d.emailNewAlerts = v))} />
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="Notification list" hint="Messages from this session are kept in this browser tab only.">
            <button type="button" className="btn btn-ghost" onClick={clearAll} disabled={notes.length === 0}>
              Clear the notification list
            </button>
          </SettingGroup>
        </div>
      )}

      {tab === "display" && (
        <div className="settings-pane">
          <SettingGroup title="Theme" hint="Light or dark. Saved on this device.">
            <div className="theme-options" role="radiogroup" aria-label="Theme">
              {(["light", "dark"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={prefs.theme === t} className={`theme-opt ${prefs.theme === t ? "on" : ""}`} onClick={() => update((d) => void (d.theme = t))}>
                  <span className={`theme-prev theme-prev-${t}`} aria-hidden="true">
                    <span className="tp-bar" />
                    <span className="tp-card" />
                    <span className="tp-line" />
                  </span>
                  <span className="theme-label">
                    {t === "light" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
                    {t === "light" ? "Light theme" : "Dark theme"}
                  </span>
                </button>
              ))}
            </div>
          </SettingGroup>

          <SettingGroup title="Layout">
            <SettingRow title="Density" description="Compact fits more on screen: tighter tables, lists and cards.">
              <select aria-label="Density" value={prefs.density} onChange={(e) => update((d) => void (d.density = e.target.value as "comfortable" | "compact"))}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </SettingRow>
            <SettingRow title="Animations" description="Off: bars, panels and pop-ups appear without moving.">
              <Switch label="Animations" checked={prefs.animations} onChange={(v) => update((d) => void (d.animations = v))} />
            </SettingRow>
          </SettingGroup>
        </div>
      )}

      {tab === "features" && (
        <div className="settings-pane">
          <SettingGroup title="Freelancer mode" hint="For irregular income.">
            <SettingRow title="Use freelancer mode" description="Set money aside for tax and show a safe monthly budget.">
              <Switch label="Freelancer mode" checked={!!profile?.freelancer_mode} disabled={!profile} onChange={(v) => change({ freelancer_mode: v }, v ? "Freelancer mode on" : "Freelancer mode off")} />
            </SettingRow>
            {profile?.freelancer_mode && (
              <>
                <SettingRow title="Share of income set aside for tax" description="A percentage of what you earn.">
                  <div className="unit-input">
                    <input
                      aria-label="Tax percentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      defaultValue={profile.tax_set_aside_pct}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0 && v <= 100 && v !== profile.tax_set_aside_pct) change({ tax_set_aside_pct: v }, "Tax rate saved");
                      }}
                    />
                    <span>%</span>
                  </div>
                </SettingRow>
                <SettingRow title="Smooth my budget" description="Base it on your average income, so a slow month does not wipe it out.">
                  <Switch label="Smooth my budget" checked={profile.smooth_budget} onChange={(v) => change({ smooth_budget: v }, "Saved")} />
                </SettingRow>
              </>
            )}
          </SettingGroup>

          {aiAvailable ? (
            <SettingGroup
              title="AI features"
              hint="When you use these, the text of the expense notes you ask about, or a summary of your records (monthly totals, category totals, common notes, budgets and recurring items, plus net worth and freelancer figures in your personal space) is sent to an AI provider through OpenRouter to produce the answer. Names, email addresses and account details are not sent. Nothing is sent while this is off."
            >
              <SettingRow title="Use AI features" description="Suggest categories and answer questions about my money.">
                <Switch label="AI features" checked={!!profile?.ai_enabled} disabled={!profile} onChange={(v) => change({ ai_enabled: v }, v ? "AI features on" : "AI features off")} />
              </SettingRow>
            </SettingGroup>
          ) : (
            <SettingGroup title="AI features" hint="AI features are not set up on this server yet." >
              <p className="muted mt-0">When they are, you can turn them on here.</p>
            </SettingGroup>
          )}
        </div>
      )}

      {tab === "data" && (
        <div className="settings-pane">
          <SettingGroup title="Your data" hint="Download everything you have recorded. Opens in Excel or Google Sheets.">
            <div className="flex-gap wrap">
              <button className="btn btn-ghost" onClick={() => exportFile("/export/transactions.csv", "transactions.csv")}>
                Transactions (CSV)
              </button>
              <button className="btn btn-ghost" onClick={() => exportFile("/export/all.json", "my-data.json")}>
                Everything (JSON)
              </button>
            </div>
          </SettingGroup>

          <SettingGroup title="Delete account" danger hint="This permanently deletes your login and all your transactions, budgets, holdings and settings. It cannot be undone. Export your data first if you want a copy.">
            <form onSubmit={deleteAccount} className="setting-form">
              {deleteError && <div className="error">{deleteError}</div>}
              <div className="field">
                <label htmlFor="del-pw">Your password</label>
                <input id="del-pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="del-confirm">Type DELETE to confirm</label>
                <input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              </div>
              <button className="btn btn-accent" disabled={deleting || confirmText !== "DELETE" || !password}>
                {deleting ? "Deleting..." : "Delete my account"}
              </button>
            </form>
          </SettingGroup>
        </div>
      )}
    </>
  );
}
