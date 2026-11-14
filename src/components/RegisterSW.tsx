"use client";

import { useEffect } from "react";

// Registers the service worker that makes the app installable. Skipped in development.
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
