"use client";

import { useState } from "react";

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
  const [trackDetail, setTrackDetail] = useState<any | null>(null);
  const [entryDetail, setEntryDetail] = useState<any | null>(null);

  async function openTrack(trackId: string) {
    const res = await fetch(`/api/feedback/track?spotifyTrackId=${encodeURIComponent(trackId)}`, { credentials: "include" });
    setTrackDetail(await res.json());
  }

  async function openEntry(id: string) {
    const res = await fetch(`/api/feedback/${id}`, { credentials: "include" });
    const data = await res.json();
    setEntryDetail(data.entry ?? null);
  }

  return (
    <>
      <div className="space-y-3">
        {initialFeed.map((item) => {
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

      {trackDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setTrackDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      ) : null}

      {entryDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEntryDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Feedback detail</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">{entryDetail.feedbackText}</p>
            <p className="mt-2 text-xs text-zinc-500">{entryDetail.contact?.fullName ?? "No contact"} - {new Date(entryDetail.feedbackAt).toLocaleString("en-GB")}</p>
            {entryDetail.feedbackBatch ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-emerald-600">Batch: {entryDetail.feedbackBatch.name}</p>
                <ul className="list-disc pl-5 text-sm">
                  {entryDetail.feedbackBatch.tracks.map((t: any) => <li key={t.id}>{t.title}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
