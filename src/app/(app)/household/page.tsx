"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { useSpace } from "@/lib/space";

export default function HouseholdPage() {
  const toast = useToast();
  const { household, reload, setSpace } = useSpace();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api<{ id: string }>("/households", { method: "POST", body: { name } }), "Household created");
    if (r) {
      await reload();
      setSpace(r.id);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api<{ link: string; emailed: boolean }>("/households/invites", { method: "POST", body: { email } }));
    if (!r) return;
    setLink(r.link);
    setEmail("");
    toast.success(r.emailed ? "Invitation emailed" : "Invitation created. Share the link below.");
    reload();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it.");
    }
  }

  if (!household)
    return (
      <>
        <div className="page-head">
          <h1>Household</h1>
        </div>
        <form className="card" onSubmit={create}>
          <h2>Share a budget with family</h2>
          <p className="muted mt-0">
            Members share transactions, categories, income sources, budgets and recurring items. You can switch between your personal space and the household at any time. Stocks, net worth, tax and alerts always stay private. Up to 6 people.
          </p>
          <div className="row">
            <div className="field">
              <label>Household name</label>
              <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Our home" />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              Create household
            </button>
          </div>
        </form>
      </>
    );

  const owner = household.role === "owner";
  return (
    <>
      <div className="page-head">
        <h1>{household.name}</h1>
        <span className="badge">{owner ? "You are the owner" : "Member"}</span>
      </div>

      <div className="card table-wrap mb-16">
        <h2>
          Members ({household.members.length} of {household.limits.members})
        </h2>
        <table className="table table-stack">
          <tbody>
            {household.members.map((m) => (
              <tr key={m.user_id}>
                <td data-label="Member">
                  <strong>{m.name || m.email}</strong>
                  <div className="muted fs-sm">{m.email}</div>
                </td>
                <td data-label="Role">
                  <span className="badge">{m.role}</span>
                </td>
                <td className="text-right cell-actions">
                  {owner && m.role !== "owner" && (
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={async () => {
                        await run(() => api(`/households/members/${m.user_id}`, { method: "DELETE" }), "Member removed");
                        reload();
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {owner && (
        <>
          <form className="card mb-16" onSubmit={invite}>
            <h2>Invite someone</h2>
            <div className="row">
              <div className="field">
                <label>Their email (the one they sign up with)</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={busy}>
                Send invitation
              </button>
            </div>
            <p className="muted fs-sm mt-14">The link works once, for 7 days, and only for an account with that email address.</p>
            {link && (
              <div className="link-box">
                <code>{link}</code>
                <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
                  Copy
                </button>
              </div>
            )}
          </form>

          {household.invites.length > 0 && (
            <div className="card table-wrap mb-16">
              <h2>Waiting to join</h2>
              <table className="table table-stack">
                <tbody>
                  {household.invites.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Email">{i.email}</td>
                      <td data-label="Expires">Expires {new Date(i.expires_at).toLocaleDateString()}</td>
                      <td className="text-right cell-actions">
                        <button
                          className="btn btn-danger"
                          disabled={busy}
                          onClick={async () => {
                            await run(() => api(`/households/invites/${i.id}`, { method: "DELETE" }), "Invitation cancelled");
                            reload();
                          }}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card danger-zone">
        <h2>Leave household</h2>
        <p className="muted mt-0">
          {household.members.length > 1
            ? owner
              ? "Shared records stay with the household and ownership passes to the next member."
              : "Shared records stay with the household. Your personal records are not affected."
            : "You are the only member. Leaving deletes the household and everything shared in it."}
        </p>
        {!confirmLeave ? (
          <button className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>
            Leave household
          </button>
        ) : (
          <div className="flex-gap">
            <button
              className="btn btn-accent"
              disabled={busy}
              onClick={async () => {
                const only = household.members.length === 1;
                await run(() => api(`/households/me${only ? "?delete_data=true" : ""}`, { method: "DELETE" }), "You left the household");
                setSpace("personal");
                await reload();
                setConfirmLeave(false);
              }}
            >
              Yes, leave
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
          </div>
        )}
      </div>
    </>
  );
}
