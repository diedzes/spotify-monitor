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

type SpotifyTrack = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl: string | null;
};

type PromoTrack = {
  id: string;
  label: string;
  fatdropUrl: string;
  spotifyTrackId: string | null;
};

type SelectedTrack =
  | { kind: "spotify"; track: SpotifyTrack }
  | { kind: "promo"; track: PromoTrack };

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

function selectedTrackKey(t: SelectedTrack): string {
  return t.kind === "spotify" ? `spotify:${t.track.spotifyTrackId}` : `promo:${t.track.id}`;
}

function formatTrackForEmail(t: SelectedTrack): string {
  if (t.kind === "spotify") {
    const url = t.track.spotifyUrl ?? `https://open.spotify.com/track/${t.track.spotifyTrackId}`;
    return `• ${t.track.title} – ${artistsLabel(t.track.artistsJson)}\n  ${url}`;
  }
  return `• ${t.track.label}\n  ${t.track.fatdropUrl}`;
}

function resolveVars(template: string, contact: Contact, tracks: SelectedTrack[]): string {
  const { voornaam, achternaam } = splitName(contact.fullName);
  const nummers = tracks.map(formatTrackForEmail).join("\n\n");
  return template
    .replace(/\[Voornaam\]/g, voornaam)
    .replace(/\[Achternaam\]/g, achternaam)
    .replace(/\[Organisatie\]/g, contact.organizationName ?? "")
    .replace(/\[Nummers\]/g, nummers);
}

