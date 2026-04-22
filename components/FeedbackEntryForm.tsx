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
type EntryKind = "comment" | "sync" | "play";
type RecentMatch = {
  id: number;
  utcDate: string;
  competitionName: string | null;
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
  scoreHome: number | null;
  scoreAway: number | null;
  attendance: number | null;
};

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
  const [entryKind, setEntryKind] = useState<EntryKind>("comment");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [feedbackAt, setFeedbackAt] = useState(new Date().toISOString().slice(0, 16));
  const [inlineContactName, setInlineContactName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastChosenBatchId, setLastChosenBatchId] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [manualHomeClub, setManualHomeClub] = useState("");
  const [manualAwayClub, setManualAwayClub] = useState("");
  const [manualHomeScore, setManualHomeScore] = useState("");
  const [manualAwayScore, setManualAwayScore] = useState("");
  const [manualAttendance, setManualAttendance] = useState("");

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
  const canSubmit =
    canContinueStep2 &&
    (mode === "batch"
      ? Boolean(feedbackText.trim())
      : entryKind === "comment"
        ? Boolean(feedbackText.trim())
        : entryKind === "play"
          ? Boolean(feedbackText.trim()) ||
            Boolean(evidenceUrl.trim()) ||
            Boolean(selectedMatchId) ||
            Boolean(manualHomeClub.trim() && manualAwayClub.trim())
          : Boolean(feedbackText.trim()) || Boolean(evidenceUrl.trim()));
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

  useEffect(() => {
    if (mode === "batch") {
      setEntryKind("comment");
      setEvidenceUrl("");
    }
  }, [mode]);

  useEffect(() => {
    if (entryKind === "comment") setEvidenceUrl("");
  }, [entryKind]);

  useEffect(() => {
    if (entryKind !== "play") {
      setSelectedMatchId("");
      setManualHomeClub("");
      setManualAwayClub("");
      setManualHomeScore("");
      setManualAwayScore("");
      setManualAttendance("");
      setMatchesError(null);
    }
  }, [entryKind]);

  const selectedMatch = useMemo(
    () => recentMatches.find((m) => String(m.id) === selectedMatchId) ?? null,
    [recentMatches, selectedMatchId]
  );

  async function loadRecentMatches() {
    setMatchesError(null);
    setMatchesLoading(true);
    try {
      const res = await fetch("/api/football/recent-matches?days=14", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setMatchesError(data.error ?? "Could not load matches");
        setMatchesLoading(false);
        return;
      }
      setRecentMatches(data.matches ?? []);
    } catch {
      setMatchesError("Could not load matches");
    } finally {
      setMatchesLoading(false);
    }
  }

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
            entryKind,
            evidenceUrl: entryKind !== "comment" && evidenceUrl.trim() ? evidenceUrl.trim() : null,
            stadiumPlay:
              entryKind === "play"
                ? {
                    matchExternalId: selectedMatch ? String(selectedMatch.id) : null,
                    competitionName: selectedMatch?.competitionName ?? null,
                    matchUtc: selectedMatch?.utcDate ?? null,
                    homeClub: selectedMatch?.homeTeam.name ?? (manualHomeClub.trim() || null),
                    awayClub: selectedMatch?.awayTeam.name ?? (manualAwayClub.trim() || null),
                    homeCrestUrl: selectedMatch?.homeTeam.crest ?? null,
                    awayCrestUrl: selectedMatch?.awayTeam.crest ?? null,
                    homeScore:
                      selectedMatch?.scoreHome ??
                      (manualHomeScore.trim() ? Number.parseInt(manualHomeScore.trim(), 10) : null),
                    awayScore:
                      selectedMatch?.scoreAway ??
                      (manualAwayScore.trim() ? Number.parseInt(manualAwayScore.trim(), 10) : null),
                    attendance:
                      selectedMatch?.attendance ??
                      (manualAttendance.trim() ? Number.parseInt(manualAttendance.trim(), 10) : null),
                  }
                : null,
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
  }, [step, canContinueStep2, mode, selectedBatchId, selectedTrackId, feedbackText, feedbackAt, selectedContactId, entryKind, evidenceUrl]);

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
            Type:{" "}
            <span className="font-medium">
              {mode === "batch" ? "Batch" : entryKind === "sync" ? "Media sync" : entryKind === "play" ? "Stadium play" : "Comment"}
            </span>
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
          {mode === "single" ? (
            <div className="mt-4 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">What are you logging?</p>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="entryKind" checked={entryKind === "comment"} onChange={() => setEntryKind("comment")} />
                  Comment
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="entryKind" checked={entryKind === "sync"} onChange={() => setEntryKind("sync")} />
                  Media sync
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="entryKind" checked={entryKind === "play"} onChange={() => setEntryKind("play")} />
                  Stadium play
                </label>
              </div>
              <p className="text-xs text-zinc-500">
                Use <strong>Media sync</strong> when the track appeared in external media; use <strong>Stadium play</strong> for a stadium spin. You can add an optional link as proof in the last step.
              </p>
            </div>
          ) : null}
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
          <p className="text-sm font-medium">
            Step 4: {mode === "batch" || entryKind === "comment" ? "Write feedback" : "Notes & evidence"}
          </p>
          <textarea
            ref={feedbackRef}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={5}
            placeholder={
              mode === "batch" || entryKind === "comment"
                ? "Feedback text"
                : entryKind === "sync"
                  ? "Where was it used? (optional if you add a link below)"
                  : "Which match or venue? (optional if you add a link below)"
            }
            className="w-full rounded border px-3 py-2 text-sm"
          />
          {mode === "single" && (entryKind === "sync" || entryKind === "play") ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Evidence link (optional)</label>
              <input
                type="url"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://x.com/… or TikTok / YouTube…"
                className="w-full rounded border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">We fetch a preview (title, image) when possible.</p>
            </div>
          ) : null}
          {mode === "single" && entryKind === "play" ? (
            <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Recent matches (football-data.org)</p>
                <button
                  type="button"
                  onClick={() => void loadRecentMatches()}
                  disabled={matchesLoading}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  {matchesLoading ? "Loading..." : "Load recent matches"}
                </button>
              </div>
              {matchesError ? <p className="text-xs text-red-600">{matchesError}</p> : null}
              {recentMatches.length > 0 ? (
                <select
                  value={selectedMatchId}
                  onChange={(e) => setSelectedMatchId(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm"
                >
                  <option value="">No match selected (manual input below)</option>
                  {recentMatches.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {new Date(m.utcDate).toLocaleDateString("en-GB")} - {m.homeTeam.name} vs {m.awayTeam.name}
                      {typeof m.scoreHome === "number" && typeof m.scoreAway === "number"
                        ? ` (${m.scoreHome}-${m.scoreAway})`
                        : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-zinc-500">No recent matches loaded yet.</p>
              )}

              {!selectedMatch ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={manualHomeClub}
                    onChange={(e) => setManualHomeClub(e.target.value)}
                    placeholder="Home club"
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                  <input
                    value={manualAwayClub}
                    onChange={(e) => setManualAwayClub(e.target.value)}
                    placeholder="Away club"
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualHomeScore}
                    onChange={(e) => setManualHomeScore(e.target.value)}
                    placeholder="Home score (optional)"
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualAwayScore}
                    onChange={(e) => setManualAwayScore(e.target.value)}
                    placeholder="Away score (optional)"
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualAttendance}
                    onChange={(e) => setManualAttendance(e.target.value)}
                    placeholder="Attendance (optional)"
                    className="w-full rounded border px-3 py-2 text-sm sm:col-span-2"
                  />
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Match selected. Clubs, score, crest and attendance (if available) will be saved.
                </p>
              )}
            </div>
          ) : null}
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
