"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SpotifyUserPlaylistPicker } from "@/components/SpotifyUserPlaylistPicker";
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

export default function PlaylistsFromSpotifyUserPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/playlists", { credentials: "include", headers: sessionHeaders() })
      .then((res) => {
        if (res.status === 401) router.replace("/");
        else setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <nav className="mb-4 text-sm text-zinc-500">
          <Link href="/playlists" className="hover:text-[#1DB954]">
            Playlists
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Van Spotify-account</span>
        </nav>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Playlists van een Spotify-account
        </h1>
        <p className="mb-8 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Voer een profiel-URL of user-id in. We tonen alleen{" "}
          <strong>publieke</strong> playlists en je kiest welke je aan de app wilt toevoegen. Dubbele playlists
          (zelfde Spotify-id) worden overgeslagen.
        </p>
        <SpotifyUserPlaylistPicker sessionHeaders={sessionHeaders} />
      </main>
    </div>
  );
}