function buildMailto(contact: Contact, subject: string, body: string, tracks: SelectedTrack[]): string {
  const s = resolveVars(subject, contact, tracks);
  const b = resolveVars(body, contact, tracks);
  return `mailto:${encodeURIComponent(contact.email!)}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
}

// Parseer geplakte FatDrop lijst (formaat: "Label: https://promo.fatdrop.co.uk/...")
function parseFatDropList(raw: string): Array<{ label: string; fatdropUrl: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("https://promo.fatdrop.co.uk/"))
    .map((line) => {
      const urlMatch = line.match(/(https:\/\/promo\.fatdrop\.co\.uk\/[^\s]+)/);
      if (!urlMatch) return null;
      const url = urlMatch[1];
      const label = line.replace(url, "").replace(/:?\s*$/, "").trim();
      return { label: label || url, fatdropUrl: url };
    })
    .filter((x): x is { label: string; fatdropUrl: string } => x !== null);
}

const VARS = ["[Voornaam]", "[Achternaam]", "[Organisatie]", "[Nummers]"];

export default function MailDrafterPage() {
  // Template
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusedField = useRef<"subject" | "body">("body");

  // Track tabs
  const [trackTab, setTrackTab] = useState<"spotify" | "fatdrop">("spotify");

  // Spotify tracks
  const [trackQuery, setTrackQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrack[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);

  // FatDrop / PromoTracks
  const [promoTracks, setPromoTracks] = useState<PromoTrack[]>([]);
  const [promoLoading, setPromoLoading] = useState(true);
  const [promoQuery, setPromoQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Selected tracks (mix of spotify + promo)
  const [selectedTracks, setSelectedTracks] = useState<SelectedTrack[]>([]);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactsLoading, setContactsLoading] = useState(true);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // Load contacts
  useEffect(() => {
    setContactsLoading(true);
    fetch(`/api/contacts?query=${encodeURIComponent(contactQuery)}`, {
      credentials: "include",
      headers: getSessionHeaders(),
    })
      .then((r) => r.json())
      .then((d: { contacts?: Contact[] }) => setContacts((d.contacts ?? []).filter((c) => c.email)))
      .finally(() => setContactsLoading(false));
  }, [contactQuery]);

  // Load Spotify tracks with debounce
  useEffect(() => {
    setSpotifyLoading(true);
    const id = setTimeout(() => {
      fetch(`/api/feedback/main-tracks?query=${encodeURIComponent(trackQuery)}`, {
        credentials: "include",
        headers: getSessionHeaders(),
      })
        .then((r) => r.json())
        .then((d: { tracks?: SpotifyTrack[] }) => setSpotifyResults(d.tracks ?? []))
        .finally(() => setSpotifyLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [trackQuery]);

  // Load PromoTracks
  const loadPromoTracks = useCallback(() => {
    setPromoLoading(true);
    fetch("/api/promo-tracks", { credentials: "include", headers: getSessionHeaders() })
      .then((r) => r.json())
      .then((d: { tracks?: PromoTrack[] }) => setPromoTracks(d.tracks ?? []))
      .finally(() => setPromoLoading(false));
  }, []);

  useEffect(() => { loadPromoTracks(); }, [loadPromoTracks]);

  // Import FatDrop list
  const handleImport = useCallback(async () => {
    const parsed = parseFatDropList(importText);
    if (parsed.length === 0) {
      setImportResult("Geen geldige FatDrop-links gevonden. Zorg dat elke regel de volledige URL bevat.");
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/promo-tracks", {
        method: "POST",
        credentials: "include",
        headers: { ...getSessionHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: parsed }),
      });
      const data = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !data.ok) {
        setImportResult(data.error ?? "Import mislukt");
      } else {
        setImportResult(`✓ ${data.count} nummers geïmporteerd`);
        setImportText("");
        setShowImport(false);
        loadPromoTracks();
      }
    } catch {
      setImportResult("Import mislukt");
    } finally {
      setImportLoading(false);
    }
  }, [importText, loadPromoTracks]);

  // Delete promo tracks
  const deletePromoTracks = useCallback(async (ids: string[]) => {
    await fetch("/api/promo-tracks", {
      method: "DELETE",
      credentials: "include",
      headers: { ...getSessionHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setSelectedTracks((prev) => prev.filter((t) => !(t.kind === "promo" && ids.includes(t.track.id))));
    loadPromoTracks();
  }, [loadPromoTracks]);

  // Insert variable at cursor
  const insertVar = useCallback((v: string) => {
    if (focusedField.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + v + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length); });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + v + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length); });
    }
  }, [subject, body]);

  const toggleSpotifyTrack = useCallback((track: SpotifyTrack) => {
    setSelectedTracks((prev) => {
      const key = `spotify:${track.spotifyTrackId}`;
      const exists = prev.some((t) => selectedTrackKey(t) === key);
      return exists ? prev.filter((t) => selectedTrackKey(t) !== key) : [...prev, { kind: "spotify", track }];
    });
  }, []);

  const togglePromoTrack = useCallback((track: PromoTrack) => {
    setSelectedTracks((prev) => {
      const key = `promo:${track.id}`;
      const exists = prev.some((t) => selectedTrackKey(t) === key);
      return exists ? prev.filter((t) => selectedTrackKey(t) !== key) : [...prev, { kind: "promo", track }];
    });
  }, []);

  const toggleContact = useCallback((id: string) => {
    setSelectedContactIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const filteredPromo = promoQuery.trim()
    ? promoTracks.filter((t) => t.label.toLowerCase().includes(promoQuery.toLowerCase()))
    : promoTracks;

  const selectedContacts = contacts.filter((c) => selectedContactIds.has(c.id));
  const previewContact = selectedContacts[0] ?? null;
  const canGenerate = selectedContacts.length > 0 && subject.trim().length > 0;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Mail Drafter</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Stel een gepersonaliseerde mail op met Spotify- of FatDrop-nummers en stuur naar geselecteerde contacten.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT: Template + Nummers */}
          <div className="space-y-5">

            {/* Template editor */}
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Template</h2>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="self-center mr-1 text-xs text-zinc-400 dark:text-zinc-500">Variabelen:</span>
                {VARS.map((v) => (
                  <button key={v} type="button" onClick={() => insertVar(v)}
                    className="rounded border border-zinc-300 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-700 hover:border-[#1DB954] hover:text-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {v}
                  </button>
                ))}
              </div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Onderwerp</label>
              <input ref={subjectRef} type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                onFocus={() => { focusedField.current = "subject"; }}
                placeholder="Bijv. Sport Sounds – [Organisatie]"
                className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" />
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Berichttekst</label>
              <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)}
                onFocus={() => { focusedField.current = "body"; }}
                rows={12}
                placeholder={`Beste [Voornaam],\n\nWij willen graag de volgende nummers onder uw aandacht brengen:\n\n[Nummers]\n\nMet vriendelijke groet,\nSport Sounds`}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" />
            </section>

            {/* Nummers picker */}
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nummers kiezen</h2>

              {/* Geselecteerde nummers */}
              {selectedTracks.length > 0 && (
                <div className="mb-3 space-y-1">
                  {selectedTracks.map((t) => (
                    <div key={selectedTrackKey(t)} className="flex items-center justify-between rounded-lg bg-[#1DB954]/10 px-3 py-1.5 text-sm dark:bg-[#1DB954]/20">
                      <span className="flex items-center gap-2">
                        {t.kind === "promo" && (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">FD</span>
                        )}
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {t.kind === "spotify"
                            ? <>{t.track.title}<span className="ml-1 font-normal text-zinc-500"> – {artistsLabel(t.track.artistsJson)}</span></>
                            : t.track.label}
                        </span>
                      </span>
                      <button type="button" onClick={() => setSelectedTracks((p) => p.filter((x) => selectedTrackKey(x) !== selectedTrackKey(t)))}
                        className="ml-3 text-zinc-400 hover:text-red-500" aria-label="Verwijder">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div className="mb-3 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
                {(["spotify", "fatdrop"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setTrackTab(tab)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${trackTab === tab ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"}`}>
                    {tab === "spotify" ? "Spotify" : "FatDrop"}
                  </button>
                ))}
              </div>

              {trackTab === "spotify" && (
                <>
                  <input type="search" value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)}
                    placeholder="Zoek nummers uit hoofd-playlists…"
                    className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" />
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {spotifyLoading ? (
                      <p className="px-3 py-4 text-center text-xs text-zinc-400">Laden…</p>
                    ) : spotifyResults.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-zinc-400">Geen nummers gevonden.</p>
                    ) : spotifyResults.map((t) => {
                      const checked = selectedTracks.some((s) => selectedTrackKey(s) === `spotify:${t.spotifyTrackId}`);
                      return (
                        <label key={t.spotifyTrackId} className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                          <input type="checkbox" checked={checked} onChange={() => toggleSpotifyTrack(t)}
                            className="h-4 w-4 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]" />
                          <span className="flex-1 text-zinc-900 dark:text-zinc-100">
                            {t.title}<span className="ml-1 text-zinc-500"> – {artistsLabel(t.artistsJson)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {trackTab === "fatdrop" && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <input type="search" value={promoQuery} onChange={(e) => setPromoQuery(e.target.value)}
                      placeholder="Zoek FatDrop nummers…"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" />
                    <button type="button" onClick={() => setShowImport((v) => !v)}
                      className="ml-2 shrink-0 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      + Importeer
                    </button>
                  </div>

                  {/* Import panel */}
                  {showImport && (
                    <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
                      <p className="mb-1.5 text-xs font-medium text-orange-800 dark:text-orange-300">
                        Plak de FatDrop-lijst (één nummer per regel, URL verplicht):
                      </p>
                      <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5}
                        placeholder={"Jungle - The Wave: https://promo.fatdrop.co.uk/e/...\nMuse - Nightshift Superstar: https://promo.fatdrop.co.uk/e/..."}
                        className="mb-2 w-full rounded-lg border border-orange-200 bg-white px-3 py-2 font-mono text-xs dark:border-orange-700 dark:bg-zinc-900 dark:text-zinc-100" />
                      {importResult && (
                        <p className={`mb-2 text-xs ${importResult.startsWith("✓") ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {importResult}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={handleImport} disabled={importLoading || !importText.trim()}
                          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50">
                          {importLoading ? "Importeren…" : `Importeer ${parseFatDropList(importText).length} nummers`}
                        </button>
                        <button type="button" onClick={() => { setShowImport(false); setImportText(""); setImportResult(null); }}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400">
                          Annuleer
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {promoLoading ? (
                      <p className="px-3 py-4 text-center text-xs text-zinc-400">Laden…</p>
                    ) : filteredPromo.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-zinc-400">
                        {promoTracks.length === 0 ? "Nog geen FatDrop nummers. Klik op \"+ Importeer\" om te beginnen." : "Geen nummers gevonden."}
                      </p>
                    ) : filteredPromo.map((t) => {
                      const checked = selectedTracks.some((s) => selectedTrackKey(s) === `promo:${t.id}`);
                      return (
                        <div key={t.id} className="flex items-center border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                          <label className="flex flex-1 cursor-pointer items-center gap-3">
                            <input type="checkbox" checked={checked} onChange={() => togglePromoTrack(t)}
                              className="h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400" />
                            <span className="flex-1 text-zinc-900 dark:text-zinc-100">{t.label}</span>
                          </label>
                          <button type="button" onClick={() => deletePromoTracks([t.id])}
                            className="ml-2 text-zinc-300 hover:text-red-500 dark:text-zinc-600" title="Verwijder">✕</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
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
                    <span className="ml-2 rounded-full bg-[#1DB954] px-2 py-0.5 text-xs font-semibold text-white">{selectedContactIds.size}</span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedContactIds(new Set(contacts.map((c) => c.id)))}
                    className="text-xs text-[#1DB954] hover:underline">Alles</button>
                  <button type="button" onClick={() => setSelectedContactIds(new Set())}
                    className="text-xs text-zinc-400 hover:underline">Wissen</button>
                </div>
              </div>
              <input type="search" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Zoek contacten…"
                className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-[#1DB954] focus:outline-none focus:ring-1 focus:ring-[#1DB954] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {contactsLoading ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">Laden…</p>
                ) : contacts.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">Geen contacten met e-mailadres.</p>
                ) : contacts.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                    <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => toggleContact(c.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]" />
                    <span className="flex-1">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.fullName}</span>
                      {c.organizationName && <span className="ml-1 text-zinc-500"> · {c.organizationName}</span>}
                      <br />
                      <span className="text-xs text-zinc-400">{c.email}</span>
                    </span>
                  </label>
                ))}
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

        {/* Genereer concepten */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Concepten genereren</h2>
            <button type="button" disabled={!canGenerate} onClick={() => setShowPreview(true)}
              className="rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1ed760] disabled:opacity-40">
              {selectedContacts.length === 0 ? "Selecteer ontvangers" : `${selectedContacts.length} concept${selectedContacts.length === 1 ? "" : "en"} genereren`}
            </button>
          </div>
          {showPreview && canGenerate && (
            <div className="space-y-2">
              <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                Klik op "Open in Mail" per ontvanger om het concept in Apple Mail te openen.
              </p>
              {selectedContacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.fullName}</span>
                    {c.organizationName && <span className="ml-2 text-sm text-zinc-500"> · {c.organizationName}</span>}
                    <br />
                    <span className="text-xs text-zinc-400">{c.email}</span>
                  </div>
                  <a href={buildMailto(c, subject, body, selectedTracks)}
                    className="ml-4 shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
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
