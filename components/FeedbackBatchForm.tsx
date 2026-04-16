"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Track = { spotifyTrackId: string; title: string; artistsJson: string; spotifyUrl: string | null };

function artistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter(Boolean).join(", ");
  } catch {
    return "Unknown";
  }
}

export function FeedbackBatchForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selected, setSelected] = useState<Record<string, Track>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/feedback/main-tracks?query=${encodeURIComponent(query)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks ?? []));
  }, [query]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      description,
      tracks: Object.values(selected).map((t, index) => ({ ...t, orderIndex: index })),
    };
    const res = await fetch("/api/feedback/batches", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create batch");
      return;
    }
    router.push(`/feedback/batches/${data.batch.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Batch name" className="w-full rounded border px-3 py-2 text-sm" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className="w-full rounded border px-3 py-2 text-sm" />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tracks from Main Playlists" className="w-full rounded border px-3 py-2 text-sm" />
      <div className="max-h-72 overflow-auto rounded border">
        {tracks.map((t) => {
          const checked = Boolean(selected[t.spotifyTrackId]);
          return (
            <label key={t.spotifyTrackId} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = { ...prev };
                    if (e.target.checked) next[t.spotifyTrackId] = t;
                    else delete next[t.spotifyTrackId];
                    return next;
                  });
                }}
              />
              <span>{t.title} - {artistsLabel(t.artistsJson)}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">{Object.keys(selected).length} tracks selected</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" className="rounded bg-[#1DB954] px-4 py-2 text-sm font-medium text-white">Create batch</button>
    </form>
  );
}
