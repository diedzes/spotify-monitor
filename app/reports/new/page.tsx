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

function NewReportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sidFromUrl = searchParams.get("sid");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(sidFromUrl),
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; report?: { id: string }; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not create report");
        return;
      }
      if (data.report?.id) router.push(`/reports/${data.report.id}`);
      else router.push("/reports");
    } catch {
      setError("Could not create report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/reports"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Reports
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          New report
        </h1>
        <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Naam
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="Bijv. Top 100 maart"
            />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Beschrijving (optioneel)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="Korte toelichting"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-60"
            >
              {loading ? "Aanmaken…" : "Aanmaken"}
            </button>
            <Link
              href="/reports"
              className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewReportPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
          </div>
        }
      >
        <NewReportPageContent />
      </Suspense>
    </div>
  );
}
