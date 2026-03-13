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

type PlaylistInGroup = {
  id: string;
  trackedPlaylistId: string;
  name: string;
  ownerName: string;
  trackCount: number;
  spotifyPlaylistId: string;
};

type GroupDetail = {
  group: { id: string; name: string; description: string | null; createdAt: string; updatedAt: string };
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

  const load = () => {
    setError(null);
    fetch(`/api/groups/${id}`, { credentials: "include", headers: getSessionHeaders() })
      .then((res) => {
        if (res.status === 401) router.replace("/groups");
        else if (res.status === 404) setError("Groep niet gevonden");
        else return res.json().then(setData);
      })
      .catch(() => setError("Kon groep niet laden"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

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
        setError(body.error ?? "Kon playlist niet verwijderen.");
        return;
      }
      setSuccess("Playlist uit groep verwijderd.");
      load();
    } catch {
      setError("Kon playlist niet verwijderen.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-amber-800 dark:text-amber-200">{error}</p>
          <Link href="/groups" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 hover:underline">
            ← Terug naar groepen
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { group, playlists } = data;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <Link
            href="/groups"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Groepen
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {group.name}
          </h1>
          {group.description && (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{group.description}</p>
          )}
        </div>

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
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Playlists in deze groep</h2>
          <Link
            href={`/groups/${id}/add-playlist`}
            className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]"
          >
            Playlist toevoegen
          </Link>
        </div>

        {playlists.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Nog geen playlists in deze groep. Voeg playlists toe via de knop hierboven of via het playlists-overzicht.
            </p>
            <Link
              href={`/groups/${id}/add-playlist`}
              className="mt-4 inline-block rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]"
            >
              Playlist toevoegen
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {playlists.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/playlists/${p.trackedPlaylistId}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                    {p.name}
                  </Link>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {p.ownerName} · {p.trackCount} tracks
                  </p>
                </div>
                <span className="flex items-center gap-2">
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
                    {removingId === p.trackedPlaylistId ? "Verwijderen…" : "Uit groep"}
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
