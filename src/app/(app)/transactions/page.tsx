"use client";

import Sheet from "@/components/Sheet";
import { Camera, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import AiCategorize from "@/components/AiCategorize";
import ReceiptField, { type PhotoChange } from "@/components/ReceiptField";
import ReceiptScan from "@/components/ReceiptScan";
import ReceiptViewer from "@/components/ReceiptViewer";
import TagInput from "@/components/TagInput";
import TransactionFilters from "@/components/TransactionFilters";
import { SavingsSplitFields, useSavingsSplit } from "@/components/SavingsSplit";
import { useToast } from "@/components/Toast";
import { api, peek, uploadFile } from "@/lib/api";
import { money, monthKey, today } from "@/lib/format";
import { addOrQueue } from "@/lib/offlineQueue";
import { useUserId } from "@/lib/useUserId";
import { useSpace } from "@/lib/space";
import { isFiltering, NO_FILTERS, searchPath, type Filters } from "@/lib/txFilters";
import type { Category, IncomeSource, ReceiptScan as ReceiptScanResult, Transaction } from "@/lib/types";

// Long months are drawn in pages of this size so the table stays fast to render.
const PAGE_SIZE = 50;
const NO_PHOTO: PhotoChange = { file: null, remove: false };

export default function TransactionsPage() {
  const toast = useToast();
  const { isHousehold, household } = useSpace();
  const userId = useUserId();
  const [items, setItems] = useState<Transaction[]>(() => peek<Transaction[]>(`/transactions?month=${monthKey(new Date())}`) ?? []);
  const [cats, setCats] = useState<Category[]>(() => peek<Category[]>("/categories") ?? []);
  const [sources, setSources] = useState<IncomeSource[]>(() => peek<IncomeSource[]>("/income-sources") ?? []);
  const [month, setMonth] = useState(monthKey(new Date()));

  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [photo, setPhoto] = useState<PhotoChange>(NO_PHOTO);
  const [editingHasPhoto, setEditingHasPhoto] = useState(false);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [tagList, setTagList] = useState<{ tag: string; count: number }[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [found, setFound] = useState<{ items: Transaction[]; total: number } | null>(null);
  const filtering = isFiltering(filters);

  const canSave = type === "income" && !editingId && !isHousehold;
  // Optionally move part of a new income into savings, split across items if wanted.
  const split = useSavingsSplit(formOpen, canSave);

  const load = useCallback(async () => {
    if (!month) return;
    try {
      const [t, c, s, tg] = await Promise.all([
        api<Transaction[]>(`/transactions?month=${month}`),
        api<Category[]>("/categories"),
        api<IncomeSource[]>("/income-sources"),
        api<{ tag: string; count: number }[]>("/transactions/tags").catch(() => []),
      ]);
      setItems(t);
      setCats(c);
      setSources(s);
      setTagList(Array.isArray(tg) ? tg : []);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  // Searching waits a moment after typing, and asks the server so it covers every month.
  const runSearch = useCallback(
    async (offset = 0) => {
      try {
        const r = await api<{ items: Transaction[]; total: number }>(searchPath(filters, month, offset, PAGE_SIZE));
        setFound((prev) => (offset && prev ? { items: [...prev.items, ...r.items], total: r.total } : r));
        setLoadError("");
      } catch (e) {
        setLoadError((e as Error).message);
      }
    },
    [filters, month]
  );
  useEffect(() => {
    if (!filtering) {
      setFound(null);
      return;
    }
    const t = setTimeout(() => runSearch(0), filters.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [filtering, runSearch, filters.q]);
  const reload = useCallback(() => {
    load();
    if (filtering) runSearch(0);
  }, [load, filtering, runSearch]);

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setAmount("");
    setNote("");
    setCategoryId("");
    setSourceId("");
    setDate(today());
    setTags([]);
    setPhoto(NO_PHOTO);
    setEditingHasPhoto(false);
    split.reset();
  }

  function applyScan(scan: ReceiptScanResult, blob: Blob) {
    setType("expense");
    setAmount(String(scan.amount));
    if (scan.date && scan.date <= today()) setDate(scan.date);
    if (scan.note) setNote(scan.note);
    if (scan.category_id) setCategoryId(scan.category_id);
    setPhoto({ file: blob, remove: false });
    toast.info("Filled in from your receipt. Check it, then save.");
  }

  function startEdit(t: Transaction) {
    setEditingId(t.id);
    setFormOpen(true);
    setType(t.type);
    setAmount(String(t.amount));
    setDate(t.occurred_on);
    setNote(t.note ?? "");
    setCategoryId(t.category_id ?? "");
    setSourceId(t.income_source_id ?? "");
    setTags(t.tags ?? []);
    setPhoto(NO_PHOTO);
    setEditingHasPhoto(!!t.receipt_path);
    setError("");
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const body: Record<string, unknown> = {
      type,
      amount: Number(amount),
      occurred_on: date,
      note: note || null,
      tags,
      category_id: type === "expense" && categoryId ? categoryId : null,
      income_source_id: type === "income" && sourceId ? sourceId : null,
    };
    let moved = 0;
    if (canSave) {
      const built = split.build(Number(amount));
      if (built && "error" in built) return toast.error(built.error);
      if (built) {
        moved = built.total;
        body.savings = built.savings;
      }
    }
    try {
      let saved: { id: string; savings?: { asset_name: string }[] } | undefined;
      if (editingId) {
        saved = await api<{ id: string; savings?: { asset_name: string }[] }>(`/transactions/${editingId}`, { method: "PATCH", body });
      } else {
        // A new entry is kept on this device when there is no connection and sent later.
        const result = await addOrQueue<{ id: string; savings?: { asset_name: string }[] }>(userId, body, isHousehold && household ? household.id : "personal");
        if (result.queued) {
          resetForm();
          return void toast.success(photo.file ? "Saved on this device without its photo. Add the photo once you are back online." : "Saved on this device. It will sync when you are back online.");
        }
        saved = result.saved;
      }
      const names = (saved?.savings ?? []).map((m) => m.asset_name);
      const movedTo = names.length > 2 ? `${names.length} items` : names.join(" and ");
      const txId = editingId ?? saved?.id;
      let photoProblem = "";
      if (txId && photo.file) {
        try {
          await uploadFile(`/transactions/${txId}/receipt`, photo.file);
        } catch (err) {
          photoProblem = (err as Error).message;
        }
      } else if (txId && photo.remove) {
        await api(`/transactions/${txId}/receipt`, { method: "DELETE" }).catch(() => {});
      }
      resetForm();
      toast.success(editingId ? "Transaction updated" : movedTo ? `Transaction added. ${money(moved)} moved to ${movedTo}` : "Transaction added");
      if (photoProblem) toast.error(`Saved, but the photo was not uploaded: ${photoProblem}`);
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    try {
      if (editingId === id) resetForm();
      await api(`/transactions/${id}`, { method: "DELETE" });
      toast.success("Transaction deleted");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const list = filtering ? found?.items ?? [] : items;
  const income = items.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);
  const spent = items.filter((t) => t.type === "expense").reduce((a, t) => a + Number(t.amount), 0);

  return (
    <>
      <div className="page-head">
        <h1>Transactions</h1>
        <button className="btn btn-accent" onClick={() => { resetForm(); setFormOpen(true); }}>
          <Plus size={16} aria-hidden="true" /> Add
        </button>
        <input type="month" value={month} onChange={(e) => {
            setMonth(e.target.value);
            setShown(PAGE_SIZE);
          }} className="w-auto"/>
      </div>

      <AiCategorize items={items} cats={cats} onApplied={reload} />

      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      <TransactionFilters filters={filters} onChange={(f) => { setFilters(f); setShown(PAGE_SIZE); }} cats={cats} popularTags={tagList.slice(0, 12).map((t) => t.tag)} />

      <Sheet open={formOpen} onClose={resetForm} title={editingId ? "Edit transaction" : "Add a transaction"}>
<form className="sheet-form" onSubmit={add}>
        {error && <div className="error">{error}</div>}
        {!editingId && type === "expense" && <ReceiptScan onScanned={applyScan} onError={(m) => toast.error(m)} />}
        <div className="row">
          <div className="field">
            <label>Type</label>
            <select value={type} disabled={!!editingId} onChange={(e) => setType(e.target.value as "income" | "expense")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="field">
            <label>Amount</label>
            <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {type === "expense" ? (
            <div className="field">
              <label>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorized</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Source</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Other</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Note</label>
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          <TagInput value={tags} onChange={setTags} suggestions={tagList.map((t) => t.tag)} />
          <ReceiptField existingId={editingHasPhoto ? editingId : null} change={photo} onChange={setPhoto} onError={(m) => toast.error(m)} />
          {canSave && <SavingsSplitFields s={split} income={amount} />}
          <button className="btn btn-accent">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
</Sheet>

      {filtering ? (
        <p className="muted filter-count" role="status">
          {found ? `${found.total} ${found.total === 1 ? "match" : "matches"}` : "Searching..."}
        </p>
      ) : (
      <div className="grid grid-2 mb-16">
        <div className="card">
          <div className="stat-label">Earned</div>
          <div className="stat-value pos">{money(income)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Spent</div>
          <div className="stat-value neg">{money(spent)}</div>
        </div>
      </div>
      )}

      <div className="card table-wrap">
        {list.length === 0 ? (
          <p className="muted">{filtering ? (found ? "Nothing matches these filters." : "Searching...") : "Nothing recorded for this month."}</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(filtering ? list : list.slice(0, shown)).map((t) => {
                const label =
                  t.type === "expense"
                    ? cats.find((c) => c.id === t.category_id)?.name ?? "Uncategorized"
                    : sources.find((s) => s.id === t.income_source_id)?.name ?? "Other";
                return (
                  <tr key={t.id}>
                    <td data-label="Date">{t.occurred_on}</td>
                    <td data-label="Details">
                      <div className="cell-main">
                        {label}
                        {t.note && <div className="muted fs-sm">{t.note}</div>}
                        {!!t.tags?.length && (
                          <div className="tag-row">
                            {t.tags.map((g) => (
                              <span className="chip chip-static" key={g}>{g}</span>
                            ))}
                          </div>
                        )}
                        {t.recurring_id && <div className="muted fs-sm">Repeats automatically</div>}
                      </div>
                    </td>
                    <td data-label="Type">
                      <span className={`badge ${t.type === "expense" ? "badge-expense" : ""}`}>{t.type}</span>
                    </td>
                    <td data-label="Amount" className={`text-right ${t.type === "income" ? "pos" : "neg"}`}>
                      {t.type === "income" ? "+" : "-"}
                      {money(Number(t.amount))}
                    </td>
                    <td className="text-right nowrap cell-actions">
                      {t.receipt_path && (
                        <button className="btn btn-ghost btn-small photo-btn" aria-label={`View photo for ${label}`} onClick={() => setViewing(t)}>
                          <Camera size={14} aria-hidden="true" /> Photo
                        </button>
                      )}
                      <button className="btn btn-ghost btn-small" onClick={() => startEdit(t)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => remove(t.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtering && found && found.items.length < found.total && (
          <button className="btn btn-ghost btn-block mt-14" onClick={() => runSearch(found.items.length)}>
            Show more ({found.total - found.items.length} left)
          </button>
        )}
        {!filtering && items.length > shown && (
          <button className="btn btn-ghost btn-block mt-14" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show more ({items.length - shown} left)
          </button>
        )}
      </div>
      <ReceiptViewer id={viewing?.id ?? null} title={viewing ? `${viewing.type === "expense" ? "Expense" : "Income"} on ${viewing.occurred_on}` : ""} onClose={() => setViewing(null)} />
    </>
  );
}
