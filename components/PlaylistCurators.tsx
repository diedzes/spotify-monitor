"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type PlaylistCurator = {
  id: string;
  fullName: string;
  organizationName?: string | null;
};

type ContactOption = { id: string; fullName: string; organizationName: string | null };

type Props = {
  playlistId: string;
  curators: PlaylistCurator[];
  sessionHeaders: HeadersInit;
  onChange: (curators: PlaylistCurator[]) => void;
};

export function PlaylistCurators({ playlistId, curators, sessionHeaders, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetch(`/api/contacts?query=${encodeURIComponent(q)}&limit=20`, {
        credentials: "include",
        headers: sessionHeaders,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const d = (await res.json()) as { contacts?: ContactOption[] };
          setResults(d.contacts ?? []);
        })
        .catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(t);
    // sessionHeaders is rebuilt each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const linkedIds = useMemo(() => new Set(curators.map((c) => c.id)), [curators]);
  const matches = results.filter((c) => !linkedIds.has(c.id)).slice(0, 8);

  async function linkContact(contactId: string) {
    setError(null);
    setBusyId(contactId);
    try {
      const res = await fetch(`/api/contacts/${contactId}/playlists`, {
        method: "POST",
        credentials: "include",
        headers: sessionHeaders,
        body: JSON.stringify({ trackedPlaylistId: playlistId }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not link contact");
      const contact = results.find((c) => c.id === contactId);
      if (contact) {
        onChange([...curators, { id: contact.id, fullName: contact.fullName, organizationName: contact.organizationName }]);
      }
      setQuery("");
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link contact");
    } finally {
      setBusyId(null);
    }
  }

  async function unlinkContact(contactId: string) {
    setError(null);
    setBusyId(contactId);
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/playlists?trackedPlaylistId=${encodeURIComponent(playlistId)}`,
        { method: "DELETE", credentials: "include", headers: sessionHeaders }
      );
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not unlink contact");
      onChange(curators.filter((c) => c.id !== contactId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlink contact");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Curator</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        The contact who curates this playlist. Link from here or from the contact page.
      </p>

      <div className="relative mt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts to link…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
        />
        {matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void linkContact(c.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  <span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.fullName}</span>
                    {c.organizationName ? <span className="ml-2 text-zinc-500">{c.organizationName}</span> : null}
                  </span>
                  <span className="text-xs text-[#1DB954]">{busyId === c.id ? "Linking…" : "Link"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      {curators.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No curator linked yet.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {curators.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800/60"
            >
              <Link href={`/contacts/${c.id}`} className="font-medium text-[#1DB954] hover:underline">
                {c.fullName}
              </Link>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => void unlinkContact(c.id)}
                className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
                aria-label={`Unlink ${c.fullName}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
