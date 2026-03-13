"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";

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

type PlaylistOption = {
  id: string;
  name: string;
  ownerName: string;
  trackCount: number;
  groups: Array<{ id: string; name: string }>;
};

type GroupInfo = { id: string; name: string };

export default function AddPlaylistToGroupPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const headers = getSessionHeaders();
    Promise.all([
      fetch(`/api/groups/${groupId}`, { credentials: "include", headers }).then((r) => r.json()),
      fetch("/api/playlists", { credentials: "include", headers }).then((r) => r.json()),
    ])
      .then(([groupRes, playlistsRes]) => {
        if (groupRes.group) setGroup({ id: groupRes.group.id, name: groupRes.group.name });
        if (playlistsRes.playlists) {
          const inGroup = new Set(
            (groupRes.playlists as Array<{ trackedPlaylistId: string }>)?.map((p) => p.trackedPlaylistId) ?? []
          );
          setPlaylists(playlistsRes.playlists.filter((p: PlaylistOption) => !inGroup.has(p.id)));
        }
      })
      .catch(() => setError("Kon data niet laden"))
      .finally(() => setLoading(false));
  }, [groupId]);

  const handleAdd = async (trackedPlaylistId: string) => {
    setError(null);
    setAddingId(trackedPlaylistId);
    try {
      const res = await fetch(`/api/groups/${groupId}/playlists`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ trackedPlaylistId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon playlist niet toevoegen.");
        setAddingId(null);
        return;
      }
      router.push(`/groups/${groupId}`);
      router.refresh();
    } catch {
      setError("Kon playlist niet toevoegen.");
      setAddingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <Link
            href={`/groups/${groupId}`}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← {group?.name ?? "Groep"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Playlist toevoegen aan {group?.name ?? "groep"}
        </h1>
        {error && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error}
          </p>
        )}
        {playlists.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Geen playlists om toe te voegen. Alle playlists zitten al in deze groep, of je hebt nog geen tracked playlists.
            </p>
            <Link href="/playlists" className="mt-4 inline-block text-sm text-[#1DB954] hover:underline">
              Ga naar playlists
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {playlists.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {p.ownerName} · {p.trackCount} tracks
                  </p>
                </div>
                <button
                  type="button"
                  disabled={addingId === p.id}
                  onClick={() => handleAdd(p.id)}
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
                >
                  {addingId === p.id ? "Toevoegen…" : "Toevoegen"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
