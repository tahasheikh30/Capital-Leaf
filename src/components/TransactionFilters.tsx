"use client";

import { Search, X } from "lucide-react";
import { isFiltering, NO_FILTERS, type Filters } from "@/lib/txFilters";
import type { Category } from "@/lib/types";

export default function TransactionFilters({ filters, onChange, cats, popularTags }: { filters: Filters; onChange: (f: Filters) => void; cats: Category[]; popularTags: string[] }) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleTag = (t: string) => set({ tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] });

  return (
    <form className="card filter-bar" role="search" aria-label="Search transactions" onSubmit={(e) => e.preventDefault()}>
      <div className="filter-row">
        <div className="field grow">
          <label htmlFor="tx-q">Search</label>
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <input id="tx-q" type="search" value={filters.q} maxLength={100} placeholder="Note, category, tag or amount" onChange={(e) => set({ q: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="tx-type">Show</label>
          <select id="tx-type" value={filters.type} onChange={(e) => set({ type: e.target.value as Filters["type"] })}>
            <option value="">Any</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-cat">In category</label>
          <select id="tx-cat" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Any category</option>
            <option value="none">Uncategorized</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="filter-row">
        <div className="field">
          <label htmlFor="tx-min">Smallest amount</label>
          <input id="tx-min" type="number" min="0" step="any" inputMode="decimal" value={filters.min} onChange={(e) => set({ min: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="tx-max">Largest amount</label>
          <input id="tx-max" type="number" min="0" step="any" inputMode="decimal" value={filters.max} onChange={(e) => set({ max: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="tx-period">Period</label>
          <select id="tx-period" value={filters.period} onChange={(e) => set({ period: e.target.value as Filters["period"] })}>
            <option value="month">Selected month</option>
            <option value="all">All time</option>
            <option value="custom">Custom dates</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-photo">Photo</label>
          <select id="tx-photo" value={filters.receipt} onChange={(e) => set({ receipt: e.target.value as Filters["receipt"] })}>
            <option value="">Any</option>
            <option value="yes">Has a photo</option>
            <option value="no">No photo</option>
          </select>
        </div>
      </div>
      {filters.period === "custom" && (
        <div className="filter-row">
          <div className="field">
            <label htmlFor="tx-from">From</label>
            <input id="tx-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="tx-to">To</label>
            <input id="tx-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </div>
      )}
      {popularTags.length > 0 && (
        <div className="tag-row" role="group" aria-label="Filter by tag">
          {popularTags.map((t) => (
            <button type="button" key={t} className="tag-chip tag-chip-button" aria-pressed={filters.tags.includes(t)} onClick={() => toggleTag(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {isFiltering(filters) && (
        <div>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange(NO_FILTERS)}>
            <X size={14} aria-hidden="true" /> Clear filters
          </button>
        </div>
      )}
    </form>
  );
}
