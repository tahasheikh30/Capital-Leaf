"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { useSpace } from "@/lib/space";

type Status = { available: boolean; enabled: boolean };
type Turn = { q: string; a: string };

const IDEAS = ["How much did I spend on food last month compared with the month before?", "Which three categories grew the most over the last six months?", "Am I on track with my budget this month?", "What are my biggest recurring costs?"];

export default function AskPage() {
  const toast = useToast();
  const { isHousehold, household } = useSpace();
  const [status, setStatus] = useState<Status | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);

  useEffect(() => {
    api<Status>("/ai/status").then(setStatus).catch((e) => toast.error((e as Error).message));
  }, [toast]);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    try {
      const r = await api<{ answer: string }>("/ai/ask", { method: "POST", body: { question: text }, quiet: true });
      setTurns((t) => [{ q: text, a: r.answer }, ...t]);
      setQuestion("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="skeleton skeleton-chart" aria-busy="true" aria-label="Loading" />;

  if (!status.available)
    return (
      <>
        <div className="page-head">
          <h1>Ask your money</h1>
        </div>
        <div className="card">
          <p className="muted mt-0">AI features are not set up on this server yet.</p>
        </div>
      </>
    );

  if (!status.enabled)
    return (
      <>
        <div className="page-head">
          <h1>Ask your money</h1>
        </div>
        <div className="card">
          <h2>Ask questions in plain English</h2>
          <p className="muted mt-0">This feature is off until you choose to turn it on. You can read exactly what is shared in Settings.</p>
          <Link href="/settings" className="btn btn-primary">
            Go to Settings
          </Link>
        </div>
      </>
    );

  return (
    <>
      <div className="page-head">
        <h1>Ask your money</h1>
        <span className="muted fs-sm">{isHousehold ? `Looking at ${household?.name ?? "your household"}` : "Looking at your personal records"}</span>
      </div>

      <form
        className="ask-box"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <div className="field">
          <label htmlFor="q">Your question</label>
          <textarea id="q" rows={3} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How much did I spend on groceries last month?" />
        </div>
        <button className="btn btn-primary" disabled={busy || question.trim().length < 3}>
          {busy ? "Thinking..." : "Ask"}
        </button>
        <div className="chips mt-14">
          {IDEAS.map((i) => (
            <button type="button" key={i} className="chip" disabled={busy} onClick={() => ask(i)}>
              {i}
            </button>
          ))}
        </div>
      </form>

      {turns.map((t, i) => (
        <div key={i} className="ask-turn">
          <p className="ask-q">{t.q}</p>
          <p className="answer">{t.a}</p>
        </div>
      ))}
      <p className="muted fs-sm">Answers come from your summarized records and can be wrong. Check important figures against your transactions. This is information, not financial advice.</p>
    </>
  );
}
