"use client";

import { useMemo, useState } from "react";

type FeedItem = any;

function truncate(text: string, len = 160) {
  return text.length <= len ? text : `${text.slice(0, len)}...`;
}

function artistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter(Boolean).join(", ");
  } catch {
    return "Unknown";
  }
}

export function FeedbackFeedClient({ initialFeed }: { initialFeed: FeedItem[] }) {
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [trackDetail, setTrackDetail] = useState<any | null>(null);
  const [entryDetail, setEntryDetail] = useState<any | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [trackCache, setTrackCache] = useState<Record<string, any>>({});
  const [entryCache, setEntryCache] = useState<Record<string, any>>({});
  const [editText, setEditText] = useState("");
  const [editAt, setEditAt] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function openTrack(trackId: string) {
    setModalError(null);
    const cached = trackCache[trackId];
    if (cached) {
      setTrackDetail(cached);
      return;
    }
    setTrackLoading(true);
    const res = await fetch(`/api/feedback/track?spotifyTrackId=${encodeURIComponent(trackId)}`, { credentials: "include" });
    const detail = await res.json();
    setTrackCache((prev) => ({ ...prev, [trackId]: detail }));
    setTrackDetail(detail);
    setTrackLoading(false);
  }

  async function openEntry(id: string) {
    setModalError(null);
    const cached = entryCache[id];
    if (cached) {
      setEntryDetail(cached);
      setEditText(cached.feedbackText ?? "");
      setEditAt(new Date(cached.feedbackAt).toISOString().slice(0, 16));
      return;
    }
    setEntryLoading(true);
    const res = await fetch(`/api/feedback/${id}`, { credentials: "include" });
    const data = await res.json();
    const detail = data.entry ?? null;
    if (detail) {
      setEntryCache((prev) => ({ ...prev, [id]: detail }));
      setEntryDetail(detail);
      setEditText(detail.feedbackText ?? "");
      setEditAt(new Date(detail.feedbackAt).toISOString().slice(0, 16));
    }
    setEntryLoading(false);
  }

  async function saveEntryEdit() {
    if (!entryDetail) return;
    setSaving(true);
    setModalError(null);
    const res = await fetch(`/api/feedback/${entryDetail.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedbackText: editText,
        feedbackAt: new Date(editAt).toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setModalError(data.error ?? "Could not save changes");
      setSaving(false);
      return;
    }
    const updated = data.entry;
    setEntryDetail(updated);
    setEntryCache((prev) => ({ ...prev, [updated.id]: updated }));
    setFeed((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    setSaving(false);
  }

  async function deleteEntry() {
    if (!entryDetail) return;
    setSaving(true);
    setModalError(null);
    const res = await fetch(`/api/feedback/${entryDetail.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setModalError(data.error ?? "Could not delete feedback");
      setSaving(false);
      return;
    }
    setFeed((prev) => prev.filter((it) => it.id !== entryDetail.id));
    setEntryDetail(null);
    setSaving(false);
  }

  const shownFeed = useMemo(() => feed, [feed]);

  return (
    <>
      <div className="space-y-3">
        {shownFeed.map((item) => {
          const isBatch = Boolean(item.feedbackBatch);
          const firstTrack = isBatch ? item.feedbackBatch.tracks[0] : item.tracks[0];
          return (
            <article key={item.id} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-1 flex items-center justify-between gap-2">
                <button onClick={() => openEntry(item.id)} className="text-left text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                  {isBatch ? item.feedbackBatch.name : `${firstTrack?.title ?? "Track"} - ${artistsLabel(firstTrack?.artistsJson ?? "[]")}`}
                </button>
                <span className="text-xs text-zinc-500">{new Date(item.feedbackAt).toLocaleString("en-GB")}</span>
              </div>
              {isBatch ? <p className="mb-1 text-xs font-medium text-emerald-600">Batch feedback ({item.feedbackBatch.tracks.length} tracks)</p> : null}
              <p className="mb-1 text-xs text-zinc-500">
                {item.contact?.fullName ?? "No contact"}{item.contact?.organization?.name ? ` - ${item.contact.organization.name}` : ""}
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{truncate(item.feedbackText)}</p>
              {firstTrack?.spotifyTrackId ? (
                <button onClick={() => openTrack(firstTrack.spotifyTrackId)} className="mt-2 text-xs text-[#1DB954] hover:underline">
                  Open track detail
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      {trackLoading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 text-sm dark:bg-zinc-900">Loading track detail...</div>
        </div>
      ) : null}

      {trackDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setTrackDetail(null)}>
          <div className="max-h-[82vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Track detail</h3>
            <p className="text-sm">{trackDetail.track?.title ?? "Unknown"} - {artistsLabel(trackDetail.track?.artistsJson ?? "[]")}</p>
            <h4 className="mt-4 text-sm font-semibold">Feedback</h4>
            <div className="space-y-2">
              {(trackDetail.feedback ?? []).map((f: any) => (
                <div key={f.id} className="rounded border p-2 text-sm">
                  <p>{truncate(f.feedbackText, 220)}</p>
                  {f.feedbackBatch ? <p className="text-xs text-emerald-600">Shared feedback: {f.feedbackBatch.name}</p> : null}
                </div>
              ))}
            </div>
            <h4 className="mt-4 text-sm font-semibold">Hitlist context</h4>
            <ul className="list-disc pl-5 text-sm">
              {(trackDetail.hitlist ?? []).map((h: any, i: number) => (
                <li key={`${h.playlistName}-${i}`}>{h.playlistName} (added: {new Date(h.addedAt).toLocaleDateString("en-GB")})</li>
              ))}
            </ul>
            {(trackDetail.recentRemoved ?? []).length > 0 ? (
              <>
                <h4 className="mt-4 text-sm font-semibold">Recent removed (14 days)</h4>
                <ul className="list-disc pl-5 text-sm">
                  {(trackDetail.recentRemoved ?? []).map((h: any, i: number) => (
                    <li key={`${h.playlistName}-rm-${i}`}>{h.playlistName} (removed: {h.removedAt ? new Date(h.removedAt).toLocaleDateString("en-GB") : "unknown"})</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {entryLoading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 text-sm dark:bg-zinc-900">Loading feedback detail...</div>
        </div>
      ) : null}

      {entryDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEntryDetail(null)}>
          <div className="max-h-[82vh] w-full max-w-xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Feedback detail</h3>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={6} className="mt-2 w-full rounded border px-2 py-2 text-sm" />
            <input type="datetime-local" value={editAt} onChange={(e) => setEditAt(e.target.value)} className="mt-2 w-full rounded border px-2 py-2 text-sm" />
            <p className="mt-2 text-xs text-zinc-500">{entryDetail.contact?.fullName ?? "No contact"} - {new Date(entryDetail.feedbackAt).toLocaleString("en-GB")}</p>
            {entryDetail.feedbackBatch ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-emerald-600">Batch: {entryDetail.feedbackBatch.name}</p>
                <ul className="list-disc pl-5 text-sm">
                  {entryDetail.feedbackBatch.tracks.map((t: any) => <li key={t.id}>{t.title}</li>)}
                </ul>
              </div>
            ) : null}
            {modalError ? <p className="mt-2 text-xs text-red-600">{modalError}</p> : null}
            <div className="mt-4 flex justify-between gap-2">
              <button type="button" onClick={deleteEntry} disabled={saving} className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50">
                Delete
              </button>
              <button type="button" onClick={saveEntryEdit} disabled={saving} className="rounded bg-[#1DB954] px-3 py-1.5 text-xs text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
