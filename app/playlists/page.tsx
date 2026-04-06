"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredSessionId, clearStoredSessionId } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";
import { GroupChip } from "@/components/GroupChip";

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
  return new Intl.DateTimeFormat("en-GB", {
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
  inHitlistMainGroup: boolean;
  excludeFromHitlist: boolean;
  groups: Array<{ id: string; name: string; color: string; isMainGroup: boolean }>;
};

function getSessionHeaders(sidFromUrl: string | null): HeadersInit {
  const sessionValue = getSessionHeaderValue(sidFromUrl);
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (sessionValue) (headers as Record<string, string>)["X-Spotify-Session"] = sessionValue;
  return headers;
}

type SyncStatusFilter = "all" | "never" | "synced";
type IsPublicFilter = "all" | "public" | "private";
type HitlistMainFilter = "all" | "inMain" | "notInMain";
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
  filterHitlistMain: HitlistMainFilter,
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
  if (filterHitlistMain === "inMain") {
    list = list.filter((p) => p.inHitlistMainGroup);
  } else if (filterHitlistMain === "notInMain") {
    list = list.filter((p) => !p.inHitlistMainGroup);
  }

  const sorted = [...list].sort((a, b) => {
    switch (sortBy) {
      case "name_asc":
        return a.name.localeCompare(b.name, "en");
      case "name_desc":
        return b.name.localeCompare(a.name, "en");
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

function formatHitlistSummary(
  newM: number,
  removed: number,
  sample?: Array<{ title: string; artistLabel: string; playlistName: string }>
): string | null {
  if (newM === 0 && removed === 0) return null;
  const parts: string[] = [];
  if (newM > 0) parts.push(`${newM} new hitlist match${newM === 1 ? "" : "es"} found`);
  if (removed > 0) parts.push(`${removed} match${removed === 1 ? "" : "es"} removed`);
  let s = parts.join(" · ");
  if (sample && sample.length > 0 && newM > 0) {
    const bits = sample.slice(0, 3).map((x) => `${x.title} → ${x.playlistName}`);
    s += ` — ${bits.join("; ")}`;
  }
  return s;
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
  const [filterHitlistMain, setFilterHitlistMain] = useState<HitlistMainFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{ synced: number; failed: number; errors: Array<{ playlistId: string; error: string }> } | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; color: string; isMainGroup?: boolean }>>([]);
  const [bulkAddGroupId, setBulkAddGroupId] = useState("");
  const [bulkAddNewGroupName, setBulkAddNewGroupName] = useState("");
  const [bulkAddLoading, setBulkAddLoading] = useState(false);
  const [bulkAddResult, setBulkAddResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [bulkSyncLoading, setBulkSyncLoading] = useState(false);
  const [bulkSyncResult, setBulkSyncResult] = useState<{ synced: number; failed: number; errors: string[] } | null>(null);
  const [hitlistNotice, setHitlistNotice] = useState<string | null>(null);
  const [hitlistMainGroup, setHitlistMainGroup] = useState<{ id: string; name: string; color: string } | null>(null);
  const [mainToggleLoading, setMainToggleLoading] = useState<string | null>(null);
  const [excludeToggleLoading, setExcludeToggleLoading] = useState<string | null>(null);
  const [bulkMainLoading, setBulkMainLoading] = useState(false);

  const refreshPlaylists = useCallback(() => {
    const h = getSessionHeaders(sidFromUrl);
    (h as Record<string, string>)["X-Debug-Client-Had-Session-Cookie"] = "0";
    return fetch("/api/playlists", { credentials: "include", headers: h })
      .then((res) => res.json())
      .then(
        (data: {
          playlists?: PlaylistRow[];
          hitlistMainGroup?: { id: string; name: string; color: string } | null;
        }) => {
          if (data.hitlistMainGroup !== undefined) setHitlistMainGroup(data.hitlistMainGroup);
          if (data?.playlists)
            setPlaylists(
              data.playlists.map((p) => ({
                ...p,
                inHitlistMainGroup: !!p.inHitlistMainGroup,
                excludeFromHitlist: !!p.excludeFromHitlist,
                groups: (p.groups ?? []).map((g) => ({
                  ...g,
                  color: (g as { color?: string }).color ?? "#71717a",
                  isMainGroup: !!(g as { isMainGroup?: boolean }).isMainGroup,
                })),
              }))
            );
        }
      );
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
        const d = data as {
          user?: { name: string | null; email: string | null };
          playlists?: PlaylistRow[];
          hitlistMainGroup?: { id: string; name: string; color: string } | null;
        };
        if (d?.user) {
          setUser(d.user);
          if (d.hitlistMainGroup !== undefined) setHitlistMainGroup(d.hitlistMainGroup);
          setPlaylists(
            (d.playlists ?? []).map((p) => ({
              ...p,
              inHitlistMainGroup: !!(p as PlaylistRow).inHitlistMainGroup,
              excludeFromHitlist: !!(p as PlaylistRow).excludeFromHitlist,
              groups: ((p as PlaylistRow).groups ?? []).map((g) => ({
                ...g,
                color: g.color ?? "#71717a",
                isMainGroup: !!g.isMainGroup,
              })),
            }))
          );
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
        filterHitlistMain,
        sortBy
      ),
    [playlists, filterSearch, filterOwner, filterGroup, filterSyncStatus, filterIsPublic, filterHitlistMain, sortBy]
  );

  const uniqueOwners = useMemo(() => [...new Set(playlists.map((p) => p.ownerName))].sort(), [playlists]);
  const uniqueGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    playlists.forEach((p) =>
      p.groups.forEach((g) => map.set(g.id, { id: g.id, name: g.name, color: g.color }))
    );
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
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
    setHitlistNotice(null);
    setSyncAllLoading(true);
    try {
      const res = await fetch("/api/playlists/sync-all", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(sidFromUrl),
      });
      const data = (await res.json()) as {
        synced?: number;
        failed?: number;
        errors?: Array<{ playlistId: string; error: string }>;
        error?: string;
        hitlistNewMatches?: number;
        hitlistRemovedMatches?: number;
        hitlistSampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
      };
      if (res.status === 401) return;
      if (!res.ok) {
        setSyncError(typeof data.error === "string" ? data.error : "Sync all failed");
        setSyncAllLoading(false);
        return;
      }
      setSyncAllResult({
        synced: data.synced ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors ?? [],
      });
      const hl = formatHitlistSummary(
        data.hitlistNewMatches ?? 0,
        data.hitlistRemovedMatches ?? 0,
        data.hitlistSampleNew
      );
      setHitlistNotice(hl);
      await refreshPlaylists();
    } catch {
      setSyncError("Sync all failed");
    } finally {
      setSyncAllLoading(false);
    }
  }, [sidFromUrl, refreshPlaylists]);

  const handleBulkAddToGroup = useCallback(async () => {
    const newName = bulkAddNewGroupName.trim();
    let groupId = bulkAddGroupId;
    if (newName) {
      setBulkAddResult(null);
      setBulkAddLoading(true);
      try {
        const createRes = await fetch("/api/groups", {
          method: "POST",
          credentials: "include",
          headers: getSessionHeaders(sidFromUrl),
          body: JSON.stringify({ name: newName }),
        });
        const createData = (await createRes.json()) as {
          ok?: boolean;
          group?: { id: string; name: string; color: string };
          error?: string;
        };
        if (createRes.status === 401) return;
        if (!createRes.ok || !createData.group) {
          setBulkAddResult({
            added: 0,
            skipped: 0,
            errors: [typeof createData.error === "string" ? createData.error : "Could not create group"],
          });
          setBulkAddLoading(false);
          return;
        }
        groupId = createData.group.id;
        setGroups((prev) => [
          ...prev,
          {
            id: createData.group!.id,
            name: createData.group!.name,
            color: createData.group!.color ?? "#71717a",
          },
        ]);
      } catch {
        setBulkAddResult({ added: 0, skipped: 0, errors: ["Could not create group"] });
        setBulkAddLoading(false);
        return;
      }
    }
    if (!groupId) return;
    if (!newName) {
      setBulkAddResult(null);
      setBulkAddLoading(true);
    }
    try {
      const res = await fetch("/api/playlists/bulk-add-to-group", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(sidFromUrl),
        body: JSON.stringify({ groupId, trackedPlaylistIds: Array.from(selectedIds) }),
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
  }, [sidFromUrl, bulkAddGroupId, bulkAddNewGroupName, selectedIds, refreshPlaylists]);

  const handleBulkSyncSelected = useCallback(async () => {
    setBulkSyncResult(null);
    setHitlistNotice(null);
    setBulkSyncLoading(true);
    const ids = Array.from(selectedIds);
    let synced = 0;
    const errors: string[] = [];
    const headers = getSessionHeaders(sidFromUrl);
    for (const id of ids) {
      try {
        const res = await fetch(`/api/playlists/${id}/sync?deferHitlist=1`, {
          method: "POST",
          credentials: "include",
          headers,
        });
        const data = (await res.json()) as { ok?: boolean; error?: string; changed?: boolean };
        if (res.ok && data.ok) {
          synced += 1;
        } else errors.push(data.error ?? "Sync failed");
      } catch {
        errors.push("Sync failed");
      }
    }
    setBulkSyncResult({ synced, failed: ids.length - synced, errors });
    setBulkSyncLoading(false);
    await refreshPlaylists();
    if (synced > 0) {
      try {
        const r = await fetch("/api/hitlist/rebuild", {
          method: "POST",
          credentials: "include",
          headers: getSessionHeaders(sidFromUrl),
        });
        const hit = (await r.json()) as {
          ok?: boolean;
          newMatches?: number;
          removedMatches?: number;
          sampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
        };
        if (r.ok && hit.ok) {
          const hl = formatHitlistSummary(hit.newMatches ?? 0, hit.removedMatches ?? 0, hit.sampleNew);
          setHitlistNotice(hl);
        }
      } catch {
        /* ignore */
      }
    }
  }, [sidFromUrl, selectedIds, refreshPlaylists]);

  const toggleHitlistMainGroup = useCallback(
    async (playlistId: string, inGroup: boolean) => {
      setHitlistNotice(null);
      setMainToggleLoading(playlistId);
      try {
        const res = await fetch(`/api/playlists/${playlistId}`, {
          method: "PATCH",
          credentials: "include",
          headers: getSessionHeaders(sidFromUrl),
          body: JSON.stringify({ inHitlistMainGroup: inGroup }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          hitlistNewMatches?: number;
          hitlistRemovedMatches?: number;
          hitlistSampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
          hitlistMainGroupId?: string;
        };
        if (!res.ok || !data.ok) {
          setSyncError(data.error ?? "Failed to update Hitlist main group");
          return;
        }
        await refreshPlaylists();
        const hl = formatHitlistSummary(
          data.hitlistNewMatches ?? 0,
          data.hitlistRemovedMatches ?? 0,
          data.hitlistSampleNew
        );
        setHitlistNotice(hl);
      } catch {
        setSyncError("Failed to update Hitlist main group");
      } finally {
        setMainToggleLoading(null);
      }
    },
    [sidFromUrl, refreshPlaylists]
  );

  const toggleExcludeFromHitlist = useCallback(
    async (playlistId: string, exclude: boolean) => {
      setHitlistNotice(null);
      setExcludeToggleLoading(playlistId);
      try {
        const res = await fetch(`/api/playlists/${playlistId}`, {
          method: "PATCH",
          credentials: "include",
          headers: getSessionHeaders(sidFromUrl),
          body: JSON.stringify({ excludeFromHitlist: exclude }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          hitlistNewMatches?: number;
          hitlistRemovedMatches?: number;
          hitlistSampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
        };
        if (!res.ok || !data.ok) {
          setSyncError(data.error ?? "Failed to update Hitlist preference");
          return;
        }
        await refreshPlaylists();
        const hl = formatHitlistSummary(
          data.hitlistNewMatches ?? 0,
          data.hitlistRemovedMatches ?? 0,
          data.hitlistSampleNew
        );
        setHitlistNotice(hl);
      } catch {
        setSyncError("Failed to update Hitlist preference");
      } finally {
        setExcludeToggleLoading(null);
      }
    },
    [sidFromUrl, refreshPlaylists]
  );

  const handleBulkHitlistMain = useCallback(
    async (inGroup: boolean) => {
      if (selectedIds.size === 0) return;
      setHitlistNotice(null);
      setBulkMainLoading(true);
      try {
        const res = await fetch("/api/playlists/main-source", {
          method: "POST",
          credentials: "include",
          headers: getSessionHeaders(sidFromUrl),
          body: JSON.stringify({ trackedPlaylistIds: Array.from(selectedIds), inHitlistMainGroup: inGroup }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          hitlistNewMatches?: number;
          hitlistRemovedMatches?: number;
          hitlistSampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
          hitlistMainGroupId?: string;
        };
        if (!res.ok || !data.ok) {
          setSyncError(data.error ?? "Failed to update Hitlist main group (bulk)");
          return;
        }
        await refreshPlaylists();
        const hl = formatHitlistSummary(
          data.hitlistNewMatches ?? 0,
          data.hitlistRemovedMatches ?? 0,
          data.hitlistSampleNew
        );
        setHitlistNotice(hl);
        clearSelection();
      } catch {
        setSyncError("Failed to update Hitlist main group (bulk)");
      } finally {
        setBulkMainLoading(false);
      }
    },
    [sidFromUrl, selectedIds, clearSelection, refreshPlaylists]
  );

  const openBulkAddModal = useCallback(() => {
    setBulkAddResult(null);
    setBulkAddGroupId("");
    setBulkAddNewGroupName("");
    fetch("/api/groups", { credentials: "include", headers: getSessionHeaders(sidFromUrl) })
      .then((res) => res.json())
      .then((data: { groups?: Array<{ id: string; name: string; color?: string; isMainGroup?: boolean }> }) => {
        setGroups(
          (data.groups ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            color: g.color ?? "#71717a",
            isMainGroup: g.isMainGroup,
          }))
        );
        setBulkAddOpen(true);
      });
  }, [sidFromUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
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
            {sessionNotInDb ? "Session belongs to another environment" : "API returned 401"}
          </h1>
          {sessionNotInDb ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
              Your session is not in the database for <strong>this</strong> site.
            </p>
          ) : null}
          {d && (
            <ul className="mt-3 list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
              <li>Cookie at API: {d.hasCookie ? "yes" : "no"}</li>
              <li>X-Spotify-Session header: {d.hasHeader ? "yes" : "no"}</li>
              <li>Session in DB: {d.sessionFoundInDb ? "yes" : "no"}</li>
            </ul>
          )}
          <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-200">
            Go to the home page and sign in again with Spotify.
          </p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500">
            To home page
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
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Tracked playlists
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              The hitlist compares playlists in the{" "}
              {hitlistMainGroup ? (
                <Link
                  href={sidFromUrl ? `/groups/${hitlistMainGroup.id}?sid=${encodeURIComponent(sidFromUrl)}` : `/groups/${hitlistMainGroup.id}`}
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Hitlist main group ({hitlistMainGroup.name})
                </Link>
              ) : (
                <span className="font-medium text-zinc-800 dark:text-zinc-200">Hitlist main group</span>
              )}{" "}
              with your other tracked playlists. <strong>Counts</strong> column: off = playlist does not count anywhere
              in the hitlist. Add source playlists via <strong>Hitlist source</strong>, Groups, or bulk actions.
            </p>
          </div>
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
        {hitlistNotice && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
            <strong>Hitlist:</strong> {hitlistNotice}
          </div>
        )}
        {syncAllResult && (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              Sync all: {syncAllResult.synced} synced{syncAllResult.failed > 0 ? `, ${syncAllResult.failed} failed` : ""}
            </p>
            {syncAllResult.errors.length > 0 && (
              <ul className="mt-1 list-inside text-zinc-600 dark:text-zinc-400">
                {syncAllResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{playlists.find((x) => x.id === e.playlistId)?.name ?? e.playlistId}: {e.error}</li>
                ))}
                {syncAllResult.errors.length > 5 && <li>… and {syncAllResult.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
        )}

        {/* Filters & sort */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <input
            type="search"
            placeholder="Search by name or owner…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="min-w-[180px] rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All owners</option>
            {uniqueOwners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">All groups</option>
            {uniqueGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={filterSyncStatus}
            onChange={(e) => setFilterSyncStatus(e.target.value as SyncStatusFilter)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Sync: all</option>
            <option value="never">Never synced</option>
            <option value="synced">Ever synced</option>
          </select>
          <select
            value={filterIsPublic}
            onChange={(e) => setFilterIsPublic(e.target.value as IsPublicFilter)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Visibility: all</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select
            value={filterHitlistMain}
            onChange={(e) => setFilterHitlistMain(e.target.value as HitlistMainFilter)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="all">Hitlist source: all playlists</option>
            <option value="inMain">In Hitlist main group</option>
            <option value="notInMain">Not in Hitlist main group</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="name_asc">Sort: name A–Z</option>
            <option value="name_desc">Sort: name Z–A</option>
            <option value="lastSync_new">Sort: last sync new→old</option>
            <option value="lastSync_old">Sort: last sync old→new</option>
            <option value="tracks_high">Sort: tracks high→low</option>
            <option value="tracks_low">Sort: tracks low→high</option>
          </select>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/5 px-4 py-3 dark:bg-[#1DB954]/10">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {selectedIds.size} playlist{selectedIds.size !== 1 ? "s" : ""} selected
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
              disabled={bulkMainLoading}
              onClick={() => void handleBulkHitlistMain(true)}
              className="rounded-full border border-emerald-500/60 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
            >
              {bulkMainLoading ? "…" : "Add to Hitlist main group"}
            </button>
            <button
              type="button"
              disabled={bulkMainLoading}
              onClick={() => void handleBulkHitlistMain(false)}
              className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Remove from Hitlist main group
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Clear selection
            </button>
          </div>
        )}

        {bulkSyncResult && (
          <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              Sync selected: {bulkSyncResult.synced} synced, {bulkSyncResult.failed} failed
            </p>
            {bulkSyncResult.errors.length > 0 && (
              <ul className="mt-1 list-inside text-zinc-600 dark:text-zinc-400">
                {bulkSyncResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                {bulkSyncResult.errors.length > 5 && <li>… and {bulkSyncResult.errors.length - 5} more</li>}
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
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Name</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Owner</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Groups</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Tracks</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Last sync</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Actions</th>
                <th className="px-3 py-3 text-center font-medium text-zinc-900 dark:text-zinc-100">Counts</th>
                <th className="px-3 py-3 text-right font-medium text-zinc-900 dark:text-zinc-100">Hitlist source</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlaylists.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    {playlists.length === 0
                      ? "No playlists yet. Click \"Add playlist\" to add a Spotify playlist."
                      : "No playlists match the filters."}
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
                        aria-label={`Select ${p.name}`}
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
                            <GroupChip
                              key={g.id}
                              name={g.name}
                              color={g.color}
                              href={`/groups/${g.id}`}
                              isHitlistMainGroup={g.isMainGroup}
                            />
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
                            setHitlistNotice(null);
                            setSyncingId(p.id);
                            try {
                              const res = await fetch(`/api/playlists/${p.id}/sync`, {
                                method: "POST",
                                credentials: "include",
                                headers: getSessionHeaders(sidFromUrl),
                              });
                              const data = (await res.json()) as {
                                ok?: boolean;
                                error?: string;
                                hitlistNewMatches?: number;
                                hitlistRemovedMatches?: number;
                                hitlistSampleNew?: Array<{ title: string; artistLabel: string; playlistName: string }>;
                              };
                              if (!res.ok || !data.ok) setSyncError(data.error ?? "Sync failed");
                              else {
                                const hl = formatHitlistSummary(
                                  data.hitlistNewMatches ?? 0,
                                  data.hitlistRemovedMatches ?? 0,
                                  data.hitlistSampleNew
                                );
                                setHitlistNotice(hl);
                                await refreshPlaylists();
                              }
                            } catch {
                              setSyncError("Sync failed");
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
                    <td className="px-3 py-3 align-top text-center">
                      <label className="inline-flex cursor-pointer flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!p.excludeFromHitlist}
                          disabled={excludeToggleLoading === p.id}
                          onChange={(e) => void toggleExcludeFromHitlist(p.id, !e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                          title="Off = playlist does not count toward the hitlist (no source, no match)"
                        />
                        <span className="max-w-[5rem] text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                          {p.excludeFromHitlist ? "No" : "Yes"}
                        </span>
                      </label>
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <label className="inline-flex cursor-pointer items-center justify-end gap-2">
                        <input
                          type="checkbox"
                          checked={p.inHitlistMainGroup}
                          disabled={mainToggleLoading === p.id}
                          onChange={(e) => void toggleHitlistMainGroup(p.id, e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                          title="In Hitlist main group (same as group with Hitlist label)"
                        />
                        {p.inHitlistMainGroup && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                            Source
                          </span>
                        )}
                      </label>
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
              Pick an existing group or enter a name for a new group. Playlists already in the group are skipped.
            </p>
            {groups.length > 0 && (
              <>
                <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Existing group</label>
                <select
                  value={bulkAddGroupId}
                  onChange={(e) => {
                    setBulkAddGroupId(e.target.value);
                    if (e.target.value) setBulkAddNewGroupName("");
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">Choose a group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.isMainGroup ? " — Hitlist source" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {groups.length > 0 ? "Or new group" : "New group"}
            </label>
            <input
              type="text"
              value={bulkAddNewGroupName}
              onChange={(e) => {
                setBulkAddNewGroupName(e.target.value);
                if (e.target.value.trim()) setBulkAddGroupId("");
              }}
              placeholder="Name of the new group"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {bulkAddResult && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-zinc-900 dark:text-zinc-100">
                  {bulkAddResult.added} added, {bulkAddResult.skipped} already in group
                  {bulkAddResult.errors.length > 0 && `, ${bulkAddResult.errors.length} error(s)`}
                </p>
                {bulkAddResult.errors.length > 0 && (
                  <ul className="mt-1 list-inside text-zinc-600 dark:text-zinc-400">
                    {bulkAddResult.errors.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={bulkAddLoading || (!bulkAddGroupId && !bulkAddNewGroupName.trim())}
                onClick={handleBulkAddToGroup}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
              >
                {bulkAddLoading ? "Working…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => { setBulkAddOpen(false); setBulkAddResult(null); clearSelection(); }}
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
              >
                Close
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
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      }
    >
      <PlaylistsPageContent />
    </Suspense>
  );
}
