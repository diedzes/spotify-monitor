"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EvidenceLinkPreview } from "@/components/EvidenceLinkPreview";
import type { ReactNode } from "react";

type PlaylistRow = {
  playlistId: string;
  playlistName: string;
  imageUrl: string | null;
  spotifyPlaylistId: string;
  ownerName: string;
  playlistDescription: string | null;
  firstSeenAt: string;
};

type FeedbackRow = {
  id: string;
  feedbackText: string;
  feedbackAt: string;
  isBatch: boolean;
  batchName: string | null;
  entryKind: "comment" | "sync" | "play";
  evidenceUrl: string | null;
  evidencePreviewTitle: string | null;
  evidencePreviewImage: string | null;
  evidencePreviewSiteName: string | null;
  stadiumCompetitionName: string | null;
  stadiumMatchUtc: string | null;
  stadiumHomeClub: string | null;
  stadiumAwayClub: string | null;
  stadiumHomeCrestUrl: string | null;
  stadiumAwayCrestUrl: string | null;
  stadiumHomeScore: number | null;
  stadiumAwayScore: number | null;
  stadiumAttendance: number | null;
  contact: {
    fullName: string | null;
    role: string | null;
    email: string | null;
    organizationName: string | null;
  } | null;
};

type SentItem = {
  itemType: "feedback" | "playlist";
  itemId: string;
  firstSentAt: string;
  lastSentAt: string;
  sentCount: number;
};

type HistoryExport = {
  id: string;
  headerText: string;
  introText: string;
  createdAt: string;
  items: Array<{
    id: string;
    itemType: "feedback" | "playlist";
    itemId: string;
    label: string;
  }>;
};

type ComposerData = {
  spotifyTrackId: string;
  title: string;
  artistsLabel: string;
  spotifyUrl: string | null;
  fatdropUrl?: string | null;
  trackImageUrl: string | null;
  playlists: PlaylistRow[];
  feedback: FeedbackRow[];
  generatedAt: string;
  defaultHeaderText: string;
  defaultIntroText: string;
  sentItems: SentItem[];
  history: HistoryExport[];
};

