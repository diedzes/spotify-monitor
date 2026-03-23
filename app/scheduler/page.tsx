"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
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
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const v = getSessionHeaderValue(sidFromUrl);
  if (v) (headers as Record<string, string>)["X-Spotify-Session"] = v;
  return headers;
}

type SchedulerRow = {
  id: string;
  name: string;
  description: string | null;
  mode: "clock" | "ratio";
  targetTrackCount: number;
  sourceCount: number;
  slotCount: number;
  runCount: number;
  updatedAt: string;
};

function SchedulerPageContent() {
  const searchParams = useSearchParams();
  const sidFromUrl = searchParams.get("sid");
  const [rows, setRows] = useState<SchedulerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    fetch("/api/schedulers", { credentials: "include", headers: getSessionHeaders(sidFromUrl) })
      .then((res) => {
        if (res.status === 401) {
          setAuthError(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.schedulers) setRows(data.schedulers);
      })
      .catch(() => {})
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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Scheduler</h1>
          <Link
            href="/scheduler/new"
            className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760]"
          >
            New scheduler
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">Nog geen schedulers. Maak je eerste scheduler aan.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/scheduler/${s.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}</h2>
                      {s.description && (
                        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-1">{s.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {s.mode} · target {s.targetTrackCount} · {s.sourceCount} bronnen · {s.slotCount} slots · {s.runCount} runs
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

export default function SchedulerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
        </div>
      }
    >
      <SchedulerPageContent />
    </Suspense>
  );
}

