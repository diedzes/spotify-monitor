"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { formatArtistsLabel, spotifyTrackHref } from "@/lib/hitlist";

export type HitlistTableRow = {
  key: string;
  title: string;
  artistsJson: string;
  spotifyTrackId: string;
  firstDetectedAt: string;
  lastSeenAt: string;
  activePlaylistCount: number;
  playlistPresences: Array<{
    playlistId: string;
    playlistName: string;
    addedAt: string;
    removedAt: string | null;
    isActive: boolean;
  }>;
};

type SortKey = "title" | "artists" | "playlistedAt" | "firstAdded" | "lastSeen";

type Props = {
  rows: HitlistTableRow[];
  signedId: string | null;
  initialOpenKey?: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function HitlistTable({ rows, signedId, initialOpenKey = null }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("firstAdded");
  const [sortAsc, setSortAsc] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(initialOpenKey);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title, "en");
      if (sortKey === "artists") cmp = formatArtistsLabel(a.artistsJson).localeCompare(formatArtistsLabel(b.artistsJson), "en");
      if (sortKey === "playlistedAt") cmp = a.activePlaylistCount - b.activePlaylistCount;
      if (sortKey === "firstAdded") cmp = new Date(a.firstDetectedAt).getTime() - new Date(b.firstDetectedAt).getTime();
      if (sortKey === "lastSeen") cmp = new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, sortAsc]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(k === "title" || k === "artists");
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("artists")} className="hover:underline">Artists</button>
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("title")} className="hover:underline">Title</button>
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("playlistedAt")} className="hover:underline">Playlisted at</button>
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("firstAdded")} className="hover:underline">First added</button>
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("lastSeen")} className="hover:underline">Last seen</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const active = row.playlistPresences.filter((p) => p.isActive);
            const show = active.slice(0, 3);
            const more = active.length - show.length;
            const trackHref = spotifyTrackHref(row.spotifyTrackId);
            const isOpen = openKey === row.key;
            return (
              <Fragment key={row.key}>
                <tr key={row.key} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatArtistsLabel(row.artistsJson)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setOpenKey((k) => (k === row.key ? null : row.key))}
                      className="text-left font-medium text-[#1DB954] hover:underline"
                    >
                      {row.title}
                    </button>
                    {trackHref ? (
                      <a href={trackHref} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-zinc-500 hover:underline">
                        Spotify
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {show.map((p, idx) => {
                      const href = signedId ? `/playlists/${p.playlistId}?sid=${encodeURIComponent(signedId)}` : `/playlists/${p.playlistId}`;
                      return (
                        <span key={p.playlistId}>
                          {idx > 0 ? ", " : ""}
                          <Link href={href} className="text-[#1DB954] hover:underline">{p.playlistName}</Link>
                        </span>
                      );
                    })}
                    {more > 0 ? ` +${more}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">{fmt(row.firstDetectedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">{fmt(row.lastSeenAt)}</td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Playlist history for this title
                      </div>
                      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
                        <table className="w-full min-w-[760px] text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-700">
                              <th className="px-2 py-1.5 text-left">Playlist</th>
                              <th className="px-2 py-1.5 text-left">Added at</th>
                              <th className="px-2 py-1.5 text-left">Removed at</th>
                              <th className="px-2 py-1.5 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.playlistPresences.map((p) => {
                              const href = signedId ? `/playlists/${p.playlistId}?sid=${encodeURIComponent(signedId)}` : `/playlists/${p.playlistId}`;
                              return (
                                <tr key={p.playlistId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                                  <td className="px-2 py-1.5">
                                    <Link href={href} className="text-[#1DB954] hover:underline">{p.playlistName}</Link>
                                  </td>
                                  <td className="px-2 py-1.5">{fmt(p.addedAt)}</td>
                                  <td className="px-2 py-1.5">{fmt(p.removedAt)}</td>
                                  <td className="px-2 py-1.5">{p.isActive ? "Active" : "Removed"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
