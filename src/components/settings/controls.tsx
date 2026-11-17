"use client";

import { useId } from "react";

// An on/off switch. It is a real button with role "switch", so the keyboard and screen readers treat it as one.
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch ${checked ? "switch-on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="switch-knob" aria-hidden="true" />
    </button>
  );
}

// One setting: what it is and does on the left, the control on the right.
export function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <p className="setting-title">{title}</p>
        {description && <p className="setting-desc">{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export function SettingGroup({ title, hint, danger, children }: { title: string; hint?: string; danger?: boolean; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className={`setting-group ${danger ? "danger-zone" : ""}`} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {hint && <p className="setting-hint">{hint}</p>}
      {children}
    </section>
  );
}
