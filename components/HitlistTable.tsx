"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatArtistsLabel, spotifyTrackHref } from "@/lib/hitlist";

export type HitlistTableRow = {
  id: string;
  title: string;
  artistsJson: string;
  spotifyTrackId: string;
  playlistId: string;
  playlistName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  removedAt: string | null;
  isActive: boolean;
};

type SortKey = "artists" | "title" | "playlist" | "firstSeen" | "lastSeen";

type Props = {
  rows: HitlistTableRow[];
  signedId: string | null;
  /** Playlists in the "Owned" group — hidden when hideOwned is on. */
  ownedPlaylistIds?: string[];
};

function filterRowsHideOwned(rows: HitlistTableRow[], ownedIds: Set<string>, hide: boolean): HitlistTableRow[] {
  if (!hide || ownedIds.size === 0) return rows;
  return rows.filter((row) => !ownedIds.has(row.playlistId));
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function dateText(iso: string): string {
  return fmt(iso).toLowerCase();
}

function matches(value: string, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  return q.length === 0 || value.toLowerCase().includes(q);
}

export function HitlistTable({ rows, signedId, ownedPlaylistIds = [] }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("firstSeen");
  const [sortAsc, setSortAsc] = useState(true);
  const [hideOwned, setHideOwned] = useState(true);
  const [onlyActive, setOnlyActive] = useState(false);
  const [filters, setFilters] = useState<Record<SortKey, string>>({
    artists: "",
    title: "",
    playlist: "",
    firstSeen: "",
    lastSeen: "",
  });

  const ownedIds = useMemo(() => new Set(ownedPlaylistIds), [ownedPlaylistIds]);

  const visibleRows = useMemo(
    () => {
      let out = filterRowsHideOwned(rows, ownedIds, hideOwned);
      if (onlyActive) out = out.filter((row) => row.isActive);
      out = out.filter((row) => {
        const artists = formatArtistsLabel(row.artistsJson);
        const lastSeenText = [
          dateText(row.lastSeenAt),
          row.isActive ? "active" : "inactive removed niet meer actief",
          row.removedAt ? dateText(row.removedAt) : "",
        ].join(" ");
        return (
          matches(artists, filters.artists) &&
          matches(row.title, filters.title) &&
          matches(row.playlistName, filters.playlist) &&
          matches(dateText(row.firstSeenAt), filters.firstSeen) &&
          matches(lastSeenText, filters.lastSeen)
        );
      });
      return out;
    },
    [rows, ownedIds, hideOwned, onlyActive, filters]
  );

  const sorted = useMemo(() => {
    const out = [...visibleRows];
    out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title, "en");
      if (sortKey === "artists") cmp = formatArtistsLabel(a.artistsJson).localeCompare(formatArtistsLabel(b.artistsJson), "en");
      if (sortKey === "playlist") cmp = a.playlistName.localeCompare(b.playlistName, "en");
      if (sortKey === "firstSeen") cmp = new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime();
      if (sortKey === "lastSeen") cmp = new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return out;
  }, [visibleRows, sortKey, sortAsc]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(k === "artists" || k === "title" || k === "playlist" || k === "firstSeen");
    }
  };

  const ownedHiddenCount = hideOwned && ownedIds.size > 0 ? rows.filter((row) => ownedIds.has(row.playlistId)).length : 0;
  const inactiveCount = rows.filter((row) => !row.isActive).length;
  const sortMark = (k: SortKey) => (sortKey === k ? (sortAsc ? " asc" : " desc") : "");
  const filterInput = (k: SortKey, label: string) => (
    <input
      value={filters[k]}
      onChange={(e) => setFilters((prev) => ({ ...prev, [k]: e.target.value }))}
      placeholder={label}
      className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-normal text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {ownedIds.size > 0 ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={hideOwned}
              onChange={(e) => setHideOwned(e.target.checked)}
              className="rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954] dark:border-zinc-600"
            />
            Hide matches on playlists in group <strong>Owned</strong>
          </label>
        ) : null}
        <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954] dark:border-zinc-600"
          />
          Alleen hits die bij de laatste check nog op de playlist stonden
        </label>
        <span className="text-zinc-500 dark:text-zinc-400">
          {visibleRows.length} hit{visibleRows.length === 1 ? "" : "s"}
          {ownedHiddenCount > 0 ? ` (${ownedHiddenCount} owned hidden)` : ""}
          {onlyActive && inactiveCount > 0 ? ` (${inactiveCount} inactive hidden)` : ""}
        </span>
      </div>
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("artists")} className="hover:underline">Artist{sortMark("artists")}</button>
              {filterInput("artists", "Filter artist")}
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("title")} className="hover:underline">Title{sortMark("title")}</button>
              {filterInput("title", "Filter title")}
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("playlist")} className="hover:underline">Playlist{sortMark("playlist")}</button>
              {filterInput("playlist", "Filter playlist")}
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("firstSeen")} className="hover:underline">First Seen{sortMark("firstSeen")}</button>
              {filterInput("firstSeen", "Filter date")}
            </th>
            <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
              <button type="button" onClick={() => setSort("lastSeen")} className="hover:underline">Last Seen{sortMark("lastSeen")}</button>
              {filterInput("lastSeen", "Filter date")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const trackHref = spotifyTrackHref(row.spotifyTrackId);
            const playlistHref = signedId ? `/playlists/${row.playlistId}?sid=${encodeURIComponent(signedId)}` : `/playlists/${row.playlistId}`;
            return (
              <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatArtistsLabel(row.artistsJson)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                    {trackHref ? (
                      <a href={trackHref} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-zinc-500 hover:underline">
                        Spotify
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    <Link href={playlistHref} className="text-[#1DB954] hover:underline">{row.playlistName}</Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">{fmt(row.firstSeenAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    <div>{fmt(row.lastSeenAt)}</div>
                    {!row.isActive ? (
                      <div className="text-xs text-amber-700 dark:text-amber-300">
                        Niet meer actief{row.removedAt ? ` sinds ${fmt(row.removedAt)}` : ""}
                      </div>
                    ) : null}
                  </td>
                </tr>
            );
          })}
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-zinc-500 dark:text-zinc-400">
                Geen hits gevonden met deze filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
    </div>
  );
}
