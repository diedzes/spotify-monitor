"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";
import { GROUP_COLOR_PRESETS, normalizeGroupColor } from "@/lib/group-color";

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
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

type PlaylistInGroup = {
  id: string;
  trackedPlaylistId: string;
  name: string;
  ownerName: string;
  trackCount: number;
  spotifyPlaylistId: string;
  lastSyncedAt: string | null;
  snapshotCount: number;
};

type GroupDetail = {
  group: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    isMainGroup: boolean;
    createdAt: string;
    updatedAt: string;
  };
  playlists: PlaylistInGroup[];
};

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [groupColor, setGroupColor] = useState("#71717a");
  const [colorSaving, setColorSaving] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetch(`/api/groups/${id}`, { credentials: "include", headers: getSessionHeaders() })
      .then((res) => {
        if (res.status === 401) router.replace("/groups");
        else if (res.status === 404) setError("Group not found");
        else
          return res.json().then((d: GroupDetail) => {
            setData(d);
            if (d.group?.color) setGroupColor(normalizeGroupColor(d.group.color));
          });
      })
      .catch(() => setError("Could not load group"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  const saveGroupColor = async () => {
    setColorError(null);
    setColorSaving(true);
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ color: groupColor }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setColorError(body.error ?? "Failed to save color.");
        return;
      }
      setSuccess("Color saved.");
      load();
    } catch {
      setColorError("Failed to save color.");
    } finally {
      setColorSaving(false);
    }
  };

  const handleRemove = async (trackedPlaylistId: string) => {
    setSuccess(null);
    setRemovingId(trackedPlaylistId);
    try {
      const res = await fetch(
        `/api/groups/${id}/playlists?trackedPlaylistId=${encodeURIComponent(trackedPlaylistId)}`,
        { method: "DELETE", credentials: "include", headers: getSessionHeaders() }
      );
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Could not remove playlist.");
        return;
      }
      setSuccess("Playlist removed from group.");
      load();
    } catch {
      setError("Could not remove playlist.");
    } finally {
      setRemovingId(null);
    }
  };

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

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AppHeader />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-200">{error}</p>
            <Link href="/groups" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 hover:underline">
              ← Back to groups
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { group, playlists } = data;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div
          className="mb-6 rounded-r-xl border border-zinc-200 border-l-4 bg-white py-4 pl-5 pr-4 dark:border-zinc-800 dark:bg-zinc-900"
          style={{ borderLeftColor: normalizeGroupColor(group.color) }}
        >
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {group.name}
          </h1>
          {group.description && (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{group.description}</p>
          )}
          {group.isMainGroup && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              This is your <strong>Hitlist main group</strong>: playlists in this group are the source for the hitlist on the
              dashboard. You can also manage them from the playlists overview (Hitlist source column).
            </p>
          )}
        </div>

        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">Group color</h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Visible on the playlists overview, in reports and scheduler.
          </p>
          {colorError && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{colorError}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              value={groupColor}
              onChange={(e) => setGroupColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-zinc-300 bg-white p-0.5 dark:border-zinc-600"
              aria-label="Group color"
            />
            <div className="flex flex-wrap gap-2">
              {GROUP_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={preset}
                  onClick={() => setGroupColor(preset)}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950 ${
                    groupColor.toLowerCase() === preset.toLowerCase() ? "ring-[#1DB954]" : "ring-transparent"
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={colorSaving || normalizeGroupColor(groupColor) === normalizeGroupColor(group.color)}
              onClick={() => void saveGroupColor()}
              className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
            >
              {colorSaving ? "Saving…" : "Save color"}
            </button>
          </div>
        </section>

        {success && (
          <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
            {success}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error}
          </p>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Playlists in this group</h2>
          <Link
            href={`/groups/${id}/add-playlist`}
            className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]"
          >
            Add playlist
          </Link>
        </div>

        {playlists.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              No playlists in this group yet. Add playlists via the button above or from the playlists overview.
            </p>
            <Link
              href={`/groups/${id}/add-playlist`}
              className="mt-4 inline-block rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]"
            >
              Add playlist
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {playlists.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/playlists/${p.trackedPlaylistId}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                    {p.name}
                  </Link>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {p.ownerName} · {p.trackCount} tracks
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Last sync: {formatDate(p.lastSyncedAt)} · {p.snapshotCount} snapshot{p.snapshotCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/playlists/${p.trackedPlaylistId}`}
                    className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
                  >
                    Detail
                  </Link>
                  <Link
                    href={`/playlists/${p.trackedPlaylistId}#changes`}
                    className="rounded bg-[#1DB954] px-2 py-1 text-xs font-medium text-white hover:bg-[#1ed760]"
                  >
                    View changes
                  </Link>
                  <a
                    href={`https://open.spotify.com/playlist/${p.spotifyPlaylistId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#1DB954] hover:underline"
                  >
                    Spotify
                  </a>
                  <button
                    type="button"
                    disabled={removingId === p.trackedPlaylistId}
                    onClick={() => handleRemove(p.trackedPlaylistId)}
                    className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-red-100 hover:text-red-700 disabled:opacity-50 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                  >
                    {removingId === p.trackedPlaylistId ? "Removing…" : "Remove from group"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
