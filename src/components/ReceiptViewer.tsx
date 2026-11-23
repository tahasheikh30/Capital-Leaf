"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { fetchBlob } from "@/lib/api";

// Opens the photo of one transaction.
export default function ReceiptViewer({ id, title, onClose }: { id: string | null; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let made: string | null = null;
    let live = true;
    setUrl(null);
    setError("");
    fetchBlob(`/transactions/${id}/receipt`)
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setUrl(made);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);

  return (
    <Sheet open={!!id} onClose={onClose} title="Receipt photo" subtitle={title}>
      {error ? <p className="error">{error}</p> : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="receipt-full" src={url} alt={`Receipt for ${title}`} />
      ) : (
        <div className="skeleton skeleton-row" aria-hidden="true" />
      )}
    </Sheet>
  );
}
