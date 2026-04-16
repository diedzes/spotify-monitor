"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: string; fullName: string; organizationName: string | null; email?: string | null };
type Track = {
  spotifyTrackId: string;
  title: string;
  artistsJson: string;
  spotifyUrl: string | null;
  playlistNames?: string[];
  isHitlistTrack?: boolean;
};
type Batch = { id: string; name: string; tracks: Track[]; lastUsedAt?: string | null; updatedAt?: string };
type Step = 1 | 2 | 3 | 4;

function artistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter(Boolean).join(", ");
  } catch {
    return "Unknown";
  }
}

type Props = { preselectedTrackId?: string | null; preselectedBatchId?: string | null };

export function FeedbackEntryForm({ preselectedTrackId = null, preselectedBatchId = null }: Props) {
  const router = useRouter();
  const contactSearchRef = useRef<HTMLInputElement | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<"single" | "batch">(preselectedBatchId ? "batch" : "single");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [trackQuery, setTrackQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState(preselectedTrackId ?? "");
  const [selectedBatchId, setSelectedBatchId] = useState(preselectedBatchId ?? "");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackAt, setFeedbackAt] = useState(new Date().toISOString().slice(0, 16));
  const [inlineContactName, setInlineContactName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastChosenBatchId, setLastChosenBatchId] = useState<string | null>(null);

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
    fetch("/api/contacts?recent=1", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setRecentContacts(data.contacts ?? []));
  }, []);

  useEffect(() => {
    fetch(`/api/contacts?query=${encodeURIComponent(contactQuery)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setContacts(data.contacts ?? []));
  }, [contactQuery]);

  const selectedTrack = useMemo(() => tracks.find((t) => t.spotifyTrackId === selectedTrackId) ?? null, [tracks, selectedTrackId]);
  const canContinueStep2 = mode === "single" ? Boolean(selectedTrackId) : Boolean(selectedBatchId);
  const canSubmit = Boolean(feedbackText.trim()) && canContinueStep2;
  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) ?? null, [batches, selectedBatchId]);
  const selectedContact = useMemo(() => {
    return [...recentContacts, ...contacts].find((contact) => contact.id === selectedContactId) ?? null;
  }, [recentContacts, contacts, selectedContactId]);
  const sortedBatches = useMemo(() => {
    const copy = [...batches];
    copy.sort((a, b) => {
      if (a.id === lastChosenBatchId) return -1;
      if (b.id === lastChosenBatchId) return 1;
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    return copy;
  }, [batches, lastChosenBatchId]);

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
    setRecentContacts((prev) => [data.contact, ...prev.filter((c) => c.id !== data.contact.id)].slice(0, 6));
  }

  function goToStep(next: Step) {
    setStep(next);
    window.requestAnimationFrame(() => {
      if (next === 3) contactSearchRef.current?.focus();
      if (next === 4) feedbackRef.current?.focus();
    });
  }

  async function submitFeedback() {
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
    if (mode === "batch" && selectedBatchId) setLastChosenBatchId(selectedBatchId);
    router.push("/feedback");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitFeedback();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && step === 4) {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
          event.preventDefault();
          void submitFeedback();
        }
      }
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && step < 4) {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (target.tagName === "TEXTAREA") return;
        if (target.tagName === "BUTTON") return;
        if (step !== 2 || canContinueStep2) {
          event.preventDefault();
          goToStep((step + 1) as Step);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, canContinueStep2, mode, selectedBatchId, selectedTrackId, feedbackText, feedbackAt, selectedContactId]);

  function highlight(text: string, query: string) {
    if (!query.trim()) return text;
    const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
    if (index === -1) return text;
    return (
      <>
        {text.slice(0, index)}
        <mark className="rounded bg-emerald-100 px-0.5 text-inherit">{text.slice(index, index + query.length)}</mark>
        {text.slice(index + query.length)}
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="sticky top-20 z-10 rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="grid grid-cols-4 gap-2">
        {steps.map((s) => {
          const active = step === s.id;
          const done = step > s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goToStep(s.id)}
              className={`rounded border px-2 py-2 text-xs font-medium ${
                active ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" : done ? "border-emerald-300 text-emerald-700" : "border-zinc-300 text-zinc-500"
              }`}
            >
              {s.id}. {s.label}
            </button>
          );
        })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <button type="button" onClick={() => goToStep(1)} className="rounded-full border border-zinc-300 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Type: <span className="font-medium">{mode === "batch" ? "Batch" : "Single"}</span>
          </button>
          {selectedBatch ? (
            <button type="button" onClick={() => goToStep(2)} className="rounded-full border border-zinc-300 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Batch: <span className="font-medium">{selectedBatch.name}</span>
            </button>
          ) : null}
          {selectedTrack ? (
            <button type="button" onClick={() => goToStep(2)} className="rounded-full border border-zinc-300 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Track: <span className="font-medium">{selectedTrack.title}</span>
            </button>
          ) : null}
          {selectedContact ? (
            <button type="button" onClick={() => goToStep(3)} className="rounded-full border border-zinc-300 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Contact: <span className="font-medium">{selectedContact.fullName}{selectedContact.organizationName ? ` / ${selectedContact.organizationName}` : ""}</span>
            </button>
          ) : null}
        </div>
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
                {sortedBatches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.tracks.length} tracks){b.lastUsedAt ? ` - used ${new Date(b.lastUsedAt).toLocaleDateString("en-GB")}` : ""}</option>
                ))}
              </select>
              <a href="/feedback/batches/new" className="text-xs text-[#1DB954] hover:underline">Create new batch</a>
              <div className="max-h-56 overflow-auto rounded border border-zinc-200 dark:border-zinc-700">
                {sortedBatches.slice(0, 8).map((batch) => (
                  <button
                    key={batch.id}
                    type="button"
                    onClick={() => setSelectedBatchId(batch.id)}
                    className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 ${selectedBatchId === batch.id ? "bg-emerald-50 dark:bg-emerald-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                  >
                    <div>
                      <div className="font-medium">{batch.name}</div>
                      <div className="text-xs text-zinc-500">{batch.tracks.length} tracks • {batch.lastUsedAt ? `Last used ${new Date(batch.lastUsedAt).toLocaleDateString("en-GB")}` : `Updated ${batch.updatedAt ? new Date(batch.updatedAt).toLocaleDateString("en-GB") : "recently"}`}</div>
                    </div>
                    {batch.id === lastChosenBatchId ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Suggested</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">Step 3: Choose contact</p>
          <input ref={contactSearchRef} value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} placeholder="Search name, organization or e-mail" className="w-full rounded border px-3 py-2 text-sm" />
          {recentContacts.length > 0 ? (
            <div className="rounded border border-zinc-200 dark:border-zinc-700">
              <div className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recent</div>
              <div className="max-h-40 overflow-auto">
                {recentContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedContactId(c.id)}
                    className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 ${selectedContactId === c.id ? "bg-emerald-50 dark:bg-emerald-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
                  >
                    <div>
                      <div className="font-medium">{c.fullName}</div>
                      <div className="text-xs text-zinc-500">{c.organizationName ?? c.email ?? "Recently used"}</div>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Recent</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No recent contacts yet. Pick a contact or add one inline.</p>
          )}
          <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.fullName}{c.organizationName ? ` (${c.organizationName})` : ""}{c.email ? ` - ${c.email}` : ""}</option>
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
          <textarea ref={feedbackRef} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={5} placeholder="Feedback text" className="w-full rounded border px-3 py-2 text-sm" />
          <input type="datetime-local" value={feedbackAt} onChange={(e) => setFeedbackAt(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          <p className="text-xs text-zinc-500">Tip: press Cmd/Ctrl + Enter to save.</p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center justify-between">
          <button type="button" disabled={step === 1} onClick={() => goToStep(Math.max(1, step - 1) as Step)} className="rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50">
          Back
        </button>
        <div className="flex items-center gap-2">
          {step < 4 ? (
            <button
              type="button"
              disabled={(step === 2 && !canContinueStep2)}
              onClick={() => goToStep(Math.min(4, step + 1) as Step)}
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
      {step === 2 && mode === "single" ? (
        <div className="max-h-72 overflow-auto rounded border border-zinc-200 dark:border-zinc-700">
          {tracks.map((track) => {
            const active = selectedTrackId === track.spotifyTrackId;
            return (
              <button
                key={track.spotifyTrackId}
                type="button"
                onClick={() => setSelectedTrackId(track.spotifyTrackId)}
                className={`flex w-full items-start gap-3 border-b px-3 py-2 text-left last:border-0 ${active ? "bg-emerald-50 dark:bg-emerald-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
              >
                <div className="mt-0.5 h-4 w-4 rounded-full border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">{active ? <div className="m-[3px] h-2 w-2 rounded-full bg-emerald-500" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{highlight(track.title, trackQuery)}</div>
                  <div className="truncate text-xs text-zinc-500">{highlight(artistsLabel(track.artistsJson), trackQuery)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(track.playlistNames ?? []).slice(0, 2).map((playlistName) => (
                      <span key={playlistName} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {playlistName}
                      </span>
                    ))}
                    {track.isHitlistTrack ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Hitlist</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </form>
  );
}
