"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { getStoredSessionId } from "@/components/StoreSessionFromUrl";

const SESSION_HEADER_COOKIE = "spotify_session_s";

function getSessionHeaders(): HeadersInit {
  const h: HeadersInit = {};
  const fromStorage = getStoredSessionId();
  let v: string | null = fromStorage;
  if (!v && typeof document !== "undefined") {
    const m = document.cookie.match(new RegExp(`${SESSION_HEADER_COOKIE}=([^;]+)`));
    v = m ? decodeURIComponent(m[1].trim()) : null;
  }
  if (v) (h as Record<string, string>)["X-Spotify-Session"] = v;
  return h;
}

type Contact = {
  id: string;
  fullName: string;
  email: string | null;
  organizationName: string | null;
};

type Track = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl: string | null;
};

function artistsLabel(json: string): string {
  try {
    return (JSON.parse(json) as { name?: string }[])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");
  } catch {
    return "";
  }
}

function splitName(fullName: string): { voornaam: string; achternaam: string } {
  const parts = fullName.trim().split(/\s+/);
  return { voornaam: parts[0] ?? "", achternaam: parts.slice(1).join(" ") };
}

function resolveVars(template: string, contact: Contact, tracks: Track[]): string {
  const { voornaam, achternaam } = splitName(contact.fullName);
  const nummers = tracks
    .map((t) => {
      const url = t.spotifyUrl ?? `https://open.spotify.com/track/${t.spotifyTrackId}`;
      return `• ${t.title} – ${artistsLabel(t.artistsJson)}\n  ${url}`;
    })
    .join("\n\n");

  return template
    .replace(/\[Voornaam\]/g, voornaam)
    .replace(/\[Achternaam\]/g, achternaam)
    .replace(/\[Organisatie\]/g, contact.organizationName ?? "")
    .replace(/\[Nummers\]/g, nummers);
}

