"use client";

import Link from "next/link";
import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, postPhoto } from "@/lib/api";
import { preparePhoto } from "@/lib/image";
import type { ReceiptScan as Scan } from "@/lib/types";

type Status = { available: boolean; enabled: boolean };

// Photograph a receipt and the amount, date, shop and category are filled in. Nothing is saved: the person
// looks at the form first. The photo comes back too, so it can be kept on the transaction.
export default function ReceiptScan({ onScanned, onError }: { onScanned: (scan: Scan, photo: Blob) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Status>("/ai/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status?.available) return null;
  if (!status.enabled)
    return (
      <p className="muted fs-sm scan-off">
        <Link href="/settings" className="link">Turn on AI in Settings</Link> to fill in an expense from a photo of its receipt.
      </p>
    );

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await preparePhoto(file);
      if ("error" in prepared) return onError(prepared.error);
      const scan = await postPhoto<Scan>("/ai/receipt", prepared.blob);
      onScanned(scan, prepared.blob);
    } catch (e) {
      onError(e instanceof ApiError && e.status === 0 ? "Reading a receipt needs a connection. You can still fill it in yourself." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan">
      <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => input.current?.click()}>
        <ScanLine size={16} aria-hidden="true" /> {busy ? "Reading your receipt..." : "Scan a receipt"}
      </button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-label="Receipt photo to read"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
