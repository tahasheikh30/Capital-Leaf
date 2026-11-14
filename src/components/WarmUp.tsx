"use client";

import { useEffect } from "react";
import { API_URL } from "@/lib/api";

// Sends a quiet request to the API so a sleeping server starts waking while people are still
// reading the page or typing their password. The reply is ignored.
export default function WarmUp() {
  useEffect(() => {
    fetch(`${API_URL}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }, []);
  return null;
}