type Props = {
  backHref: string;
  data: ComposerData;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function fmtDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function formatAttendance(n: number | null) {
  if (typeof n !== "number") return null;
  return n.toLocaleString("en-GB");
}

function feedbackKindLabel(kind: string) {
  if (kind === "sync") return "Media sync";
  if (kind === "play") return "Stadium play";
  return "Feedback";
}

function spotifyPlaylistHref(spotifyPlaylistId: string) {
  return `https://open.spotify.com/playlist/${spotifyPlaylistId}`;
}

function itemKey(itemType: "feedback" | "playlist", itemId: string) {
  return `${itemType}:${itemId}`;
}

function setWithToggle(values: Set<string>, id: string, checked: boolean) {
  const next = new Set(values);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export function TrackClientReportComposer({ backHref, data }: Props) {
  const sentByKey = useMemo(() => new Map(data.sentItems.map((item) => [itemKey(item.itemType, item.itemId), item])), [data.sentItems]);
  const defaultFeedbackIds = useMemo(() => {
    const notSent = data.feedback.filter((item) => !sentByKey.has(itemKey("feedback", item.id))).map((item) => item.id);
    return notSent.length > 0 ? notSent : data.feedback.map((item) => item.id);
  }, [data.feedback, sentByKey]);
  const defaultPlaylistIds = useMemo(() => {
    const notSent = data.playlists.filter((item) => !sentByKey.has(itemKey("playlist", item.playlistId))).map((item) => item.playlistId);
    return notSent.length > 0 ? notSent : data.playlists.map((item) => item.playlistId);
  }, [data.playlists, sentByKey]);

  const [headerText, setHeaderText] = useState(data.defaultHeaderText);
  const [introText, setIntroText] = useState(data.defaultIntroText);
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState(() => new Set(defaultFeedbackIds));
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(() => new Set(defaultPlaylistIds));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFeedback = data.feedback.filter((item) => selectedFeedbackIds.has(item.id));
  const selectedPlaylists = data.playlists.filter((item) => selectedPlaylistIds.has(item.playlistId));
  const stadiumPlays = selectedFeedback.filter((f) => !f.isBatch && f.entryKind === "play");
  const mediaSyncItems = selectedFeedback.filter((f) => !f.isBatch && f.entryKind === "sync");
  const regularFeedbackItems = selectedFeedback.filter((f) => f.entryKind !== "play" && f.entryKind !== "sync");

  function selectNotSent() {
    setSelectedFeedbackIds(new Set(data.feedback.filter((item) => !sentByKey.has(itemKey("feedback", item.id))).map((item) => item.id)));
    setSelectedPlaylistIds(new Set(data.playlists.filter((item) => !sentByKey.has(itemKey("playlist", item.playlistId))).map((item) => item.playlistId)));
  }

  function selectAll() {
    setSelectedFeedbackIds(new Set(data.feedback.map((item) => item.id)));
    setSelectedPlaylistIds(new Set(data.playlists.map((item) => item.playlistId)));
  }

  async function saveAndPrint() {
    setSaving(true);
    setMessage(null);
    try {
      const items = [
        ...Array.from(selectedFeedbackIds).map((itemId) => ({ itemType: "feedback" as const, itemId })),
        ...Array.from(selectedPlaylistIds).map((itemId) => ({ itemType: "playlist" as const, itemId })),
      ];
      const res = await fetch("/api/feedback/track/report", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotifyTrackId: data.spotifyTrackId,
          headerText,
          introText,
          items,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setMessage(body.error ?? "Could not save report selection");
        return;
      }
      setMessage("Selection saved. Opening print dialog...");
      window.setTimeout(() => window.print(), 50);
    } catch {
      setMessage("Could not save report selection");
    } finally {
      setSaving(false);
    }
  }

  const sentBadge = (type: "feedback" | "playlist", id: string) => {
    const sent = sentByKey.get(itemKey(type, id));
    if (!sent) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Not sent yet</span>;
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
        Sent {sent.sentCount}x, last {fmtDateOnly(sent.lastSentAt)}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Back
        </Link>
        <button
          type="button"
          onClick={saveAndPrint}
          disabled={saving}
          className="rounded-lg bg-[#1DB954] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1ed760] disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save selection & Print PDF"}
        </button>
      </div>

      <div className="no-print mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Report composer</h2>
          <div className="grid gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Header</span>
              <input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Intro text</span>
              <textarea
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                rows={4}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={selectNotSent} className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
              Select not sent yet
            </button>
            <button type="button" onClick={selectAll} className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
              Select all
            </button>
          </div>
          {message ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">Export history</h2>
          {data.history.length === 0 ? (
            <p className="text-sm text-zinc-500">No exports saved yet for this track.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {data.history.slice(0, 5).map((ex) => (
                <li key={ex.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="font-medium">{fmt(ex.createdAt)}</p>
                  <p className="text-xs text-zinc-500">{ex.items.length} item{ex.items.length === 1 ? "" : "s"} included</p>
                  <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {ex.items.slice(0, 4).map((item) => (
                      <li key={item.id} className="truncate">{item.label}</li>
                    ))}
                    {ex.items.length > 4 ? <li>+{ex.items.length - 4} more</li> : null}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="no-print mb-6 grid gap-4 lg:grid-cols-2">
        <SelectionPanel
          title="Feedback, syncs and plays"
          emptyText="No feedback available for this track."
          rows={data.feedback.map((item) => ({
            id: item.id,
            checked: selectedFeedbackIds.has(item.id),
            label: `${feedbackKindLabel(item.entryKind)} - ${item.contact?.fullName ?? item.contact?.organizationName ?? "No contact"}`,
            meta: fmt(item.feedbackAt),
            badge: sentBadge("feedback", item.id),
            onChange: (checked) => setSelectedFeedbackIds((current) => setWithToggle(current, item.id, checked)),
          }))}
        />
        <SelectionPanel
          title="Playlists"
          emptyText="No playlist history available for this track."
          rows={data.playlists.map((item) => ({
            id: item.playlistId,
            checked: selectedPlaylistIds.has(item.playlistId),
            label: item.playlistName,
            meta: `Curator: ${item.ownerName} - first seen ${fmtDateOnly(item.firstSeenAt)}`,
            badge: sentBadge("playlist", item.playlistId),
            onChange: (checked) => setSelectedPlaylistIds((current) => setWithToggle(current, item.playlistId, checked)),
          }))}
        />
      </div>

      <article className="report-sheet mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-8 border-b border-zinc-200 pb-6">
          <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">{headerText}</p>
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-200 shadow-inner">
              {data.trackImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.trackImageUrl} alt={`${data.title} cover art`} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Track report</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{data.title}</h1>
              <p className="mt-1 text-lg text-zinc-600">{data.artistsLabel}</p>
            </div>
          </div>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{introText}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="text-zinc-400">Generated {fmt(data.generatedAt)}</span>
            {data.spotifyUrl ? (
              <a href={data.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-[#1DB954] hover:underline">
                Open on Spotify
              </a>
            ) : null}
            {data.fatdropUrl ? (
              <a href={data.fatdropUrl} target="_blank" rel="noopener noreferrer" className="rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-200">
                FatDrop
              </a>
            ) : null}
          </div>
        </header>

        <FeedbackSection title="Stadium play" items={stadiumPlays} />
        <FeedbackSection title="Media sync" items={mediaSyncItems} />
        <FeedbackSection title="Feedback" items={regularFeedbackItems} showEmpty emptyText="No selected feedback for this report." />

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Playlists</h2>
          {selectedPlaylists.length === 0 ? (
            <p className="text-sm text-zinc-600">No selected playlists for this report.</p>
          ) : (
            <ul className="space-y-4">
              {selectedPlaylists.map((p) => (
                <li key={p.playlistId} className="flex gap-4 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 print:break-inside-avoid">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-zinc-200 shadow-inner">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-500">No art</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <a href={spotifyPlaylistHref(p.spotifyPlaylistId)} target="_blank" rel="noopener noreferrer" className="font-semibold text-zinc-900 hover:text-[#1DB954] hover:underline">
                      {p.playlistName}
                    </a>
                    <p className="text-xs text-zinc-500">Curator: {p.ownerName}</p>
                    <dl className="mt-2 grid gap-1 text-xs text-zinc-600">
                      <div>
                        <dt className="font-medium text-zinc-500">First seen</dt>
                        <dd>{fmtDateOnly(p.firstSeenAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-zinc-500">Spotify description</dt>
                        <dd className="whitespace-pre-wrap">{p.playlistDescription?.trim() || "-"}</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          Sport Sounds / Shoot - playlist dates reflect synced snapshots in this app.
        </footer>
      </article>
    </div>
  );
}

function SelectionPanel({
  title,
  emptyText,
  rows,
}: {
  title: string;
  emptyText: string;
  rows: Array<{
    id: string;
    checked: boolean;
    label: string;
    meta: string;
    badge: ReactNode;
    onChange: (checked: boolean) => void;
  }>;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="max-h-[360px] space-y-2 overflow-auto pr-1">
          {rows.map((row) => (
            <li key={row.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) => row.onChange(e.target.checked)}
                  className="mt-1 rounded border-zinc-300 text-[#1DB954] focus:ring-[#1DB954]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.label}</span>
                  <span className="block text-xs text-zinc-500">{row.meta}</span>
                  <span className="mt-2 block">{row.badge}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedbackSection({
  title,
  items,
  showEmpty = false,
  emptyText = "",
}: {
  title: string;
  items: FeedbackRow[];
  showEmpty?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0 && !showEmpty) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-600">{emptyText}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((f) => (
            <FeedbackCard key={f.id} item={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedbackCard({ item: f }: { item: FeedbackRow }) {
  return (
    <li className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 print:break-inside-avoid">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {f.contact ? (
            <>
              <p className="font-semibold text-zinc-900">{f.contact.fullName ?? "Unknown"}</p>
              <p className="text-sm text-zinc-600">
                {[f.contact.role, f.contact.organizationName].filter(Boolean).join(" - ") || "-"}
              </p>
            </>
          ) : (
            <p className="font-medium text-zinc-600">No contact linked</p>
          )}
        </div>
        <time className="shrink-0 text-xs text-zinc-500">{fmt(f.feedbackAt)}</time>
      </div>
      {f.isBatch && f.batchName ? (
        <p className="mb-2 rounded-md bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">Reply on a group of songs</p>
      ) : (
        <p className="mb-2 text-xs font-medium text-emerald-700">{feedbackKindLabel(f.entryKind)}</p>
      )}
      {f.feedbackText ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{f.feedbackText}</p> : null}
      {f.stadiumHomeClub && f.stadiumAwayClub ? (
        <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <Team name={f.stadiumHomeClub} crestUrl={f.stadiumHomeCrestUrl} />
            <div className="shrink-0 text-sm font-semibold">
              {typeof f.stadiumHomeScore === "number" && typeof f.stadiumAwayScore === "number" ? `${f.stadiumHomeScore} - ${f.stadiumAwayScore}` : "vs"}
            </div>
            <Team name={f.stadiumAwayClub} crestUrl={f.stadiumAwayCrestUrl} />
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            {[f.stadiumCompetitionName, f.stadiumMatchUtc ? fmt(f.stadiumMatchUtc) : null].filter(Boolean).join(" - ") || "Match details"}
          </p>
          {formatAttendance(f.stadiumAttendance) ? <p className="text-xs text-zinc-600">Attendance: {formatAttendance(f.stadiumAttendance)}</p> : null}
        </div>
      ) : null}
      {f.evidenceUrl ? (
        <div className="mt-3">
          <EvidenceLinkPreview
            url={f.evidenceUrl}
            title={f.evidencePreviewTitle}
            image={f.evidencePreviewImage}
            siteName={f.evidencePreviewSiteName}
          />
        </div>
      ) : null}
    </li>
  );
}

function Team({ name, crestUrl }: { name: string; crestUrl: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crestUrl} alt={`${name} crest`} className="h-8 w-8 object-contain" />
      ) : null}
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  );
}
