"use client";

import { useCallback, useEffect, useState } from "react";
import { useSpace } from "@/lib/space";
import { useToast } from "@/components/Toast";
import { QUEUE_EVENT, discard, flushQueue, readQueue, type Queued } from "@/lib/offlineQueue";
import { money } from "@/lib/format";
import { useUserId } from "@/lib/useUserId";

// Shows when the app is offline and what is waiting to be sent, and sends it as soon as the connection is back.
export default function SyncBanner() {
  const userId = useUserId();
  const toast = useToast();
  const { refresh } = useSpace();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const sync = useCallback(async () => {
    if (!userId || readQueue(userId).every((q) => q.error)) return;
    setBusy(true);
    const r = await flushQueue(userId);
    setBusy(false);
    if (r.sent) {
      toast.success(r.sent === 1 ? "1 offline entry synced" : `${r.sent} offline entries synced`);
      refresh();
    }
    if (r.failed) toast.error(`${r.failed} offline ${r.failed === 1 ? "entry" : "entries"} could not be saved. See the list at the top of the page.`);
  }, [userId, toast, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [sync]);

  useEffect(() => {
    if (!userId) return;
    const read = () => setItems(readQueue(userId));
    read();
    window.addEventListener(QUEUE_EVENT, read);
    // Anything left from an earlier session (or typed on the offline page) goes out on start.
    if (navigator.onLine) void sync();
    return () => window.removeEventListener(QUEUE_EVENT, read);
    // Runs when the person is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (online && items.length === 0) return null;
  const waiting = items.filter((q) => !q.error).length;
  return (
    <div className={`sync-banner${online ? "" : " off"}`} role="status">
      <div className="sync-line">
        <span>
          {!online && "You are offline. "}
          {waiting > 0 ? `${waiting} ${waiting === 1 ? "entry" : "entries"} waiting to sync.` : online ? "Some entries could not be saved." : "New entries are saved on this device."}
        </span>
        {items.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide" : "Show"}</button>
        )}
        {online && waiting > 0 && (
          <button className="btn btn-sm" onClick={sync} disabled={busy}>{busy ? "Syncing..." : "Sync now"}</button>
        )}
      </div>
      {open && (
        <ul className="sync-list">
          {items.map((q) => (
            <li key={q.id}>
              <span>
                {String(q.body.type) === "income" ? "Income" : "Expense"} {money(Number(q.body.amount))} on {String(q.body.occurred_on)}
                {q.body.note ? `, ${String(q.body.note)}` : ""}
                {q.error && <em className="sync-err"> Not saved: {q.error}</em>}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => discard(userId, q.id)}>Discard</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
