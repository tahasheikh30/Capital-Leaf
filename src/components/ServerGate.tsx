"use client";

import Logo from "@/components/Logo";
import TreeLoader from "@/components/TreeLoader";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

const TRY_FOR_MS = 120_000; // give a sleeping free server up to two minutes
const RETRY_EVERY_MS = 2_500;

// If the server answered in the last few minutes it is certainly still awake (Render sleeps after 15 idle
// minutes), so the check is skipped and the app opens instantly.
const AWAKE_KEY = "cl-server-awake";
const AWAKE_FOR_MS = 10 * 60_000;

function recentlyAwake() {
  try {
    return Date.now() - Number(sessionStorage.getItem(AWAKE_KEY) ?? 0) < AWAKE_FOR_MS;
  } catch {
    return false;
  }
}
function markAwake() {
  try {
    sessionStorage.setItem(AWAKE_KEY, String(Date.now()));
  } catch {
    // Private mode or blocked storage: just check every time.
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Waits until the API answers before showing the app. A free Render server sleeps when idle and can
// take a minute to wake up, and without this the pages would just fail while it starts.
export default function ServerGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "failed">("checking");
  const [attempt, setAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    if (recentlyAwake()) {
      setState("ready");
      return;
    }
    setState("checking");
    setSeconds(0);
    // If the server is awake the check takes a blink, so only show the loader if it is taking a moment.
    const reveal = setTimeout(() => setVisible(true), 600);
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);

    (async () => {
      while (!cancelled) {
        if (Date.now() - started > TRY_FOR_MS) {
          setState("failed");
          return;
        }
        try {
          const res = await fetch(`${API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
          if (res.ok) {
            markAwake();
            if (!cancelled) setState("ready");
            return;
          }
        } catch {
          // Not up yet. Try again shortly.
        }
        await sleep(RETRY_EVERY_MS);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(reveal);
      clearInterval(tick);
    };
  }, [attempt]);

  if (state === "ready") return <>{children}</>;

  return (
    <div className="boot-screen" role="status" aria-live="polite">
      {(visible || state === "failed") && (
        <div className="boot-card">
          <Logo tone="light" className="boot-brand" />
          {state === "checking" ? (
            <>
              <div className="boot-tree" aria-hidden="true"><TreeLoader size={132} /></div>
              <h1 className="boot-title">Connecting to server, please be patient</h1>
              <p className="boot-text">
                {seconds < 8
                  ? "Getting everything ready for you."
                  : "The server was asleep and is starting up. This can take up to a minute."}
              </p>
              {seconds >= 8 && <p className="boot-time">Waiting {seconds}s</p>}
            </>
          ) : (
            <>
              <h1 className="boot-title">We could not reach the server</h1>
              <p className="boot-text">It may still be starting, or your connection may be down. Please try again in a moment.</p>
              <button className="btn btn-accent" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
