"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: string; fullName: string; organizationName: string | null };
type Track = { spotifyTrackId: string; title: string; artistsJson: string; spotifyUrl: string | null };
type Batch = { id: string; name: string; tracks: Track[] };

function artistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter(Boolean).join(", ");
  } catch {
    return "Unknown";
  }
}

type Props = { preselectedTrackId?: string | null };

export function FeedbackEntryForm({ preselectedTrackId = null }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [trackQuery, setTrackQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState(preselectedTrackId ?? "");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackAt, setFeedbackAt] = useState(new Date().toISOString().slice(0, 16));
  const [inlineContactName, setInlineContactName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/feedback/main-tracks?query=${encodeURIComponent(trackQuery)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setTracks(data.tracks ?? []));
  }, [trackQuery]);

  useEffect(() => {
    fetch("/api/feedback/batches", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setBatches(data.batches ?? []));
  }, []);

  useEffect(() => {
    fetch(`/api/contacts?query=${encodeURIComponent(contactQuery)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setContacts(data.contacts ?? []));
  }, [contactQuery]);

  const selectedTrack = useMemo(() => tracks.find((t) => t.spotifyTrackId === selectedTrackId) ?? null, [tracks, selectedTrackId]);

  async function onCreateInlineContact() {
    if (!inlineContactName.trim()) return;
    const res = await fetch("/api/contacts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: inlineContactName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create contact");
      return;
    }
    setSelectedContactId(data.contact.id);
    setInlineContactName("");
    setContacts((prev) => [data.contact, ...prev]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload =
      mode === "single"
        ? {
            contactId: selectedContactId || null,
            feedbackText,
            feedbackAt: new Date(feedbackAt).toISOString(),
            tracks: selectedTrack ? [selectedTrack] : [],
          }
        : {
            contactId: selectedContactId || null,
            feedbackText,
            feedbackAt: new Date(feedbackAt).toISOString(),
            feedbackBatchId: selectedBatchId || null,
          };
    const res = await fetch("/api/feedback", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not save feedback");
      return;
    }
    router.push("/feedback");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={mode === "single"} onChange={() => setMode("single")} />
          Single track
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={mode === "batch"} onChange={() => setMode("batch")} />
          Batch feedback
        </label>
      </div>

      {mode === "single" ? (
        <div className="space-y-2">
          <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Search tracks in Main Playlists" className="w-full rounded border px-3 py-2 text-sm" />
          <select value={selectedTrackId} onChange={(e) => setSelectedTrackId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
            <option value="">Select track</option>
            {tracks.map((t) => (
              <option key={t.spotifyTrackId} value={t.spotifyTrackId}>{t.title} - {artistsLabel(t.artistsJson)}</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
            <option value="">Select existing batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.tracks.length} tracks)</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <input value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} placeholder="Search contact" className="w-full rounded border px-3 py-2 text-sm" />
        <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
          <option value="">No contact</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.fullName}{c.organizationName ? ` (${c.organizationName})` : ""}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input value={inlineContactName} onChange={(e) => setInlineContactName(e.target.value)} placeholder="Or add contact inline" className="flex-1 rounded border px-3 py-2 text-sm" />
          <button type="button" onClick={onCreateInlineContact} className="rounded bg-zinc-200 px-3 py-2 text-sm dark:bg-zinc-700">Add</button>
        </div>
      </div>

      <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={5} placeholder="Feedback text" className="w-full rounded border px-3 py-2 text-sm" />
      <input type="datetime-local" value={feedbackAt} onChange={(e) => setFeedbackAt(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" className="rounded bg-[#1DB954] px-4 py-2 text-sm font-medium text-white">Save feedback</button>
    </form>
  );
}
