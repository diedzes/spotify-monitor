"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";
import { GroupChip } from "@/components/GroupChip";

const SESSION_HEADER_COOKIE = "spotify_session_s";

function getSessionHeaderValue(): string | null {
  const fromStorage = getStoredSessionId();
  if (fromStorage) return fromStorage;
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${SESSION_HEADER_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

function getSessionHeaders(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const v = getSessionHeaderValue();
  if (v) (h as Record<string, string>)["X-Spotify-Session"] = v;
  return h;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function parseArtists(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return Array.isArray(arr) ? arr.map((a) => a.name ?? "").filter(Boolean).join(", ") : "—";
  } catch {
    return "—";
  }
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null || durationMs < 0) return "—";
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type PlaylistDetail = {
  playlist: {
    id: string;
    name: string;
    description: string | null;
    ownerName: string;
    imageUrl: string | null;
    spotifyPlaylistId: string;
    trackCount: number;
    lastSyncedAt: string | null;
    snapshotId: string | null;
    groups?: Array<{ id: string; name: string; color: string; isMainGroup?: boolean }>;
    inHitlistMainGroup?: boolean;
  };
  snapshots: Array<{
    id: string;
    spotifySnapshotId: string;
    syncedAt: string;
    trackCount: number;
  }>;
  latestTracks: Array<{
    id: string;
    position: number;
    title: string;
    artistsJson: string;
    album: string;
    durationMs: number | null;
    spotifyUrl: string;
  }>;
};

type ChangeItem = {
  spotifyTrackId: string;
  title: string;
  artists: string;
  album: string;
  currentPosition: number | null;
  previousPosition: number | null;
  status: "new" | "removed" | "up" | "down" | "unchanged";
  movement: number | null;
  spotifyUrl: string;
};

type ChangeFilter = "all" | "new" | "removed" | "up" | "down" | "unchanged";

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tracks" | "changes">("tracks");
  const [changes, setChanges] = useState<ChangeItem[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [hasEnoughSnapshots, setHasEnoughSnapshots] = useState(true);
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");

  const load = () => {
    setError(null);
    fetch(`/api/playlists/${id}`, { credentials: "include", headers: getSessionHeaders() })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/playlists");
          return;
        }
        if (res.status === 404) {
          setError("Playlist niet gevonden");
          return;
        }
        const body = await res.json();
        setData(body);
      })
      .catch(() => setError("Kon playlist niet laden"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (hash === "changes") setActiveTab("changes");
  }, []);

  useEffect(() => {
    if (activeTab !== "changes" || !id) return;
    setChangesLoading(true);
    fetch(`/api/playlists/${id}/changes`, { credentials: "include", headers: getSessionHeaders() })
      .then((res) => res.json())
      .then((body) => {
        setChanges(body.changes ?? []);
        setHasEnoughSnapshots(body.hasEnoughSnapshots !== false);
      })
      .catch(() => setChanges([]))
      .finally(() => setChangesLoading(false));
  }, [activeTab, id]);

  const handleSync = async () => {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const res = await fetch(`/api/playlists/${id}/sync`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; changed?: boolean };
      if (!res.ok || !body.ok) {
        setSyncMessage(body.error ?? "Sync mislukt");
        return;
      }
      setSyncMessage(body.changed ? "Playlist bijgewerkt; nieuwe snapshot opgeslagen." : "Geen wijzigingen; metadata bijgewerkt.");
      load();
    } catch {
      setSyncMessage("Sync mislukt");
    } finally {
      setSyncing(false);
    }
  };

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

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AppHeader />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-200">{error}</p>
            <Link href="/playlists" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 hover:underline">
              ← Terug naar playlists
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { playlist, snapshots, latestTracks } = data;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            {playlist.imageUrl && (
              <img
                src={playlist.imageUrl}
                alt=""
                className="h-32 w-32 rounded-lg object-cover shadow"
              />
            )}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {playlist.name}
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {playlist.ownerName} · {playlist.trackCount} tracks
              </p>
              {playlist.description && (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500 line-clamp-2">
                  {playlist.description}
                </p>
              )}
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                Laatste sync: {formatDate(playlist.lastSyncedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={handleSync}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
            >
              {syncing ? "Sync…" : "Sync now"}
            </button>
            <a
              href={`https://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm text-[#1DB954] hover:underline"
            >
              Open in Spotify
            </a>
          </div>
        </div>

        {syncMessage && (
          <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
            {syncMessage}
          </p>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Groepen
          </h2>
          <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
            Deze playlist zit in de volgende groepen.
            {playlist.inHitlistMainGroup ? (
              <span className="ml-1 font-medium text-emerald-700 dark:text-emerald-400">
                Staat in de Hitlist-hoofdgroep (bron voor de hitlist).
              </span>
            ) : null}
          </p>
          {(playlist.groups?.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Nog in geen groep. Voeg toe via &quot;Add to group&quot; op het playlists-overzicht of hieronder.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {playlist.groups?.map((g) => (
                <li key={g.id}>
                  <GroupChip
                    name={g.name}
                    color={g.color}
                    href={`/groups/${g.id}`}
                    className="text-sm py-1"
                    isHitlistMainGroup={!!g.isMainGroup}
                  />
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/playlists/${id}/add-to-group`}
            className="mt-2 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Add to group
          </Link>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Snapshots
          </h2>
          {snapshots.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nog geen snapshots. Klik op &quot;Sync now&quot; om de eerste op te slaan.
            </p>
          ) : (
            <ul className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {snapshots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800"
                >
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {s.spotifySnapshotId.slice(0, 12)}…
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {formatDate(s.syncedAt)} · {s.trackCount} tracks
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="changes">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("tracks")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${activeTab === "tracks" ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"}`}
            >
              Current tracks
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("changes")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${activeTab === "changes" ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"}`}
            >
              Changes
            </button>
          </div>

          {activeTab === "tracks" && (
            <>
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                Tracks uit de laatste snapshot.
              </p>
              {latestTracks.length === 0 ? (
                <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Geen tracks. Sync de playlist om een snapshot te maken.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">#</th>
                        <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Artiest</th>
                        <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Titel</th>
                        <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Album</th>
                        <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Duration</th>
                        <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestTracks.map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                        >
                          <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{t.position + 1}</td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {parseArtists(t.artistsJson)}
                          </td>
                          <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{t.title}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{t.album}</td>
                          <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                            {formatDuration(t.durationMs)}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={t.spotifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#1DB954] hover:underline"
                            >
                              Spotify
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === "changes" && (
            <>
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                Vergelijking tussen de twee meest recente snapshots.
              </p>
              {changesLoading ? (
                <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Laden…
                </p>
              ) : !hasEnoughSnapshots ? (
                <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Er zijn minimaal 2 snapshots nodig om wijzigingen te vergelijken. Sync de playlist nog een keer om een tweede snapshot te maken.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {(["all", "new", "removed", "up", "down", "unchanged"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setChangeFilter(f)}
                        className={`rounded px-2 py-1 text-xs font-medium capitalize ${changeFilter === f ? "bg-zinc-700 text-white dark:bg-zinc-500" : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"}`}
                      >
                        {f === "all" ? "All" : f}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const filtered =
                      changeFilter === "all"
                        ? changes
                        : changes.filter((c) => c.status === changeFilter);
                    if (filtered.length === 0) {
                      return (
                        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                          Geen wijzigingen in deze filter.
                        </p>
                      );
                    }
                    return (
                      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-700">
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Status</th>
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Artiest</th>
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Titel</th>
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Vorige pos.</th>
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Huidige pos.</th>
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Beweging</th>
                              <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Link</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((c) => (
                              <tr
                                key={`${c.spotifyTrackId}-${c.previousPosition ?? ""}-${c.currentPosition ?? ""}`}
                                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                              >
                                <td className="px-4 py-3">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                      c.status === "new"
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                                        : c.status === "removed"
                                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                                          : c.status === "up"
                                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                                            : c.status === "down"
                                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                                    }`}
                                  >
                                    {c.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.artists || "—"}</td>
                                <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{c.title}</td>
                                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                                  {c.previousPosition != null ? c.previousPosition + 1 : "—"}
                                </td>
                                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                                  {c.currentPosition != null ? c.currentPosition + 1 : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {c.movement != null ? (
                                    <span className={c.movement < 0 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}>
                                      {c.movement > 0 ? "+" : ""}{c.movement}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <a
                                    href={c.spotifyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#1DB954] hover:underline"
                                  >
                                    Spotify
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
