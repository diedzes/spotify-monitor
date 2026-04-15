"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

type ContactDetail = {
  id: string;
  fullName: string;
  organizationId: string | null;
  organizationName: string | null;
  organizationNameSnapshot: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrgOption = { id: string; name: string };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationNameSnapshot, setOrganizationNameSnapshot] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/contacts/${id}`, { credentials: "include", headers: getSessionHeaders() }),
      fetch("/api/organizations", { credentials: "include", headers: getSessionHeaders() }),
    ])
      .then(async ([contactRes, orgRes]) => {
        if (contactRes.status === 404) throw new Error("Contact not found");
        if (!contactRes.ok) throw new Error("Could not load contact");
        const c = (await contactRes.json()) as { contact: ContactDetail };
        setContact(c.contact);
        setFullName(c.contact.fullName);
        setOrganizationId(c.contact.organizationId ?? "");
        setOrganizationNameSnapshot(c.contact.organizationNameSnapshot ?? "");
        setEmail(c.contact.email ?? "");
        setPhone(c.contact.phone ?? "");
        setRole(c.contact.role ?? "");
        setNotes(c.contact.notes ?? "");
        setSource(c.contact.source ?? "");

        const o = (await orgRes.json().catch(() => ({}))) as { organizations?: Array<{ id: string; name: string }> };
        setOrgs((o.organizations ?? []).map((x) => ({ id: x.id, name: x.name })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load contact"))
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!contact) return;
    setError(null);
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: getSessionHeaders(),
        body: JSON.stringify({
          fullName,
          organizationId: organizationId || null,
          organizationNameSnapshot: organizationId ? null : organizationNameSnapshot || null,
          email,
          phone,
          role,
          notes,
          source,
        }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string; contact?: ContactDetail };
      if (!res.ok || !d.ok || !d.contact) {
        setError(d.error ?? "Could not save contact");
        setSaving(false);
        return;
      }
      setContact(d.contact);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not save contact");
    } finally {
      setSaving(false);
    }
  }

  async function removeContact() {
    if (!contact) return;
    if (!window.confirm(`Delete contact "${contact.fullName}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setError(d.error ?? "Could not delete contact");
        return;
      }
      router.push("/contacts");
      router.refresh();
    } catch {
      setError("Could not delete contact");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error ?? "Contact not found"}
          </p>
          <Link href="/contacts" className="mt-4 inline-block text-sm text-[#1DB954] hover:underline">← Back to contacts</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/contacts" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            ← Back to contacts
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {editing ? "Cancel edit" : "Edit"}
            </button>
            <button
              type="button"
              onClick={() => void removeContact()}
              className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-300"
            >
              Delete
            </button>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Full name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Organization</label>
                  <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800">
                    <option value="">— none —</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Organization fallback</label>
                  <input value={organizationNameSnapshot} disabled={!!organizationId} onChange={(e) => setOrganizationNameSnapshot(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Role</label>
                  <input value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Source</label>
                  <input value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800" />
              </div>
              <button type="button" onClick={() => void save()} disabled={saving} className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760] disabled:opacity-50">
                {saving ? "Saving…" : "Save contact"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{contact.fullName}</h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Created {fmt(contact.createdAt)} · Updated {fmt(contact.updatedAt)}
                </p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Organization</dt><dd className="text-zinc-900 dark:text-zinc-100">{contact.organizationName ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Role</dt><dd className="text-zinc-900 dark:text-zinc-100">{contact.role ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Email</dt><dd className="text-zinc-900 dark:text-zinc-100">{contact.email ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Phone</dt><dd className="text-zinc-900 dark:text-zinc-100">{contact.phone ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Source</dt><dd className="text-zinc-900 dark:text-zinc-100">{contact.source ?? "—"}</dd></div>
              </dl>
              <div>
                <h2 className="mb-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">Notes</h2>
                <p className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
                  {contact.notes ?? "No notes yet."}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
