"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { useSpace } from "@/lib/space";

export default function JoinPage() {
  const router = useRouter();
  const toast = useToast();
  const { reload, setSpace } = useSpace();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Read the token once, then take it out of the address bar so it is not left in history.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    if (t) window.history.replaceState(null, "", "/join");
  }, []);

  async function join() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ household_id?: string; id?: string }>("/households/join", { method: "POST", body: { token } });
      await reload();
      const id = r.household_id ?? r.id;
      if (id) setSpace(id);
      toast.success("You joined the household");
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>Join a household</h1>
      {!token ? (
        <p className="muted">This invitation link is missing its code. Ask the person who invited you to send it again.</p>
      ) : (
        <>
          <p className="muted mt-0">
            You will share transactions, budgets, categories and income sources with the other members. Your stocks, net worth and tax stay private. You can leave at any time.
          </p>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" onClick={join} disabled={busy}>
            {busy ? "Joining..." : "Join household"}
          </button>
        </>
      )}
    </div>
  );
}
