"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api, peek } from "@/lib/api";
import type { Category } from "@/lib/types";

function Swatch({ color }: { color: string }) {
  // An SVG fill attribute is allowed by the Content Security Policy, a style attribute is not.
  return (
    <svg className="swatch" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill={color} />
    </svg>
  );
}

export default function CategoriesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Category[]>(() => peek<Category[]>("/categories") ?? []);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8fa98a");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api<Category[]>("/categories"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setColor("#8fa98a");
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(editingId ? `/categories/${editingId}` : "/categories", {
        method: editingId ? "PATCH" : "POST",
        body: { name, color },
      });
      resetForm();
      toast.success(editingId ? "Category updated" : "Category added");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this category? Past expenses stay, shown as Uncategorized.")) return;
    try {
      await api(`/categories/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      toast.success("Category deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Categories</h1>
        <span className="muted">{items.length} categories</span>
      </div>

      <form className="card mb-16" onSubmit={save}>
        <h2>{editingId ? "Edit category" : "Add a category"}</h2>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" />
          </div>
          <div className="field field-narrow">
            <label>Colour</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-input" />
          </div>
          <button className="btn btn-primary">{editingId ? "Save" : "Add"}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card table-wrap">
        {items.length === 0 ? (
          <p className="muted">No categories yet.</p>
        ) : (
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Category</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td data-label="Category">
                    <span className="flex-center-gap">
                      <Swatch color={c.color} />
                      {c.name}
                    </span>
                  </td>
                  <td className="text-right nowrap cell-actions">
                    <button className="btn btn-ghost btn-small" onClick={() => startEdit(c)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => remove(c.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
