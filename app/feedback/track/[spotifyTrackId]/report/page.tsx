import { notFound, redirect } from "next/navigation";
import { EvidenceLinkPreview } from "@/components/EvidenceLinkPreview";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { TrackClientReportToolbar } from "@/components/TrackClientReportToolbar";
import { getTrackClientReportData, spotifyPlaylistHref } from "@/lib/track-client-report";
import { getSessionFromSignedValue, getSpotifySession } from "@/lib/spotify-auth";

type Props = {
  params: Promise<{ spotifyTrackId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(d: Date) {
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function feedbackKindLabel(kind: string) {
  if (kind === "sync") return "Media sync";
  if (kind === "play") return "Stadium play";
  return "Feedback";
}

function fmtDateOnly(d: Date) {
  return d.toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function formatAttendance(n: number | null) {
  if (typeof n !== "number") return null;
  return n.toLocaleString("en-GB");
}

export default async function TrackClientReportPage({ params, searchParams }: Props) {
  let session = await getSpotifySession();
  const qp = await searchParams;
  if (!session && qp.sid) session = await getSessionFromSignedValue(qp.sid);
  if (!session) redirect("/");

  const { spotifyTrackId: rawId } = await params;
  const spotifyTrackId = decodeURIComponent(rawId);

  const data = await getTrackClientReportData(session.user.id, spotifyTrackId);
  if (!data) notFound();

  const backHref = qp.sid ? `/feedback?sid=${encodeURIComponent(qp.sid)}` : "/feedback";
  const stadiumPlays = data.feedback.filter((f) => !f.isBatch && f.entryKind === "play");
  const mediaSyncItems = data.feedback.filter((f) => !f.isBatch && f.entryKind === "sync");
  const regularFeedbackItems = data.feedback.filter((f) => f.entryKind !== "play" && f.entryKind !== "sync");

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <StoreSessionFromUrl />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <TrackClientReportToolbar backHref={backHref} />

        <article className="report-sheet rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <header className="mb-8 border-b border-zinc-200 pb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Track report</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{data.title}</h1>
            <p className="mt-1 text-lg text-zinc-600">{data.artistsLabel}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {data.spotifyUrl ? (
                <a href={data.spotifyUrl} className="text-[#1DB954] hover:underline" target="_blank" rel="noopener noreferrer">
                  Open on Spotify
                </a>
              ) : null}
              <span className="text-zinc-400">Generated {fmt(data.generatedAt)}</span>
            </div>
          </header>

          {stadiumPlays.length > 0 ? (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Stadium play</h2>
              <ul className="space-y-4">
                {stadiumPlays.map((f) => (
                    <li key={f.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 print:break-inside-avoid">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          {f.contact ? (
                            <>
                              <p className="font-semibold text-zinc-900">{f.contact.fullName ?? "Unknown"}</p>
                              <p className="text-sm text-zinc-600">
                                {[f.contact.role, f.contact.organizationName].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </>
                          ) : (
                            <p className="font-medium text-zinc-600">No contact linked</p>
                          )}
                        </div>
                        <time className="shrink-0 text-xs text-zinc-500">{fmt(f.feedbackAt)}</time>
                      </div>
                      {f.feedbackText ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{f.feedbackText}</p>
                      ) : null}
                      {f.stadiumHomeClub && f.stadiumAwayClub ? (
                        <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              {f.stadiumHomeCrestUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.stadiumHomeCrestUrl} alt={`${f.stadiumHomeClub} crest`} className="h-8 w-8 object-contain" />
                              ) : null}
                              <span className="truncate text-sm font-medium">{f.stadiumHomeClub}</span>
                            </div>
                            <div className="shrink-0 text-sm font-semibold">
                              {typeof f.stadiumHomeScore === "number" && typeof f.stadiumAwayScore === "number"
                                ? `${f.stadiumHomeScore} - ${f.stadiumAwayScore}`
                                : "vs"}
                            </div>
                            <div className="flex min-w-0 items-center gap-2">
                              {f.stadiumAwayCrestUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.stadiumAwayCrestUrl} alt={`${f.stadiumAwayClub} crest`} className="h-8 w-8 object-contain" />
                              ) : null}
                              <span className="truncate text-sm font-medium">{f.stadiumAwayClub}</span>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-zinc-600">
                            {[f.stadiumCompetitionName, f.stadiumMatchUtc ? fmt(new Date(f.stadiumMatchUtc)) : null]
                              .filter(Boolean)
                              .join(" · ") || "Match details"}
                          </p>
                          {formatAttendance(f.stadiumAttendance) ? (
                            <p className="text-xs text-zinc-600">Attendance: {formatAttendance(f.stadiumAttendance)}</p>
                          ) : null}
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
                  ))}
              </ul>
          </section>
          ) : null}

          {mediaSyncItems.length > 0 ? (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Media sync</h2>
              <ul className="space-y-4">
                {mediaSyncItems.map((f) => (
                    <li key={f.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 print:break-inside-avoid">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          {f.contact ? (
                            <>
                              <p className="font-semibold text-zinc-900">{f.contact.fullName ?? "Unknown"}</p>
                              <p className="text-sm text-zinc-600">
                                {[f.contact.role, f.contact.organizationName].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </>
                          ) : (
                            <p className="font-medium text-zinc-600">No contact linked</p>
                          )}
                        </div>
                        <time className="shrink-0 text-xs text-zinc-500">{fmt(f.feedbackAt)}</time>
                      </div>
                      {f.feedbackText ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{f.feedbackText}</p>
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
                  ))}
              </ul>
          </section>
          ) : null}

          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Feedback</h2>
            {regularFeedbackItems.length === 0 ? (
              <p className="text-sm text-zinc-600">No feedback recorded for this track yet.</p>
            ) : (
              <ul className="space-y-4">
                {regularFeedbackItems.map((f) => (
                  <li key={f.id} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 print:break-inside-avoid">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        {f.contact ? (
                          <>
                            <p className="font-semibold text-zinc-900">{f.contact.fullName ?? "Unknown"}</p>
                            <p className="text-sm text-zinc-600">
                              {[f.contact.role, f.contact.organizationName].filter(Boolean).join(" · ") || "—"}
                            </p>
                            {f.contact.email ? <p className="text-xs text-zinc-500">{f.contact.email}</p> : null}
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
                    {f.feedbackText ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{f.feedbackText}</p>
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
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Playlists</h2>
            {data.playlists.length === 0 ? (
              <p className="text-sm text-zinc-600">
                No playlist sync history for this track yet.
              </p>
            ) : (
              <ul className="space-y-4">
                {data.playlists.map((p) => (
                  <li
                    key={p.playlistId}
                    className="flex gap-4 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 print:break-inside-avoid"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-zinc-200 shadow-inner">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-500">No art</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={spotifyPlaylistHref(p.spotifyPlaylistId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-zinc-900 hover:text-[#1DB954] hover:underline"
                      >
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
                          <dd className="whitespace-pre-wrap">{p.playlistDescription?.trim() || "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="mt-10 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
            Sport Sounds / Shoot — internal track overview. Playlist dates reflect synced snapshots in this app.
          </footer>
        </article>

        <p className="no-print mt-4 text-center text-xs text-zinc-500">
          Tip: use <strong>Print / Save as PDF</strong> to share a clean PDF with clients.
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
