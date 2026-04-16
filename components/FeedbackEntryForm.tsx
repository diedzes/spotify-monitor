"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: string; fullName: string; organizationName: string | null };
type Track = { spotifyTrackId: string; title: string; artistsJson: string; spotifyUrl: string | null };
type Batch = { id: string; name: string; tracks: Track[] };
type Step = 1 | 2 | 3 | 4;

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
  const [step, setStep] = useState<Step>(1);
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
  const [saving, setSaving] = useState(false);

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
  const canContinueStep2 = mode === "single" ? Boolean(selectedTrackId) : Boolean(selectedBatchId);
  const canSubmit = Boolean(feedbackText.trim()) && canContinueStep2;

  const steps: Array<{ id: Step; label: string }> = [
    { id: 1, label: "Type" },
    { id: 2, label: "Track/Batch" },
    { id: 3, label: "Contact" },
    { id: 4, label: "Feedback" },
  ];

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
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
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
      setSaving(false);
      return;
    }
    router.push("/feedback");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="grid grid-cols-4 gap-2">
        {steps.map((s) => {
          const active = step === s.id;
          const done = step > s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`rounded border px-2 py-2 text-xs font-medium ${
                active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : done ? "border-emerald-300 text-emerald-700" : "border-zinc-300 text-zinc-500"
              }`}
            >
              {s.id}. {s.label}
            </button>
          );
        })}
      </div>

      {step === 1 ? (
        <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">Step 1: Choose feedback type</p>
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
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">Step 2: {mode === "single" ? "Select track" : "Select or create batch"}</p>
          {mode === "single" ? (
            <>
              <input value={trackQuery} onChange={(e) => setTrackQuery(e.target.value)} placeholder="Search tracks in Main Playlists" className="w-full rounded border px-3 py-2 text-sm" />
              <select value={selectedTrackId} onChange={(e) => setSelectedTrackId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Select track</option>
                {tracks.map((t) => (
                  <option key={t.spotifyTrackId} value={t.spotifyTrackId}>{t.title} - {artistsLabel(t.artistsJson)}</option>
                ))}
              </select>
            </>
          ) : (
            <div className="space-y-2">
              <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
                <option value="">Select existing batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.tracks.length} tracks)</option>
                ))}
              </select>
              <a href="/feedback/batches/new" className="text-xs text-[#1DB954] hover:underline">Create new batch</a>
            </div>
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">Step 3: Choose contact</p>
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
      ) : null}

      {step === 4 ? (
        <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">Step 4: Write feedback</p>
          <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={5} placeholder="Feedback text" className="w-full rounded border px-3 py-2 text-sm" />
          <input type="datetime-local" value={feedbackAt} onChange={(e) => setFeedbackAt(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center justify-between">
        <button type="button" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1) as Step)} className="rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50">
          Back
        </button>
        <div className="flex items-center gap-2">
          {step < 4 ? (
            <button
              type="button"
              disabled={(step === 2 && !canContinueStep2)}
              onClick={() => setStep((s) => Math.min(4, s + 1) as Step)}
              className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button type="submit" disabled={!canSubmit || saving} className="rounded bg-[#1DB954] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save feedback"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
