"use client";

import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchBlob } from "@/lib/api";
import { preparePhoto } from "@/lib/image";

export type PhotoChange = { file: Blob | null; remove: boolean };

// Attach, replace or remove the photo of a receipt. The photo is sent after the transaction is saved.
export default function ReceiptField({ existingId, change, onChange, onError }: { existingId: string | null; change: PhotoChange; onChange: (c: PhotoChange) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Show the saved photo (when editing) or the newly chosen one.
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    async function show() {
      if (change.file) url = URL.createObjectURL(change.file);
      else if (existingId && !change.remove) {
        try {
          url = URL.createObjectURL(await fetchBlob(`/transactions/${existingId}/receipt`));
        } catch {
          url = null;
        }
      }
      if (live) setPreview(url);
      else if (url) URL.revokeObjectURL(url);
    }
    show();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [existingId, change]);

  async function pick(file: File | undefined) {
    if (!file) return;
    const r = await preparePhoto(file);
    if ("error" in r) return onError(r.error);
    onChange({ file: r.blob, remove: false });
  }

  const has = !!preview;
  return (
    <div className="field">
      <label htmlFor="receipt-file">Photo</label>
      {has && (
        <div className="receipt-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview!} alt="Receipt" />
        </div>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => input.current?.click()}>
          <Camera size={14} aria-hidden="true" /> {has ? "Replace photo" : "Add a photo"}
        </button>
        {has && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange({ file: null, remove: !!existingId })}>
            <Trash2 size={14} aria-hidden="true" /> Remove photo
          </button>
        )}
      </div>
      <input ref={input} id="receipt-file" className="sr-only" type="file" accept="image/*" capture="environment" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
