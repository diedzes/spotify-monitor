"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import { normalizeGroupColor } from "@/lib/group-color";

const SESSION_HEADER_COOKIE = "spotify_session_s";
const FETCH_TIMEOUT_MS = 15000;

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

function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = FETCH_TIMEOUT_MS, ...rest } = opts;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...rest, signal: controller.signal }).finally(() => clearTimeout(id));
}

type GroupOption = {
  id: string;
  name: string;
  description: string | null;
  playlistCount: number;
  color: string;
};

export default function AddPlaylistToGroupPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.id as string;
  const [playlistName, setPlaylistName] = useState<string>("");
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [playlistGroupIds, setPlaylistGroupIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const headers = getSessionHeaders();
    Promise.all([
      fetchWithTimeout(`/api/playlists/${playlistId}`, { credentials: "include", headers }).then(async (r) => {
        if (r.status === 401) return { _401: true };
        const data = await r.json().catch(() => ({}));
        return data;
      }),
      fetchWithTimeout("/api/groups", { credentials: "include", headers }).then(async (r) => {
        if (r.status === 401) return { _401: true };
        const data = await r.json().catch(() => ({}));
        return data;
      }),
    ])
      .then(([playlistRes, groupsRes]) => {
        if (playlistRes && "_401" in playlistRes) {
          setAuthFailed(true);
          setLoading(false);
          return;
        }
        if (groupsRes && "_401" in groupsRes) {
          setAuthFailed(true);
          setLoading(false);
          return;
        }
        if (playlistRes?.playlist) {
          setPlaylistName(playlistRes.playlist.name);
          setPlaylistGroupIds(new Set((playlistRes.playlist.groups ?? []).map((g: { id: string }) => g.id)));
        }
        if (groupsRes?.groups)
          setGroups(
            (groupsRes.groups as GroupOption[]).map((g) => ({
              ...g,
              color: g.color ?? "#71717a",
            }))
          );
      })
      .catch((err) => {
        if (err?.name === "AbortError") {
          setError("Verzoek duurde te lang. Probeer opnieuw.");
        } else {
          setError("Kon data niet laden. Log in op de startpagina en probeer het opnieuw.");
        }
      })
      .finally(() => setLoading(false));
  }, [playlistId]);

  const handleAdd = async (groupId: string) => {
    setError(null);
    setAddingId(groupId);
    try {
      const res = await fetch(`/api/groups/${groupId}/playlists`, {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ trackedPlaylistId: playlistId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon niet toevoegen aan groep.");
        setAddingId(null);
        return;
      }
      setPlaylistGroupIds((prev) => new Set([...prev, groupId]));
      setAddingId(null);
    } catch {
      setError("Kon niet toevoegen aan groep.");
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

  if (authFailed) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium text-amber-800 dark:text-amber-200">Niet ingelogd</p>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Log in op de startpagina en ga dan via Dashboard → Playlists naar deze pagina.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 underline">
            Naar startpagina
          </Link>
        </div>
      </div>
    );
  }

  const availableGroups = groups.filter((g) => !playlistGroupIds.has(g.id));

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <Link
            href={`/playlists/${playlistId}`}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← {playlistName || "Playlist"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Add to group
        </h1>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Kies een groep om &quot;{playlistName || "deze playlist"}&quot; aan toe te voegen.
        </p>
        {error && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <p>{error}</p>
            <Link href="/" className="mt-2 inline-block text-amber-700 dark:text-amber-300 underline">
              Naar startpagina om in te loggen
            </Link>
          </div>
        )}
        {availableGroups.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Deze playlist zit al in al je groepen, of je hebt nog geen groepen. Maak eerst een groep aan.
            </p>
            <Link href="/groups/new" className="mt-4 inline-block text-sm text-[#1DB954] hover:underline">
              Nieuwe groep
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {availableGroups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white py-3 pl-3 pr-4 dark:border-zinc-800 dark:bg-zinc-900"
                style={{ borderLeftWidth: 4, borderLeftColor: normalizeGroupColor(g.color) }}
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{g.name}</p>
                  {g.description && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-1">{g.description}</p>
                  )}
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">{g.playlistCount} playlists</p>
                </div>
                <button
                  type="button"
                  disabled={addingId === g.id}
                  onClick={() => handleAdd(g.id)}
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
                >
                  {addingId === g.id ? "Toevoegen…" : "Toevoegen"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
