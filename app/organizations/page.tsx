"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
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

type OrganizationRow = {
  id: string;
  name: string;
  notes: string | null;
  contactCount: number;
  updatedAt: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

export default function OrganizationsPage() {
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (q = query) => {
    setError(null);
    fetch(`/api/organizations?query=${encodeURIComponent(q)}`, {
      credentials: "include",
      headers: getSessionHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "Could not load organizations");
        }
        const d = (await res.json()) as { organizations?: OrganizationRow[] };
        setRows(d.organizations ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load organizations"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(() => load(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Organization name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ name, notes }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setError(d.error ?? "Could not create organization");
        setSaving(false);
        return;
      }
      setName("");
      setNotes("");
      load();
    } catch {
      setError("Could not create organization");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Organizations</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Manage organizations linked to contacts.</p>
          </div>
          <Link href="/contacts/new" className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]">
            New contact
          </Link>
        </div>

        <form onSubmit={createOrg} className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[1fr_1fr_auto]">
          <input
            placeholder="New organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
          />
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
          />
          <button type="submit" disabled={saving} className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600">
            {saving ? "Creating…" : "New organization"}
          </button>
        </form>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <input
            type="search"
            placeholder="Search organizations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
          />
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Name</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Contacts</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Notes</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">No organizations yet.</td></tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{o.name}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{o.contactCount}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{o.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{fmt(o.updatedAt)}</td>
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
