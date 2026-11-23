"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { SettingGroup } from "@/components/settings/controls";
import { disableWidget, enableWidget, savedToken, widgetEnabled, widgetLink } from "@/lib/widget";

// The "left to spend" widget. Be clear about what each platform can really do.
export default function WidgetSettings() {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(savedToken());
    widgetEnabled().then(setEnabled).catch(() => setError("Could not load the widget settings"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      const t = await enableWidget();
      setToken(t);
      setEnabled(true);
      toast.success("Widget link ready");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!window.confirm("Turn off the widget? Every link and widget that uses it will stop working.")) return;
    setBusy(true);
    try {
      await disableWidget();
      setToken(null);
      setEnabled(false);
      toast.success("Widget turned off");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it.");
    }
  }

  const link = token ? widgetLink(window.location.origin, token) : "";
  return (
    <SettingGroup title="Left-to-spend widget" hint="See what is left to spend this month without opening CoinLeaf. The link shows that one number and nothing else, and you can turn it off at any time.">
      {error && <div className="error" role="alert">{error}</div>}
      {enabled === null ? (
        <p className="muted">Loading...</p>
      ) : !enabled ? (
        <button className="btn btn-primary" onClick={turnOn} disabled={busy}>Turn on the widget</button>
      ) : (
        <div className="setting-form">
          {link ? (
            <>
              <div className="field">
                <label htmlFor="widget-link">Your widget link</label>
                <input id="widget-link" className="widget-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              </div>
              <p className="muted small">
                Open it on your phone, then use Add to Home screen (Share menu on iPhone, menu on Android) to get a one-number icon. On Windows with Edge, install CoinLeaf and add the Left to spend widget from the widgets board. Anyone with this link can see the number, so keep it private.
              </p>
              <div className="flex-gap wrap">
                <button className="btn btn-primary" onClick={() => copy(link)}>Copy link</button>
                <a className="btn btn-ghost" href={link} target="_blank" rel="noreferrer">Open</a>
              </div>
            </>
          ) : (
            <p className="muted">The widget is on, but its link is only kept on the device that made it. Make a new link to use it here (the old link stops working).</p>
          )}
          <div className="flex-gap wrap">
            <button className="btn btn-ghost" onClick={turnOn} disabled={busy}>Make a new link</button>
            <button className="btn btn-ghost" onClick={turnOff} disabled={busy}>Turn off</button>
          </div>
        </div>
      )}
    </SettingGroup>
  );
}
