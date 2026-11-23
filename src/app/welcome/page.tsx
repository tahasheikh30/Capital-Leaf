"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { api, clearApiCache } from "@/lib/api";
import { CURRENCIES, announceCurrency, currencySymbol } from "@/lib/currency";
import type { Profile } from "@/lib/types";

const STEPS = ["Basics", "Income", "First goal"] as const;
const KINDS = [
  { id: "job", label: "Job" },
  { id: "side_hustle", label: "Side hustle" },
  { id: "investment", label: "Investment" },
  { id: "other", label: "Other" },
] as const;

// A short first-run setup so a new account opens with its currency, an income source and a first goal.
export default function WelcomePage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<string>("PKR");

  const [sourceName, setSourceName] = useState("");
  const [sourceKind, setSourceKind] = useState<(typeof KINDS)[number]["id"]>("job");
  const [monthly, setMonthly] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);

  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDate, setGoalDate] = useState("");

  useEffect(() => {
    api<Profile>("/profile")
      .then((p) => {
        if (p.onboarded_at) router.replace("/dashboard");
        setName(p.full_name ?? "");
        if (p.currency) setCurrency(p.currency);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    // Runs once on arrival; the router is not a reason to load the profile again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(message?: string) {
    setBusy(true);
    setError("");
    try {
      await api("/profile", { method: "PATCH", body: { onboarding_done: true } });
      clearApiCache();
      if (message) toast.success(message);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function saveBasics(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { currency };
      if (name.trim()) body.full_name = name.trim();
      await api("/profile", { method: "PATCH", body });
      announceCurrency(currency);
      setStep(1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveIncome(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = Number(monthly);
    if (!sourceName.trim()) return setError("Give your income a name, like Salary");
    if (!(amount >= 0) || monthly === "") return setError("Enter roughly what you earn each month");
    setBusy(true);
    try {
      const body = { name: sourceName.trim(), kind: sourceKind, expected_monthly: amount };
      // Coming back to this step edits the source instead of adding a second one.
      if (sourceId) await api(`/income-sources/${sourceId}`, { method: "PATCH", body });
      else setSourceId((await api<{ id: string }>("/income-sources", { method: "POST", body })).id);
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const target = Number(goalAmount);
    if (!goalName.trim()) return setError("Name your goal, like Emergency fund");
    if (!(target > 0)) return setError("Enter how much you want to save");
    setBusy(true);
    try {
      await api("/goals", {
        method: "POST",
        body: { target_amount: target, target_date: goalDate || null, new_item: { kind: "savings", name: goalName.trim() } },
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    await finish("You are all set");
  }

  return (
    <div className="auth-wrap onboard-wrap">
      <div className="card auth-card onboard-card">
        <Logo className="auth-logo" />
        <ol className="onboard-steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
        {error && <div className="error" role="alert">{error}</div>}

        {!loaded && <p className="muted">Loading...</p>}

        {loaded && step === 0 && (
          <form onSubmit={saveBasics}>
            <h1>Welcome to CoinLeaf</h1>
            <p className="muted mt-0">Three quick questions so your dashboard is not empty. You can change all of it later.</p>
            <div className="field">
              <label htmlFor="ob-name">What should we call you?</label>
              <input id="ob-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-currency">Currency</label>
              <select id="ob-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {currency !== "PKR" && <p className="muted small">Gold rates and Pakistan stock prices are still shown in rupees.</p>}
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>Next</button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={saveIncome}>
            <h1>Where does your money come from?</h1>
            <p className="muted mt-0">Add your main income. It powers your budget and what is left to spend.</p>
            <div className="field">
              <label htmlFor="ob-source">Income name</label>
              <input id="ob-source" placeholder="Salary" value={sourceName} maxLength={80} onChange={(e) => setSourceName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-kind">Type</label>
              <select id="ob-kind" value={sourceKind} onChange={(e) => setSourceKind(e.target.value as typeof sourceKind)}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ob-monthly">About how much each month ({currencySymbol(currency)})</label>
              <input id="ob-monthly" type="number" inputMode="decimal" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
            <div className="row onboard-actions">
              <button type="button" className="btn" onClick={() => setStep(0)} disabled={busy}>Back</button>
              <button type="button" className="btn" onClick={() => setStep(2)} disabled={busy}>Skip this step</button>
              <button className="btn btn-primary" disabled={busy}>Next</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={saveGoal}>
            <h1>What are you saving for?</h1>
            <p className="muted mt-0">Pick one goal to start. You can add more on the Goals page.</p>
            <div className="field">
              <label htmlFor="ob-goal">Goal</label>
              <input id="ob-goal" placeholder="Emergency fund" value={goalName} maxLength={80} onChange={(e) => setGoalName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-target">Target amount ({currencySymbol(currency)})</label>
              <input id="ob-target" type="number" inputMode="decimal" min="1" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-date">Target date (optional)</label>
              <input id="ob-date" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
            </div>
            <div className="row onboard-actions">
              <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}>Back</button>
              <button type="button" className="btn" onClick={() => finish()} disabled={busy}>Skip and finish</button>
              <button className="btn btn-primary" disabled={busy}>Finish</button>
            </div>
          </form>
        )}

        <button type="button" className="onboard-skip" onClick={() => finish()} disabled={busy}>Skip setup for now</button>
      </div>
    </div>
  );
}
