"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
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

function getSessionHeaders(sidFromUrl: string | null): HeadersInit {
  const sessionValue = getSessionHeaderValue(sidFromUrl);
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (sessionValue) (headers as Record<string, string>)["X-Spotify-Session"] = sessionValue;
  return headers;
}

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  playlistCount: number;
};

function GroupsPageContent() {
  const searchParams = useSearchParams();
  const sidFromUrl = searchParams.get("sid");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/groups", { credentials: "include", headers: getSessionHeaders(sidFromUrl) })
      .then((res) => {
        if (res.status === 401) {
          setAuthError(true);
          return;
        }
        return res.json().then((data) => {
          if (data.groups) setGroups(data.groups);
        });
      })
      .catch(() => setLoading(false))
      .finally(() => setLoading(false));
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
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-amber-800 dark:text-amber-200">Niet ingelogd.</p>
            <Link href="/" className="mt-4 inline-block text-sm text-amber-700 dark:text-amber-300 hover:underline">
              Naar startpagina
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Playlistgroepen
          </h1>
          <Link
            href="/groups/new"
            className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760]"
          >
            New group
          </Link>
        </div>
        {groups.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Nog geen groepen. Maak een groep om playlists te organiseren.
            </p>
            <Link
              href="/groups/new"
              className="mt-4 inline-block rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760]"
            >
              New group
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-medium text-zinc-900 dark:text-zinc-100">{g.name}</h2>
                      {g.description && (
                        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {g.description}
                        </p>
                      )}
                    </div>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {g.playlistCount} playlist{g.playlistCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function GroupsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
        </div>
      }
    >
      <GroupsPageContent />
    </Suspense>
  );
}
