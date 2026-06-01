"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ContactStatusBadge } from "@/components/ContactStatusBadge";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_SORT_ORDER,
  type ContactStatus,
} from "@/lib/contact-status";
import { contactEmailsForMailApp, downloadContactsCsv, type ContactCsvRow } from "@/lib/contacts-csv";

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
  contactStatus: ContactStatus | null;
  createdAt: string;
  updatedAt: string;
};

type SortOption =
  | "name_asc"
  | "name_desc"
  | "org_asc"
  | "updated_new"
  | "updated_old"
  | "status";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function filterAndSort(
  rows: ContactRow[],
  search: string,
  filterStatus: string,
  filterRole: string,
  filterOrganization: string,
  sortBy: SortOption
): ContactRow[] {
  let list = rows;
  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.organizationName?.toLowerCase().includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.role?.toLowerCase().includes(q) ?? false)
    );
  }
  if (filterStatus === "unset") {
    list = list.filter((c) => !c.contactStatus);
  } else if (filterStatus) {
    list = list.filter((c) => c.contactStatus === filterStatus);
  }
  if (filterRole) {
    list = list.filter((c) => c.role === filterRole);
  }
  if (filterOrganization) {
    list = list.filter((c) => (c.organizationName ?? "") === filterOrganization);
  }

  return [...list].sort((a, b) => {
    switch (sortBy) {
      case "name_asc":
        return a.fullName.localeCompare(b.fullName, "en");
      case "name_desc":
        return b.fullName.localeCompare(a.fullName, "en");
      case "org_asc":
        return (a.organizationName ?? "").localeCompare(b.organizationName ?? "", "en");
      case "updated_new":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "updated_old":
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case "status": {
        const rank = (s: ContactStatus | null) =>
          s ? CONTACT_STATUS_SORT_ORDER[s] : 99;
        const cmp = rank(a.contactStatus) - rank(b.contactStatus);
        return cmp !== 0 ? cmp : a.fullName.localeCompare(b.fullName, "en");
      }
      default:
        return 0;
    }
  });
}

export default function ContactsPage() {
  const [allRows, setAllRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterOrganization, setFilterOrganization] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadContacts = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/contacts?limit=500", { credentials: "include", headers: getSessionHeaders() })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Not signed in");
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "Could not load contacts");
        }
        const d = (await res.json()) as { contacts?: ContactRow[] };
        setAllRows(d.contacts ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load contacts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of allRows) if (c.role) set.add(c.role);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "en"));
  }, [allRows]);

  const organizationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of allRows) if (c.organizationName) set.add(c.organizationName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "en"));
  }, [allRows]);

  const rows = useMemo(
    () => filterAndSort(allRows, query, filterStatus, filterRole, filterOrganization, sortBy),
    [allRows, query, filterStatus, filterRole, filterOrganization, sortBy]
  );

  const hasFilters = !!(query.trim() || filterStatus || filterRole || filterOrganization);

  const csvRows = useMemo((): ContactCsvRow[] => rows.map((c) => ({
    fullName: c.fullName,
    email: c.email,
    organizationName: c.organizationName,
    phone: c.phone,
    role: c.role,
    contactStatus: c.contactStatus,
    updatedAt: c.updatedAt,
  })), [rows]);

  const emailCount = useMemo(
    () => csvRows.filter((c) => c.email?.trim()).length,
    [csvRows]
  );

  function showExportNotice(message: string) {
    setExportNotice(message);
    window.setTimeout(() => setExportNotice(null), 2500);
  }

  function exportCsv() {
    if (csvRows.length === 0) return;
    downloadContactsCsv(csvRows, "contacts-filtered");
    showExportNotice(`CSV downloaded (${csvRows.length} contact${csvRows.length === 1 ? "" : "s"}).`);
  }

  async function copyEmails() {
    const list = contactEmailsForMailApp(csvRows);
    if (!list) {
      showExportNotice("No email addresses in the current selection.");
      return;
    }
    try {
      await navigator.clipboard.writeText(list);
      const n = list.split(";").length;
      showExportNotice(`Copied ${n} email address${n === 1 ? "" : "es"} to clipboard.`);
    } catch {
      showExportNotice("Could not copy to clipboard.");
    }
  }

  async function updateStatus(contactId: string, contactStatus: ContactStatus | null) {
    setStatusSavingId(contactId);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({ contactStatus }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string; contact?: ContactRow };
      if (!res.ok || !d.ok || !d.contact) {
        throw new Error(d.error ?? "Could not update status");
      }
      setAllRows((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? {
                ...c,
                ...d.contact!,
                contactStatus: d.contact!.contactStatus ?? contactStatus,
                organizationName:
                  d.contact!.organizationName ?? c.organizationName,
              }
            : c
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    } finally {
      setStatusSavingId(null);
    }
  }

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

        <div className="mb-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <input
            type="search"
            placeholder="Search name, organization, email, or role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Contact status
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All statuses</option>
                <option value="unset">Not set</option>
                {CONTACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CONTACT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Role
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All roles</option>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Organization
              <select
                value={filterOrganization}
                onChange={(e) => setFilterOrganization(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">All organizations</option>
                {organizationOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Sort by
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
                <option value="org_asc">Organization A–Z</option>
                <option value="updated_new">Recently updated</option>
                <option value="updated_old">Oldest updated</option>
                <option value="status">Contact status</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {rows.length} of {allRows.length} contact{allRows.length === 1 ? "" : "s"} shown
              {emailCount > 0 ? ` · ${emailCount} with email` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {hasFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilterStatus("");
                    setFilterRole("");
                    setFilterOrganization("");
                  }}
                  className="text-[#1DB954] hover:underline"
                >
                  Clear filters
                </button>
              ) : null}
              <button
                type="button"
                disabled={loading || rows.length === 0}
                onClick={() => copyEmails()}
                className="text-[#1DB954] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy emails
              </button>
              <button
                type="button"
                disabled={loading || rows.length === 0}
                onClick={() => exportCsv()}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
              >
                Export CSV
              </button>
            </div>
          </div>
          {exportNotice ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{exportNotice}</p>
          ) : null}
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Name</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Status</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Organization</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Email</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Phone</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Role</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    {hasFilters ? "No contacts match your filters." : "No contacts yet."}
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="font-medium text-[#1DB954] hover:underline">
                        {c.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[10rem] flex-col gap-1.5">
                        <ContactStatusBadge status={c.contactStatus} />
                        <select
                          value={c.contactStatus ?? ""}
                          disabled={statusSavingId === c.id}
                          onChange={(e) =>
                            void updateStatus(c.id, e.target.value ? (e.target.value as ContactStatus) : null)
                          }
                          className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                          aria-label={`Status for ${c.fullName}`}
                        >
                          <option value="">Not set</option>
                          {CONTACT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {CONTACT_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.organizationName ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.role ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">{fmt(c.updatedAt)}</td>
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
