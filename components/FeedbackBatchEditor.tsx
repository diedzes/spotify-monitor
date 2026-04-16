"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  batchId: string;
  initialName: string;
  initialDescription: string | null;
};

export function FeedbackBatchEditor({ batchId, initialName, initialDescription }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/feedback/batches/${batchId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not update batch");
      setSaving(false);
      return;
    }
    setSaving(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this batch? Linked feedback stays, but without batch link.")) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/feedback/batches/${batchId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not delete batch");
      setSaving(false);
      return;
    }
    router.push("/feedback/batches");
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-2 text-sm font-medium">Edit batch</p>
      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded border px-3 py-2 text-sm" />
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-3 flex justify-between">
        <button type="button" onClick={remove} disabled={saving} className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50">
          Delete batch
        </button>
        <button type="button" onClick={save} disabled={saving} className="rounded bg-[#1DB954] px-3 py-1.5 text-xs text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save batch"}
        </button>
      </div>
    </div>
  );
}
