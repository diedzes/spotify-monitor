"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EvidenceLinkPreview } from "@/components/EvidenceLinkPreview";

type FeedItem = any;
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

function truncate(text: string, len = 160) {
  return text.length <= len ? text : `${text.slice(0, len)}...`;
}

function artistsLabel(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return arr.map((a) => a.name).filter(Boolean).join(", ");
  } catch {
    return "Unknown";
  }
}

export function FeedbackFeedClient({ initialFeed }: { initialFeed: FeedItem[] }) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [query, setQuery] = useState("");
  const [trackDetail, setTrackDetail] = useState<any | null>(null);
  const [entryDetail, setEntryDetail] = useState<any | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [trackCache, setTrackCache] = useState<Record<string, any>>({});
  const [entryCache, setEntryCache] = useState<Record<string, any>>({});
  const [editText, setEditText] = useState("");
  const [editAt, setEditAt] = useState("");
  const [editEntryKind, setEditEntryKind] = useState<"comment" | "sync" | "play">("comment");
  const [editEvidenceUrl, setEditEvidenceUrl] = useState("");
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [editSelectedMatchId, setEditSelectedMatchId] = useState("");
  const [editCompetitionName, setEditCompetitionName] = useState("");
  const [editMatchUtc, setEditMatchUtc] = useState("");
  const [editHomeClub, setEditHomeClub] = useState("");
  const [editAwayClub, setEditAwayClub] = useState("");
  const [editHomeCrestUrl, setEditHomeCrestUrl] = useState("");
  const [editAwayCrestUrl, setEditAwayCrestUrl] = useState("");
  const [editHomeScore, setEditHomeScore] = useState("");
  const [editAwayScore, setEditAwayScore] = useState("");
  const [editAttendance, setEditAttendance] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedRecentMatch = useMemo(
    () => recentMatches.find((m) => String(m.id) === editSelectedMatchId) ?? null,
    [recentMatches, editSelectedMatchId]
  );

  async function loadRecentMatchesForEdit() {
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

  async function openTrack(trackId: string) {
    setModalError(null);
    const cached = trackCache[trackId];
    if (cached) {
      setTrackDetail(cached);
      return;
    }
    setTrackLoading(true);
    const res = await fetch(`/api/feedback/track?spotifyTrackId=${encodeURIComponent(trackId)}`, { credentials: "include" });
    const detail = await res.json();
    setTrackCache((prev) => ({ ...prev, [trackId]: detail }));
    setTrackDetail(detail);
    setTrackLoading(false);
  }

  async function openEntry(id: string) {
    setModalError(null);
    const cached = entryCache[id];
    if (cached) {
      setEntryDetail(cached);
      setEditText(cached.feedbackText ?? "");
      setEditAt(new Date(cached.feedbackAt).toISOString().slice(0, 16));
      setEditEntryKind(cached.feedbackBatch ? "comment" : cached.entryKind ?? "comment");
      setEditEvidenceUrl(cached.evidenceUrl ?? "");
      setEditSelectedMatchId(cached.stadiumMatchExternalId ?? "");
      setEditCompetitionName(cached.stadiumCompetitionName ?? "");
      setEditMatchUtc(cached.stadiumMatchUtc ? new Date(cached.stadiumMatchUtc).toISOString().slice(0, 16) : "");
      setEditHomeClub(cached.stadiumHomeClub ?? "");
      setEditAwayClub(cached.stadiumAwayClub ?? "");
      setEditHomeCrestUrl(cached.stadiumHomeCrestUrl ?? "");
      setEditAwayCrestUrl(cached.stadiumAwayCrestUrl ?? "");
      setEditHomeScore(typeof cached.stadiumHomeScore === "number" ? String(cached.stadiumHomeScore) : "");
      setEditAwayScore(typeof cached.stadiumAwayScore === "number" ? String(cached.stadiumAwayScore) : "");
      setEditAttendance(typeof cached.stadiumAttendance === "number" ? String(cached.stadiumAttendance) : "");
      return;
    }
    setEntryLoading(true);
    const res = await fetch(`/api/feedback/${id}`, { credentials: "include" });
    const data = await res.json();
    const detail = data.entry ?? null;
    if (detail) {
      setEntryCache((prev) => ({ ...prev, [id]: detail }));
      setEntryDetail(detail);
      setEditText(detail.feedbackText ?? "");
      setEditAt(new Date(detail.feedbackAt).toISOString().slice(0, 16));
      setEditEntryKind(detail.feedbackBatch ? "comment" : detail.entryKind ?? "comment");
      setEditEvidenceUrl(detail.evidenceUrl ?? "");
      setEditSelectedMatchId(detail.stadiumMatchExternalId ?? "");
      setEditCompetitionName(detail.stadiumCompetitionName ?? "");
      setEditMatchUtc(detail.stadiumMatchUtc ? new Date(detail.stadiumMatchUtc).toISOString().slice(0, 16) : "");
      setEditHomeClub(detail.stadiumHomeClub ?? "");
      setEditAwayClub(detail.stadiumAwayClub ?? "");
      setEditHomeCrestUrl(detail.stadiumHomeCrestUrl ?? "");
      setEditAwayCrestUrl(detail.stadiumAwayCrestUrl ?? "");
      setEditHomeScore(typeof detail.stadiumHomeScore === "number" ? String(detail.stadiumHomeScore) : "");
      setEditAwayScore(typeof detail.stadiumAwayScore === "number" ? String(detail.stadiumAwayScore) : "");
      setEditAttendance(typeof detail.stadiumAttendance === "number" ? String(detail.stadiumAttendance) : "");
    }
    setEntryLoading(false);
  }

  async function saveEntryEdit() {
    if (!entryDetail) return;
    setSaving(true);
    setModalError(null);
    const res = await fetch(`/api/feedback/${entryDetail.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedbackText: editText,
        feedbackAt: new Date(editAt).toISOString(),
        ...(entryDetail.feedbackBatch
          ? {}
          : {
              entryKind: editEntryKind,
              evidenceUrl: editEvidenceUrl.trim() || null,
              stadiumPlay:
                editEntryKind === "play"
                  ? {
                      matchExternalId: selectedRecentMatch ? String(selectedRecentMatch.id) : editSelectedMatchId || null,
                      competitionName: selectedRecentMatch?.competitionName ?? (editCompetitionName.trim() || null),
                      matchUtc: selectedRecentMatch?.utcDate ?? (editMatchUtc ? new Date(editMatchUtc).toISOString() : null),
                      homeClub: selectedRecentMatch?.homeTeam.name ?? (editHomeClub.trim() || null),
                      awayClub: selectedRecentMatch?.awayTeam.name ?? (editAwayClub.trim() || null),
                      homeCrestUrl: selectedRecentMatch?.homeTeam.crest ?? (editHomeCrestUrl.trim() || null),
                      awayCrestUrl: selectedRecentMatch?.awayTeam.crest ?? (editAwayCrestUrl.trim() || null),
                      homeScore:
                        selectedRecentMatch?.scoreHome ??
                        (editHomeScore.trim() ? Number.parseInt(editHomeScore.trim(), 10) : null),
                      awayScore:
                        selectedRecentMatch?.scoreAway ??
                        (editAwayScore.trim() ? Number.parseInt(editAwayScore.trim(), 10) : null),
                      attendance:
                        selectedRecentMatch?.attendance ??
                        (editAttendance.trim() ? Number.parseInt(editAttendance.trim(), 10) : null),
                    }
                  : null,
            }),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setModalError(data.error ?? "Could not save changes");
      setSaving(false);
      return;
    }
    const updated = data.entry;
    setEntryDetail(updated);
    setEntryCache((prev) => ({ ...prev, [updated.id]: updated }));
    setFeed((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    setSaving(false);
  }

  async function deleteEntry() {
    if (!entryDetail) return;
    setSaving(true);
    setModalError(null);
    const res = await fetch(`/api/feedback/${entryDetail.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setModalError(data.error ?? "Could not delete feedback");
      setSaving(false);
      return;
    }
    setFeed((prev) => prev.filter((it) => it.id !== entryDetail.id));
    setEntryDetail(null);
    setSaving(false);
  }

  const shownFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return feed;
    return feed.filter((item) => {
      const isBatch = Boolean(item.feedbackBatch);
      const firstTrack = isBatch ? item.feedbackBatch?.tracks?.[0] : item.tracks?.[0];
      const haystack = [
        item.feedbackBatch?.name,
        firstTrack?.title,
        firstTrack?.artistsJson,
        item.contact?.fullName,
        item.contact?.organization?.name,
        item.feedbackText,
        item.entryKind,
        item.evidenceUrl,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [feed, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inEditable = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !inEditable) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.key === "n" || event.key === "N") && !inEditable) {
        event.preventDefault();
        window.location.href = "/feedback/new";
      }
      if (event.key === "Escape") {
        setTrackDetail(null);
        setEntryDetail(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search feedback, contact or track"
            className="w-full bg-transparent text-sm outline-none"
          />
          <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-700">/</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{shownFeed.length} items</span>
          <span>Press `N` for new feedback</span>
        </div>
      </div>
      <div className="space-y-3">
        {shownFeed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            {query.trim() ? "No feedback matches this search yet." : "No feedback yet. Add your first note to start building context."}
            <div className="mt-3">
              <Link href="/feedback/new" className="text-[#1DB954] hover:underline">Add feedback</Link>
            </div>
          </div>
        ) : null}
        {shownFeed.map((item) => {
          const isBatch = Boolean(item.feedbackBatch);
          const firstTrack = isBatch ? item.feedbackBatch.tracks[0] : item.tracks[0];
          return (
            <article key={item.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isBatch ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
                      {isBatch
                        ? "Batch"
                        : item.entryKind === "sync"
                          ? "Media sync"
                          : item.entryKind === "play"
                            ? "Stadium play"
                            : "Comment"}
                    </span>
                    <button onClick={() => openEntry(item.id)} className="truncate text-left text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                      {isBatch ? item.feedbackBatch.name : `${artistsLabel(firstTrack?.artistsJson ?? "[]")} - ${firstTrack?.title ?? "Track"}`}
                    </button>
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    {item.contact?.fullName ?? "No contact"}{item.contact?.organization?.name ? ` • ${item.contact.organization.name}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-500">{new Date(item.feedbackAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">{truncate(item.feedbackText, 180)}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <button onClick={() => openEntry(item.id)} className="text-zinc-600 hover:underline dark:text-zinc-300">Open detail</button>
                {firstTrack?.spotifyTrackId ? <button onClick={() => openTrack(firstTrack.spotifyTrackId)} className="text-zinc-600 hover:underline dark:text-zinc-300">Track detail</button> : null}
                <Link href={`/feedback/new${firstTrack?.spotifyTrackId ? `?trackId=${encodeURIComponent(firstTrack.spotifyTrackId)}` : ""}`} className="text-[#1DB954] hover:underline">Add feedback</Link>
                {firstTrack?.spotifyTrackId ? (
                  <Link href={`/feedback/track/${encodeURIComponent(firstTrack.spotifyTrackId)}/report`} className="text-zinc-600 hover:underline dark:text-zinc-300">
                    Client report
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {trackLoading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 text-sm dark:bg-zinc-900">Loading track detail...</div>
        </div>
      ) : null}

      {trackDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setTrackDetail(null)}>
          <div className="max-h-[82vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Track detail</h3>
                  <p className="text-sm">{trackDetail.track?.title ?? "Unknown"} - {artistsLabel(trackDetail.track?.artistsJson ?? "[]")}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Link href={`/feedback/new${trackDetail.track?.spotifyTrackId ? `?trackId=${encodeURIComponent(trackDetail.track.spotifyTrackId)}` : ""}`} className="rounded bg-[#1DB954] px-3 py-1.5 text-xs font-medium text-white">Add feedback</Link>
                  {trackDetail.track?.spotifyTrackId ? (
                    <Link
                      href={`/feedback/track/${encodeURIComponent(trackDetail.track.spotifyTrackId)}/report`}
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-white"
                    >
                      Client report (print/PDF)
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
            <section className="mb-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <h4 className="mb-2 text-sm font-semibold">Feedback</h4>
              <div className="space-y-2">
              {(trackDetail.feedback ?? []).map((f: any) => (
                <div key={f.id} className="rounded border p-2 text-sm">
                  {f.feedbackBatch ? (
                    <p className="mb-1 text-xs font-medium text-violet-700 dark:text-violet-300">Batch: {f.feedbackBatch.name}</p>
                  ) : f.entryKind && f.entryKind !== "comment" ? (
                    <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {f.entryKind === "sync" ? "Media sync" : "Stadium play"}
                    </p>
                  ) : (
                    <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Feedback</p>
                  )}
                  {f.feedbackText ? <p className="whitespace-pre-wrap">{truncate(f.feedbackText, 400)}</p> : null}
                  {f.stadiumHomeClub && f.stadiumAwayClub ? (
                    <div className="mt-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          {f.stadiumHomeCrestUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.stadiumHomeCrestUrl} alt="" className="h-4 w-4 object-contain" />
                          ) : null}
                          <span>{f.stadiumHomeClub}</span>
                        </div>
                        <span className="font-semibold">
                          {typeof f.stadiumHomeScore === "number" && typeof f.stadiumAwayScore === "number"
                            ? `${f.stadiumHomeScore}-${f.stadiumAwayScore}`
                            : "vs"}
                        </span>
                        <div className="flex items-center gap-1">
                          {f.stadiumAwayCrestUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.stadiumAwayCrestUrl} alt="" className="h-4 w-4 object-contain" />
                          ) : null}
                          <span>{f.stadiumAwayClub}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {[
                          f.stadiumCompetitionName,
                          f.stadiumMatchUtc ? new Date(f.stadiumMatchUtc).toLocaleDateString("en-GB") : null,
                          typeof f.stadiumAttendance === "number"
                            ? `Attendance ${f.stadiumAttendance.toLocaleString("en-GB")}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ) : null}
                  {f.evidenceUrl ? (
                    <div className="mt-2">
                      <EvidenceLinkPreview
                        url={f.evidenceUrl}
                        title={f.evidencePreviewTitle}
                        image={f.evidencePreviewImage}
                        siteName={f.evidencePreviewSiteName}
                        compact
                      />
                    </div>
                  ) : null}
                </div>
              ))}
              </div>
            </section>
            <section className="mb-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <h4 className="mb-2 text-sm font-semibold">Hitlist context</h4>
              <ul className="list-disc pl-5 text-sm">
              {(trackDetail.hitlist ?? []).map((h: any, i: number) => (
                <li key={`${h.playlistName}-${i}`}>{h.playlistName} (added: {new Date(h.addedAt).toLocaleDateString("en-GB")})</li>
              ))}
              </ul>
            </section>
            {(trackDetail.recentRemoved ?? []).length > 0 ? (
              <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <h4 className="mb-2 text-sm font-semibold">Recent removed</h4>
                <ul className="list-disc pl-5 text-sm">
                  {(trackDetail.recentRemoved ?? []).map((h: any, i: number) => (
                    <li key={`${h.playlistName}-rm-${i}`}>{h.playlistName} (removed: {h.removedAt ? new Date(h.removedAt).toLocaleDateString("en-GB") : "unknown"})</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {entryLoading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 text-sm dark:bg-zinc-900">Loading feedback detail...</div>
        </div>
      ) : null}

      {entryDetail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEntryDetail(null)}>
          <div className="max-h-[82vh] w-full max-w-xl overflow-auto rounded-lg bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
              <h3 className="text-lg font-semibold">Feedback detail</h3>
              <p className="text-xs text-zinc-500">{entryDetail.contact?.fullName ?? "No contact"} - {new Date(entryDetail.feedbackAt).toLocaleString("en-GB")}</p>
            </div>
            <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <h4 className="mb-2 text-sm font-semibold">Feedback</h4>
              {!entryDetail.feedbackBatch ? (
                <div className="mb-3 space-y-2">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Type</p>
                  <select
                    value={editEntryKind}
                    onChange={(e) => setEditEntryKind(e.target.value as "comment" | "sync" | "play")}
                    className="w-full rounded border px-2 py-2 text-sm"
                  >
                    <option value="comment">Comment</option>
                    <option value="sync">Media sync</option>
                    <option value="play">Stadium play</option>
                  </select>
                </div>
              ) : null}
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={6} className="w-full rounded border px-2 py-2 text-sm" />
              {!entryDetail.feedbackBatch && (editEntryKind === "sync" || editEntryKind === "play") ? (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Evidence link</label>
                  <input
                    type="url"
                    value={editEvidenceUrl}
                    onChange={(e) => setEditEvidenceUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded border px-2 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">Saving refetches the preview when the URL changes.</p>
                </div>
              ) : null}
              {!entryDetail.feedbackBatch && editEntryKind === "play" ? (
                <div className="mt-3 space-y-2 rounded border border-zinc-200 p-2 dark:border-zinc-700">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Match details</p>
                    <button
                      type="button"
                      onClick={() => void loadRecentMatchesForEdit()}
                      disabled={matchesLoading}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      {matchesLoading ? "Loading..." : "Load recent matches"}
                    </button>
                  </div>
                  {matchesError ? <p className="text-xs text-red-600">{matchesError}</p> : null}
                  {recentMatches.length > 0 ? (
                    <select
                      value={editSelectedMatchId}
                      onChange={(e) => setEditSelectedMatchId(e.target.value)}
                      className="w-full rounded border px-2 py-2 text-sm"
                    >
                      <option value="">No recent match selected (manual below)</option>
                      {recentMatches.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {new Date(m.utcDate).toLocaleDateString("en-GB")} - {m.homeTeam.name} vs {m.awayTeam.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!selectedRecentMatch ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input value={editHomeClub} onChange={(e) => setEditHomeClub(e.target.value)} placeholder="Home club" className="w-full rounded border px-2 py-2 text-sm" />
                      <input value={editAwayClub} onChange={(e) => setEditAwayClub(e.target.value)} placeholder="Away club" className="w-full rounded border px-2 py-2 text-sm" />
                      <input value={editCompetitionName} onChange={(e) => setEditCompetitionName(e.target.value)} placeholder="Competition (optional)" className="w-full rounded border px-2 py-2 text-sm sm:col-span-2" />
                      <input type="datetime-local" value={editMatchUtc} onChange={(e) => setEditMatchUtc(e.target.value)} className="w-full rounded border px-2 py-2 text-sm sm:col-span-2" />
                      <input type="number" value={editHomeScore} onChange={(e) => setEditHomeScore(e.target.value)} placeholder="Home score" className="w-full rounded border px-2 py-2 text-sm" />
                      <input type="number" value={editAwayScore} onChange={(e) => setEditAwayScore(e.target.value)} placeholder="Away score" className="w-full rounded border px-2 py-2 text-sm" />
                      <input type="number" value={editAttendance} onChange={(e) => setEditAttendance(e.target.value)} placeholder="Attendance" className="w-full rounded border px-2 py-2 text-sm sm:col-span-2" />
                      <input type="url" value={editHomeCrestUrl} onChange={(e) => setEditHomeCrestUrl(e.target.value)} placeholder="Home crest URL (optional)" className="w-full rounded border px-2 py-2 text-sm" />
                      <input type="url" value={editAwayCrestUrl} onChange={(e) => setEditAwayCrestUrl(e.target.value)} placeholder="Away crest URL (optional)" className="w-full rounded border px-2 py-2 text-sm" />
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      Selected match provides clubs, crests, score and attendance (if available).
                    </p>
                  )}
                </div>
              ) : null}
              {entryDetail.evidenceUrl && !entryDetail.feedbackBatch ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-zinc-500">Current preview</p>
                  <EvidenceLinkPreview
                    url={entryDetail.evidenceUrl}
                    title={entryDetail.evidencePreviewTitle}
                    image={entryDetail.evidencePreviewImage}
                    siteName={entryDetail.evidencePreviewSiteName}
                    compact
                  />
                </div>
              ) : null}
              <input type="datetime-local" value={editAt} onChange={(e) => setEditAt(e.target.value)} className="mt-2 w-full rounded border px-2 py-2 text-sm" />
            </section>
            {entryDetail.feedbackBatch ? (
              <section className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <p className="mb-2 text-sm font-semibold">Batch context</p>
                <p className="text-xs font-semibold text-emerald-600">Batch: {entryDetail.feedbackBatch.name}</p>
                <ul className="list-disc pl-5 text-sm">
                  {entryDetail.feedbackBatch.tracks.map((t: any) => <li key={t.id}>{t.title}</li>)}
                </ul>
                <div className="mt-2">
                  <Link href={`/feedback/new?batchId=${encodeURIComponent(entryDetail.feedbackBatch.id)}`} className="text-xs text-[#1DB954] hover:underline">Add feedback to this batch</Link>
                </div>
              </section>
            ) : null}
            {modalError ? <p className="mt-2 text-xs text-red-600">{modalError}</p> : null}
            <div className="mt-4 flex justify-between gap-2">
              <button type="button" onClick={deleteEntry} disabled={saving} className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50">
                Delete
              </button>
              <button type="button" onClick={saveEntryEdit} disabled={saving} className="rounded bg-[#1DB954] px-3 py-1.5 text-xs text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
