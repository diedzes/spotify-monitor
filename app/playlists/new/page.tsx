"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

function sessionHeaders(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const v = getSessionHeaderValue();
  if (v) (h as Record<string, string>)["X-Spotify-Session"] = v;
  return h;
}

export default function NewPlaylistPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/playlists", { credentials: "include", headers: sessionHeaders() })
      .then((res) => {
        if (res.status === 401) router.replace("/");
        else setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Vul een Spotify playlist URL of ID in.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/playlists/add", {
        method: "POST",
        headers: sessionHeaders(),
        body: JSON.stringify({ playlistUrlOrId: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string } | undefined;
      if (res.status === 401) {
        router.push("/");
        router.refresh();
        return;
      }
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Kon playlist niet toevoegen.");
        setLoading(false);
        return;
      }
      router.push("/playlists");
      router.refresh();
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/playlists"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Playlists
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Playlist toevoegen
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="playlist" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Spotify playlist URL of playlist ID
            </label>
            <input
              id="playlist"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://open.spotify.com/playlist/... of 3cEYpjA9oz9GiPac4AsH4n"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              disabled={loading}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
            >
              {loading ? "Bezig…" : "Toevoegen"}
            </button>
            <Link
              href="/playlists"
              className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Annuleren
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
