"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { addTag, MAX_TAGS } from "@/lib/tags";

// Type a tag and press Enter or comma. Used on transactions ("business", "reimbursable").
export default function TagInput({ value, onChange, suggestions = [], label = "Tags" }: { value: string[]; onChange: (t: string[]) => void; suggestions?: string[]; label?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const listId = useId();

  function commit(raw: string) {
    const r = addTag(value, raw);
    if ("error" in r) return setError(r.error);
    setError("");
    onChange(r.tags);
    setText("");
  }

  return (
    <div className="field">
      <label htmlFor={`${listId}-in`}>{label}</label>
      <div className="tag-input">
        {value.map((t) => (
          <span className="tag-chip" key={t}>
            {t}
            <button type="button" className="tag-chip-x" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <input
            id={`${listId}-in`}
            list={listId}
            value={text}
            maxLength={30}
            placeholder={value.length ? "" : "e.g. business, reimbursable"}
            onChange={(e) => {
              setError("");
              if (e.target.value.endsWith(",")) commit(e.target.value);
              else setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(text);
              } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
            }}
            onBlur={() => text.trim() && commit(text)}
          />
        )}
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {error && <span className="error fs-sm" role="alert">{error}</span>}
    </div>
  );
}
