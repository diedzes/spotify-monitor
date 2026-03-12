"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SESSION_HEADER_COOKIE = "spotify_session_s";

function getSessionHeaderValue(): string | null {
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
};

export default function PlaylistsPage() {
  const [user, setUser] = useState<{ name: string | null; email: string | null } | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<{ debug?: { hasCookie: boolean; hasHeader: boolean; clientHadSessionCookie?: boolean; hasValidSessionId: boolean; sessionFoundInDb: boolean } } | null>(null);

  useEffect(() => {
    const sessionValue = getSessionHeaderValue();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (sessionValue) headers["X-Spotify-Session"] = sessionValue;
    (headers as Record<string, string>)["X-Debug-Client-Had-Session-Cookie"] = sessionValue ? "1" : "0";
    fetch("/api/playlists", { credentials: "include", headers })
      .then((res) => res.json().then((data) => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status === 401) {
          setAuthError(data);
          setLoading(false);
          return;
        }
        if (data?.user) {
          setUser(data.user);
          setPlaylists(data.playlists ?? []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
      </div>
    );
  }

  if (authError) {
    const d = authError.debug;
    return (
      <div className="min-h-screen bg-zinc-50 p-6 font-sans dark:bg-zinc-950">
        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
          <h1 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            API gaf 401 – debug (bij fetch naar /api/playlists)
          </h1>
          {d && (
            <ul className="mt-3 list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
              <li>Cookie bij API: {d.hasCookie ? "ja" : "nee"}</li>
              <li>X-Spotify-Session header bij API: {d.hasHeader ? "ja" : "nee"}</li>
              <li>Client had cookie spotify_session_s: {d.clientHadSessionCookie ? "ja" : "nee"}</li>
              <li>Session-id geldig: {d.hasValidSessionId ? "ja" : "nee"}</li>
              <li>Sessie in DB: {d.sessionFoundInDb ? "ja" : "nee"}</li>
            </ul>
          )}
          <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-200">
            Als &quot;Client had cookie: nee&quot; → ga naar de startpagina, klik <strong>Uitloggen</strong>, log daarna opnieuw in met Spotify. De cookie voor de header wordt alleen gezet bij inloggen.
          </p>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Als &quot;Client had cookie: ja&quot; maar &quot;header bij API: nee&quot; → neem contact op met support.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            Naar login
          </Link>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {user.name ?? user.email}
            </span>
            <Link
              href="/api/auth/spotify/logout"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Uitloggen
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tracked playlists
          </h1>
          <Link
            href="/playlists/new"
            className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760]"
          >
            Add playlist
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Naam</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Owner</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Tracks</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Laatste sync</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Acties</th>
              </tr>
            </thead>
            <tbody>
              {playlists.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    Nog geen playlists. Klik op &quot;Add playlist&quot; om een Spotify playlist toe te voegen.
                  </td>
                </tr>
              ) : (
                playlists.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.ownerName}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.trackCount}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(p.lastSyncedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://open.spotify.com/playlist/${p.spotifyPlaylistId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1DB954] hover:underline"
                      >
                        Open in Spotify
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
