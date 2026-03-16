"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredSessionId, clearStoredSessionId } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";

const SESSION_HEADER_COOKIE = "spotify_session_s";

function getSessionHeaderValue(sidFromUrl: string | null): string | null {
  if (sidFromUrl) return sidFromUrl;
  const fromStorage = getStoredSessionId();
  if (fromStorage) return fromStorage;
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${SESSION_HEADER_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

type PlaylistRow = {
  id: string;
  name: string;
  ownerName: string;
  trackCount: number;
  lastSyncedAt: string | null;
  spotifyPlaylistId: string;
  isPublic: boolean;
  groups: Array<{ id: string; name: string }>;
};

function getSessionHeaders(sidFromUrl: string | null): HeadersInit {
  const sessionValue = getSessionHeaderValue(sidFromUrl);
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (sessionValue) (headers as Record<string, string>)["X-Spotify-Session"] = sessionValue;
  return headers;
}

type SyncStatusFilter = "all" | "never" | "synced";
type IsPublicFilter = "all" | "public" | "private";
type SortOption =
  | "name_asc"
  | "name_desc"
  | "lastSync_new"
  | "lastSync_old"
  | "tracks_high"
  | "tracks_low";

function filterAndSort(
  playlists: PlaylistRow[],
  search: string,
  filterOwner: string,
  filterGroup: string,
  filterSyncStatus: SyncStatusFilter,
  filterIsPublic: IsPublicFilter,
  sortBy: SortOption
): PlaylistRow[] {
  let list = playlists;

  const searchLower = search.trim().toLowerCase();
  if (searchLower) {
    list = list.filter((p) => p.name.toLowerCase().includes(searchLower) || p.ownerName.toLowerCase().includes(searchLower));
  }
  if (filterOwner) {
    list = list.filter((p) => p.ownerName === filterOwner);
  }
  if (filterGroup) {
    list = list.filter((p) => p.groups.some((g) => g.id === filterGroup));
  }
  if (filterSyncStatus === "never") {
    list = list.filter((p) => p.lastSyncedAt == null);
  } else if (filterSyncStatus === "synced") {
    list = list.filter((p) => p.lastSyncedAt != null);
  }
  if (filterIsPublic === "public") {
    list = list.filter((p) => p.isPublic);
  } else if (filterIsPublic === "private") {
    list = list.filter((p) => !p.isPublic);
  }

  const sorted = [...list].sort((a, b) => {
    switch (sortBy) {
      case "name_asc":
        return a.name.localeCompare(b.name, "nl");
      case "name_desc":
        return b.name.localeCompare(a.name, "nl");
      case "lastSync_new": {
        const ta = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
        const tb = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
        return tb - ta;
      }
      case "lastSync_old": {
        const ta = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
        const tb = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
        return ta - tb;
      }
      case "tracks_high":
        return b.trackCount - a.trackCount;
      case "tracks_low":
        return a.trackCount - b.trackCount;
      default:
        return 0;
    }
  });
  return sorted;
}

function PlaylistsPageContent() {
  const searchParams = useSearchParams();
  const sidFromUrl = searchParams.get("sid");
  const [user, setUser] = useState<{ name: string | null; email: string | null } | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<{
    hint?: string;
    debug?: { hasCookie: boolean; hasHeader: boolean; clientHadSessionCookie?: boolean; hasValidSessionId: boolean; sessionFoundInDb: boolean };
  } | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterSyncStatus, setFilterSyncStatus] = useState<SyncStatusFilter>("all");
  const [filterIsPublic, setFilterIsPublic] = useState<IsPublicFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{ synced: number; failed: number; errors: Array<{ playlistId: string; error: string }> } | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [bulkAddGroupId, setBulkAddGroupId] = useState("");
  const [bulkAddLoading, setBulkAddLoading] = useState(false);
  const [bulkAddResult, setBulkAddResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [bulkSyncLoading, setBulkSyncLoading] = useState(false);
  const [bulkSyncResult, setBulkSyncResult] = useState<{ synced: number; failed: number; errors: string[] } | null>(null);

  const refreshPlaylists = useCallback(() => {
    const h = getSessionHeaders(sidFromUrl);
    (h as Record<string, string>)["X-Debug-Client-Had-Session-Cookie"] = "0";
    return fetch("/api/playlists", { credentials: "include", headers: h })
      .then((res) => res.json())
      .then((data: { playlists?: PlaylistRow[] }) => {
        if (data?.playlists) setPlaylists(data.playlists);
      });
  }, [sidFromUrl]);

  useEffect(() => {
    const sessionValue = getSessionHeaderValue(sidFromUrl);
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (sessionValue) (headers as Record<string, string>)["X-Spotify-Session"] = sessionValue;
    (headers as Record<string, string>)["X-Debug-Client-Had-Session-Cookie"] = sessionValue ? "1" : "0";
    fetch("/api/playlists", { credentials: "include", headers })
      .then((res) => res.json().then((data: unknown) => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status === 401) {
          setAuthError(data as { hint?: string; debug?: { hasCookie: boolean; hasHeader: boolean; hasValidSessionId: boolean; sessionFoundInDb: boolean } });
          setLoading(false);
          return;
        }
        const d = data as { user?: { name: string | null; email: string | null }; playlists?: PlaylistRow[] };
        if (d?.user) {
          setUser(d.user);
          setPlaylists(d.playlists ?? []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sidFromUrl]);

  const filteredPlaylists = useMemo(
    () =>
      filterAndSort(
        playlists,
        filterSearch,
        filterOwner,
        filterGroup,
        filterSyncStatus,
        filterIsPublic,
        sortBy
      ),
    [playlists, filterSearch, filterOwner, filterGroup, filterSyncStatus, filterIsPublic, sortBy]
  );

  const uniqueOwners = useMemo(() => [...new Set(playlists.map((p) => p.ownerName))].sort(), [playlists]);
  const uniqueGroups = useMemo(() => {
    const map = new Map<string, string>();
    playlists.forEach((p) => p.groups.forEach((g) => map.set(g.id, g.name)));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [playlists]);

  const selectAll = useCallback(() => {
    if (selectedIds.size === filteredPlaylists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlaylists.map((p) => p.id)));
    }
  }, [filteredPlaylists, selectedIds.size]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSyncAll = useCallback(async () => {
    setSyncError(null);
    setSyncAllResult(null);
    setSyncAllLoading(true);
    try {
      const res = await fetch("/api/playlists/sync-all", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(sidFromUrl),
      });
      const data = (await res.json()) as { synced?: number; failed?: number; errors?: Array<{ playlistId: string; error: string }>; error?: string };
      if (res.status === 401) return;
      if (!res.ok) {
        setSyncError(typeof data.error === "string" ? data.error : "Sync all mislukt");
        setSyncAllLoading(false);
        return;
      }
      setSyncAllResult({
        synced: data.synced ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors ?? [],
      });
      await refreshPlaylists();
    } catch {
      setSyncError("Sync all mislukt");
    } finally {
      setSyncAllLoading(false);
    }
  }, [sidFromUrl, refreshPlaylists]);

  const handleBulkAddToGroup = useCallback(async () => {
    if (!bulkAddGroupId) return;
    setBulkAddResult(null);
    setBulkAddLoading(true);
    try {
      const res = await fetch("/api/playlists/bulk-add-to-group", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(sidFromUrl),
        body: JSON.stringify({ groupId: bulkAddGroupId, trackedPlaylistIds: Array.from(selectedIds) }),
      });
      const data = (await res.json()) as { added?: number; skipped?: number; errors?: Array<{ error: string }>; error?: string };
      if (res.status === 401) return;
      if (!res.ok) {
        setBulkAddResult({ added: 0, skipped: 0, errors: [typeof data.error === "string" ? data.error : "Mislukt"] });
        setBulkAddLoading(false);
        return;
      }
      setBulkAddResult({
        added: data.added ?? 0,
        skipped: data.skipped ?? 0,
        errors: (data.errors ?? []).map((e) => (typeof e === "string" ? e : e.error)),
      });
      await refreshPlaylists();
    } catch {
      setBulkAddResult({ added: 0, skipped: 0, errors: ["Mislukt"] });
    } finally {
      setBulkAddLoading(false);
    }
  }, [sidFromUrl, bulkAddGroupId, selectedIds, refreshPlaylists]);

  const handleBulkSyncSelected = useCallback(async () => {
    setBulkSyncResult(null);
    setBulkSyncLoading(true);
    const ids = Array.from(selectedIds);
    let synced = 0;
    const errors: string[] = [];
    const headers = getSessionHeaders(sidFromUrl);
    for (const id of ids) {
      try {
        const res = await fetch(`/api/playlists/${id}/sync`, {
          method: "POST",
          credentials: "include",
          headers,
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && data.ok) synced += 1;
        else errors.push(data.error ?? "Sync mislukt");
      } catch {
        errors.push("Sync mislukt");
      }
    }
    setBulkSyncResult({ synced, failed: ids.length - synced, errors });
    setBulkSyncLoading(false);
    await refreshPlaylists();
  }, [sidFromUrl, selectedIds, refreshPlaylists]);

  const openBulkAddModal = useCallback(() => {
    setBulkAddResult(null);
    setBulkAddGroupId("");
    fetch("/api/groups", { credentials: "include", headers: getSessionHeaders(sidFromUrl) })
      .then((res) => res.json())
      .then((data: { groups?: Array<{ id: string; name: string }> }) => {
        setGroups(data.groups ?? []);
        setBulkAddOpen(true);
      });
  }, [sidFromUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
        </div>
      </div>
    );
  }

  if (authError) {
    const d = authError.debug;
    const sessionNotInDb = authError.hint === "session_not_in_db";
    if (sessionNotInDb) clearStoredSessionId();
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="p-6">
        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
          <h1 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            {sessionNotInDb ? "Sessie hoort bij andere omgeving" : "API gaf 401"}
          </h1>
          {sessionNotInDb ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
              Je sessie staat niet in de database van <strong>deze</strong> site.
            </p>
          ) : null}
          {d && (
            <ul className="mt-3 list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
              <li>Cookie bij API: {d.hasCookie ? "ja" : "nee"}</li>
              <li>X-Spotify-Session header: {d.hasHeader ? "ja" : "nee"}</li>
              <li>Sessie in DB: {d.sessionFoundInDb ? "ja" : "nee"}</li>
            </ul>
          )}
          <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-200">
            Ga naar de startpagina en log opnieuw in met Spotify.
          </p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500">
            Naar startpagina
          </Link>
        </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tracked playlists
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncAllLoading || playlists.length === 0}
              onClick={handleSyncAll}
              className="rounded-full bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            >
              {syncAllLoading ? "Sync all…" : "Sync all"}
            </button>
            <Link
              href="/playlists/new"
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760]"
            >
              Add playlist
            </Link>
          </div>
        </div>

        {syncError && <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">{syncError}</p>}
        {syncAllResult && (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              Sync all: {syncAllResult.synced} gesynchroniseerd{syncAllResult.failed > 0 ? `, ${syncAllResult.failed} mislukt` : ""}
            </p>
            {syncAllResult.errors.length > 0 && (
              <ul className="mt-1 list-inside text-zinc-600 dark:text-zinc-400">
                {syncAllResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{playlists.find((x) => x.id === e.playlistId)?.name ?? e.playlistId}: {e.error}</li>
                ))}
                {syncAllResult.errors.length > 5 && <li>… en {syncAllResult.errors.length - 5} meer</li>}
              </ul>
            )}
          </div>
        )}

        {/* Filters & sort */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <input
            type="search"
            placeholder="Zoek op naam of owner…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="min-w-[180px] rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Alle owners</option>
            {uniqueOwners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Alle groepen</option>
            {uniqueGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={filterSyncStatus}
            onChange={(e) => setFilterSyncStatus(e.target.value as SyncStatusFilter)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Sync: alle</option>
            <option value="never">Nooit gesynchroniseerd</option>
            <option value="synced">Ooit gesynchroniseerd</option>
          </select>
          <select
            value={filterIsPublic}
            onChange={(e) => setFilterIsPublic(e.target.value as IsPublicFilter)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Zichtbaarheid: alle</option>
            <option value="public">Openbaar</option>
            <option value="private">Privé</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="name_asc">Sorteer: naam A–Z</option>
            <option value="name_desc">Sorteer: naam Z–A</option>
            <option value="lastSync_new">Sorteer: laatste sync nieuw→oud</option>
            <option value="lastSync_old">Sorteer: laatste sync oud→nieuw</option>
            <option value="tracks_high">Sorteer: tracks hoog→laag</option>
            <option value="tracks_low">Sorteer: tracks laag→hoog</option>
          </select>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/5 px-4 py-3 dark:bg-[#1DB954]/10">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {selectedIds.size} playlist{selectedIds.size !== 1 ? "s" : ""} geselecteerd
            </span>
            <button
              type="button"
              onClick={openBulkAddModal}
              className="rounded-full bg-zinc-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-500 dark:bg-zinc-500 dark:hover:bg-zinc-400"
            >
              Add selected to group
            </button>
            <button
              type="button"
              disabled={bulkSyncLoading}
              onClick={handleBulkSyncSelected}
              className="rounded-full bg-[#1DB954] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
            >
              {bulkSyncLoading ? "Sync selected…" : "Sync selected"}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Selectie wissen
            </button>
          </div>
        )}

        {bulkSyncResult && (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              Sync selected: {bulkSyncResult.synced} gesynchroniseerd, {bulkSyncResult.failed} mislukt
            </p>
            {bulkSyncResult.errors.length > 0 && (
              <ul className="mt-1 list-inside text-zinc-600 dark:text-zinc-400">
                {bulkSyncResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                {bulkSyncResult.errors.length > 5 && <li>… en {bulkSyncResult.errors.length - 5} meer</li>}
              </ul>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="w-10 px-2 py-3">
                  {filteredPlaylists.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredPlaylists.length && filteredPlaylists.length > 0}
                      onChange={selectAll}
                      aria-label="Select all on current page"
                      className="h-4 w-4 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]"
                    />
                  ) : null}
                </th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Naam</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Owner</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Groepen</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Tracks</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Laatste sync</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Acties</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlaylists.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    {playlists.length === 0
                      ? "Nog geen playlists. Klik op \"Add playlist\" om een Spotify playlist toe te voegen."
                      : "Geen playlists voldoen aan de filters."}
                  </td>
                </tr>
              ) : (
                filteredPlaylists.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="w-10 px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Selecteer ${p.name}`}
                        className="h-4 w-4 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                      <Link href={`/playlists/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.ownerName}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.groups.length === 0 ? (
                          <span className="text-zinc-400 dark:text-zinc-500">—</span>
                        ) : (
                          p.groups.map((g) => (
                            <Link
                              key={g.id}
                              href={`/groups/${g.id}`}
                              className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
                            >
                              {g.name}
                            </Link>
                          ))
                        )}
                        <Link
                          href={`/playlists/${p.id}/add-to-group`}
                          className="rounded border border-dashed border-zinc-400 px-2 py-0.5 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-700 dark:border-zinc-500 dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:text-zinc-300"
                        >
                          Add to group
                        </Link>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.trackCount}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(p.lastSyncedAt)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={syncingId === p.id}
                          onClick={async () => {
                            setSyncError(null);
                            setSyncingId(p.id);
                            try {
                              const res = await fetch(`/api/playlists/${p.id}/sync`, {
                                method: "POST",
                                credentials: "include",
                                headers: getSessionHeaders(sidFromUrl),
                              });
                              const data = (await res.json()) as { ok?: boolean; error?: string };
                              if (!res.ok || !data.ok) setSyncError(data.error ?? "Sync mislukt");
                              else await refreshPlaylists();
                            } catch {
                              setSyncError("Sync mislukt");
                            } finally {
                              setSyncingId(null);
                            }
                          }}
                          className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
                        >
                          {syncingId === p.id ? "Sync…" : "Sync now"}
                        </button>
                        <a
                          href={`https://open.spotify.com/playlist/${p.spotifyPlaylistId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1DB954] hover:underline"
                        >
                          Open in Spotify
                        </a>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal: Add selected to group */}
      {bulkAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-add-title">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 id="bulk-add-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Add selected to group
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Kies een groep. Playlists die er al in zitten worden overgeslagen.
            </p>
            {groups.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Je hebt nog geen groepen. Maak eerst een groep aan.</p>
            ) : (
              <>
                <select
                  value={bulkAddGroupId}
                  onChange={(e) => setBulkAddGroupId(e.target.value)}
                  className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">Kies een groep…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {bulkAddResult && (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
                    <p className="text-zinc-900 dark:text-zinc-100">
                      {bulkAddResult.added} toegevoegd, {bulkAddResult.skipped} al in groep
                      {bulkAddResult.errors.length > 0 && `, ${bulkAddResult.errors.length} fout(en)`}
                    </p>
                    {bulkAddResult.errors.length > 0 && (
                      <ul className="mt-1 list-inside text-zinc-600 dark:text-zinc-400">
                        {bulkAddResult.errors.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={bulkAddLoading || groups.length === 0 || !bulkAddGroupId}
                onClick={handleBulkAddToGroup}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
              >
                {bulkAddLoading ? "Bezig…" : "Toevoegen"}
              </button>
              <button
                type="button"
                onClick={() => { setBulkAddOpen(false); setBulkAddResult(null); clearSelection(); }}
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaylistsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
        </div>
      }
    >
      <PlaylistsPageContent />
    </Suspense>
  );
}
