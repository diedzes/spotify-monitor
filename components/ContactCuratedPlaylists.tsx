"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type CuratedPlaylistOption = {
  id: string;
  name: string;
  ownerName: string;
  imageUrl: string | null;
};

type Props = {
  contactId: string;
  playlists: CuratedPlaylistOption[];
  sessionHeaders: HeadersInit;
  onChange: (playlists: CuratedPlaylistOption[]) => void;
};

export function ContactCuratedPlaylists({ contactId, playlists, sessionHeaders, onChange }: Props) {
  const [allPlaylists, setAllPlaylists] = useState<CuratedPlaylistOption[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/playlists", { credentials: "include", headers: sessionHeaders })
      .then(async (res) => {
        if (!res.ok) return;
        const d = (await res.json()) as { playlists?: Array<{ id: string; name: string; ownerName: string; imageUrl?: string | null }> };
        setAllPlaylists(
          (d.playlists ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            ownerName: p.ownerName,
            imageUrl: p.imageUrl ?? null,
          }))
        );
      })
      .catch(() => {
        // linker stays usable with already-linked playlists
      });
    // sessionHeaders is rebuilt each render; load tracked playlists once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedIds = useMemo(() => new Set(playlists.map((p) => p.id)), [playlists]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allPlaylists
      .filter((p) => !linkedIds.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allPlaylists, linkedIds, query]);

  async function linkPlaylist(trackedPlaylistId: string) {
    setError(null);
    setBusyId(trackedPlaylistId);
    try {
      const res = await fetch(`/api/contacts/${contactId}/playlists`, {
        method: "POST",
        credentials: "include",
        headers: sessionHeaders,
        body: JSON.stringify({ trackedPlaylistId }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string; contact?: { curatedPlaylists?: CuratedPlaylistOption[] } };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not link playlist");
      onChange(d.contact?.curatedPlaylists ?? []);
      setQuery("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link playlist");
    } finally {
      setBusyId(null);
    }
  }

  async function unlinkPlaylist(trackedPlaylistId: string) {
    setError(null);
    setBusyId(trackedPlaylistId);
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/playlists?trackedPlaylistId=${encodeURIComponent(trackedPlaylistId)}`,
        { method: "DELETE", credentials: "include", headers: sessionHeaders }
      );
      const d = (await res.json()) as { ok?: boolean; error?: string; contact?: { curatedPlaylists?: CuratedPlaylistOption[] } };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not unlink playlist");
      onChange(d.contact?.curatedPlaylists ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlink playlist");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Curated playlists</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Link playlists this contact curates. The same person can curate more than one playlist.
      </p>

      <div className="relative mt-4">
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Add playlist</label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracked playlists…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
        />
        {matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void linkPlaylist(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
                    <span className="ml-2 text-zinc-500">{p.ownerName}</span>
                  </span>
                  <span className="text-xs text-[#1DB954]">{busyId === p.id ? "Linking…" : "Link"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {query.trim() && matches.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-500">No unmatched playlists for this search.</p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      {playlists.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No playlists linked yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {playlists.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link href={`/playlists/${p.id}`} className="min-w-0 font-medium text-[#1DB954] hover:underline">
                {p.name}
                <span className="ml-2 font-normal text-zinc-500">{p.ownerName}</span>
              </Link>
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => void unlinkPlaylist(p.id)}
                className="shrink-0 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
              >
                {busyId === p.id ? "Removing…" : "Unlink"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
