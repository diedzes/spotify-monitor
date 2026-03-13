"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Naam is verplicht.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; group?: { id: string } };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Kon groep niet aanmaken.");
        setLoading(false);
        return;
      }
      router.push(`/groups/${data.group!.id}`);
      router.refresh();
    } catch {
      setError("Er ging iets mis.");
      setLoading(false);
    }
  }

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
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Nieuwe groep
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Naam *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="bijv. Oranje"
              required
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
              placeholder="Optioneel"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50"
            >
              {loading ? "Aanmaken…" : "Aanmaken"}
            </button>
            <Link
              href="/groups"
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
