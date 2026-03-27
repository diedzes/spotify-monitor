"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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
  const sessionValue = getSessionHeaderValue(sidFromUrl);
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (sessionValue) (headers as Record<string, string>)["X-Spotify-Session"] = sessionValue;
  return headers;
}

function NewSchedulerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sidFromUrl = searchParams.get("sid");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"clock" | "ratio">("clock");
  const [targetTrackCount, setTargetTrackCount] = useState(30);
  const [ratioEvenDistribution, setRatioEvenDistribution] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Naam is verplicht");
      return;
    }
    if (!Number.isInteger(targetTrackCount) || targetTrackCount < 1) {
      setError("Target track count moet een positief geheel getal zijn");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/schedulers", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(sidFromUrl),
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || undefined,
          mode,
          targetTrackCount,
          ratioEvenDistribution,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; scheduler?: { id: string }; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon scheduler niet aanmaken");
        return;
      }
      if (data.scheduler?.id) router.push(`/scheduler/${data.scheduler.id}`);
      else router.push("/scheduler");
    } catch {
      setError("Kon scheduler niet aanmaken");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/scheduler"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Scheduler
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">New scheduler</h1>
        <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Naam</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="Bijv. Vrijdagavond mix"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Beschrijving (optioneel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "clock" | "ratio")}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="clock">clock</option>
              <option value="ratio">ratio</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Target track count</label>
            <input
              type="number"
              min={1}
              step={1}
              value={targetTrackCount}
              onChange={(e) => setTargetTrackCount(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          {mode === "ratio" && (
            <label className="inline-flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={ratioEvenDistribution}
                onChange={(e) => setRatioEvenDistribution(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Gelijkmatig verspreiden over de hele playlist
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  Houdt gewichten aan, maar spreidt nummers uit dezelfde bron zoveel mogelijk over alle posities.
                </span>
              </span>
            </label>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
            >
              {loading ? "Aanmaken…" : "Aanmaken"}
            </button>
            <Link
              href="/scheduler"
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

export default function NewSchedulerPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-zinc-500 dark:text-zinc-400">Laden…</p>
          </div>
        }
      >
        <NewSchedulerPageContent />
      </Suspense>
    </div>
  );
}