function buildMailto(contact: Contact, subject: string, body: string, tracks: Track[]): string {
  const s = resolveVars(subject, contact, tracks);
  const b = resolveVars(body, contact, tracks);
  return `mailto:${encodeURIComponent(contact.email!)}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
}

const VARS = ["[Voornaam]", "[Achternaam]", "[Organisatie]", "[Nummers]"];

export default function MailDrafterPage() {
  // Template state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusedField = useRef<"subject" | "body">("body");

  // Tracks state
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResults, setTrackResults] = useState<Track[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactsLoading, setContactsLoading] = useState(true);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

  // Load contacts
  useEffect(() => {
    fetch(`/api/contacts?query=${encodeURIComponent(contactQuery)}`, {
      credentials: "include",
      headers: getSessionHeaders(),
    })
      .then((r) => r.json())
      .then((d: { contacts?: Contact[] }) => setContacts((d.contacts ?? []).filter((c) => c.email)))
      .finally(() => setContactsLoading(false));
  }, [contactQuery]);

  // Load tracks with debounce
  useEffect(() => {
    setTracksLoading(true);
    const id = setTimeout(() => {
      fetch(`/api/feedback/main-tracks?query=${encodeURIComponent(trackQuery)}`, {
        credentials: "include",
        headers: getSessionHeaders(),
      })
        .then((r) => r.json())
        .then((d: { tracks?: Track[] }) => setTrackResults(d.tracks ?? []))
        .finally(() => setTracksLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [trackQuery]);

  // Insert variable at cursor position
  const insertVar = useCallback((v: string) => {
    if (focusedField.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + v + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + v.length, start + v.length);
      });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + v + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + v.length, start + v.length);
      });
    }
  }, [subject, body]);

  const toggleTrack = useCallback((track: Track) => {
    setSelectedTracks((prev) => {
      const exists = prev.some((t) => t.spotifyTrackId === track.spotifyTrackId);
      return exists
        ? prev.filter((t) => t.spotifyTrackId !== track.spotifyTrackId)
        : [...prev, track];
    });
  }, []);

  const toggleContact = useCallback((id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllContacts = useCallback(() => {
    setSelectedContactIds(new Set(contacts.map((c) => c.id)));
  }, [contacts]);

  const clearContacts = useCallback(() => setSelectedContactIds(new Set()), []);

  const selectedContacts = contacts.filter((c) => selectedContactIds.has(c.id));
  const canGenerate = selectedContacts.length > 0 && subject.trim().length > 0;

  // Preview for first selected contact
  const previewContact = selectedContacts[0] ?? null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Mail Drafter
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Stel een gepersonaliseerde mail op, kies nummers en selecteer ontvangers. Per contact opent Apple Mail met een kant-en-klaar concept.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT: Template + Nummers */}
          <div className="space-y-5">

            {/* Template editor */}
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Template
              </h2>

              {/* Variable buttons */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 self-center mr-1">Variabelen:</span>
                {VARS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    className="rounded border border-zinc-300 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-700 hover:border-[#1DB954] hover:text-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Subject */}
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Onderwerp
              </label>
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => { focusedField.current = "subject"; }}
                placeholder="Bijv. Sport Sounds – [Organisatie]"
                className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />

              {/* Body */}
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Berichttekst
              </label>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => { focusedField.current = "body"; }}
                rows={12}
                placeholder={`Beste [Voornaam],\n\nWij willen graag de volgende nummers onder uw aandacht brengen:\n\n[Nummers]\n\nMet vriendelijke groet,\nSport Sounds`}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </section>

            {/* Nummers picker */}
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Nummers kiezen
              </h2>

              {selectedTracks.length > 0 && (
                <div className="mb-3 space-y-1">
                  {selectedTracks.map((t) => (
                    <div key={t.spotifyTrackId} className="flex items-center justify-between rounded-lg bg-[#1DB954]/10 px-3 py-1.5 text-sm dark:bg-[#1DB954]/20">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {t.title}
                        <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">
                          – {artistsLabel(t.artistsJson)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleTrack(t)}
                        className="ml-3 text-zinc-400 hover:text-red-500 dark:text-zinc-500"
                        aria-label="Verwijder"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="search"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                placeholder="Zoek nummers uit hoofd-playlists…"
                className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />

              <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {tracksLoading ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">Laden…</p>
                ) : trackResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">Geen nummers gevonden.</p>
                ) : (
                  trackResults.map((t) => {
                    const checked = selectedTracks.some((s) => s.spotifyTrackId === t.spotifyTrackId);
                    return (
                      <label
                        key={t.spotifyTrackId}
                        className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTrack(t)}
                          className="h-4 w-4 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]"
                        />
                        <span className="flex-1 text-zinc-900 dark:text-zinc-100">
                          {t.title}
                          <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                            – {artistsLabel(t.artistsJson)}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* RIGHT: Ontvangers + Preview */}
          <div className="space-y-5">

            {/* Ontvangers */}
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Ontvangers
                  {selectedContactIds.size > 0 && (
                    <span className="ml-2 rounded-full bg-[#1DB954] px-2 py-0.5 text-xs font-semibold text-white">
                      {selectedContactIds.size}
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAllContacts} className="text-xs text-[#1DB954] hover:underline">
                    Alles
                  </button>
                  <button type="button" onClick={clearContacts} className="text-xs text-zinc-400 hover:underline">
                    Wissen
                  </button>
                </div>
              </div>

              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Zoek contacten…"
                className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />

              <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {contactsLoading ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">Laden…</p>
                ) : contacts.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">Geen contacten met e-mailadres gevonden.</p>
                ) : (
                  contacts.map((c) => {
                    const checked = selectedContactIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleContact(c.id)}
                          className="h-4 w-4 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]"
                        />
                        <span className="flex-1">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.fullName}</span>
                          {c.organizationName && (
                            <span className="ml-1 text-zinc-500 dark:text-zinc-400">· {c.organizationName}</span>
                          )}
                          <br />
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">{c.email}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>

            {/* Live preview */}
            {previewContact && (
              <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Preview — {previewContact.fullName}
                </h2>
                <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Onderwerp</div>
                <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                  {resolveVars(subject, previewContact, selectedTracks) || <span className="italic text-zinc-400">Geen onderwerp</span>}
                </p>
                <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Berichttekst</div>
                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 font-sans text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  {resolveVars(body, previewContact, selectedTracks) || <span className="italic text-zinc-400">Geen tekst</span>}
                </pre>
              </section>
            )}
          </div>
        </div>

        {/* Generate drafts */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Concepten genereren
            </h2>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => setShowPreview(true)}
              className="rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1ed760] disabled:opacity-40"
            >
              {selectedContacts.length === 0
                ? "Selecteer ontvangers"
                : `${selectedContacts.length} concept${selectedContacts.length === 1 ? "" : "en"} genereren`}
            </button>
          </div>

          {showPreview && canGenerate && (
            <div className="space-y-2">
              <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                Klik op "Open in Mail" om het concept te openen in Apple Mail. Herhaal dit voor elke ontvanger.
              </p>
              {selectedContacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                  <div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.fullName}</span>
                    {c.organizationName && (
                      <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">· {c.organizationName}</span>
                    )}
                    <br />
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{c.email}</span>
                  </div>
                  <a
                    href={buildMailto(c, subject, body, selectedTracks)}
                    className="ml-4 shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Open in Mail ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
