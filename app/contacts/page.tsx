"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type ContactRow = {
  id: string;
  fullName: string;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

export default function ContactsPage() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      setError(null);
      fetch(`/api/contacts?query=${encodeURIComponent(query)}`, {
        credentials: "include",
        headers: getSessionHeaders(),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.status === 401) throw new Error("Not signed in");
          if (!res.ok) {
            const d = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(d.error ?? "Could not load contacts");
          }
          const d = (await res.json()) as { contacts?: ContactRow[] };
          setRows(d.contacts ?? []);
        })
        .catch((e) => {
          if (e?.name === "AbortError") return;
          setError(e instanceof Error ? e.message : "Could not load contacts");
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const total = useMemo(() => rows.length, [rows]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Contacts</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Internal contact database for feedback, hitlist context, and future CRM workflows.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/organizations"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Organizations
            </Link>
            <Link
              href="/contacts/new"
              className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ed760]"
            >
              New contact
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <input
            type="search"
            placeholder="Search name, organization, or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{total} contact{total === 1 ? "" : "s"} shown</p>
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
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Organization</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Email</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Phone</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Role</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">No contacts yet.</td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="font-medium text-[#1DB954] hover:underline">{c.fullName}</Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.organizationName ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.role ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{fmt(c.updatedAt)}</td>
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
