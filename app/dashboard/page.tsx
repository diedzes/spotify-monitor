import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpotifySession, getSessionFromSignedValue, getSessionSignedIdFromCookie } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";
import { formatArtistsLabel, getHitlistTitleRows } from "@/lib/hitlist";
import { HitlistRefreshButton } from "@/components/HitlistRefreshButton";
import { getRecentFeedbackItems } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function DashboardPage({ searchParams }: Props) {
  let session = await getSpotifySession();
  let signedId: string | null = null;
  if (!session) {
    const params = await searchParams;
    const sid = params.sid;
    if (sid) {
      session = await getSessionFromSignedValue(sid);
      signedId = sid;
    }
  } else {
    signedId = await getSessionSignedIdFromCookie();
  }
  if (!session) {
    redirect("/");
  }

  const [trackedPlaylistCount, mainPlaylistCount, reportCount, recentReports, recentSchedulers, activeHitlistTitles, recentFeedback] =
    await Promise.all([
      prisma.trackedPlaylist.count({ where: { userId: session.user.id } }),
      prisma.groupPlaylist.count({
        where: { group: { userId: session.user.id, isMainGroup: true } },
      }),
      prisma.report.count({ where: { userId: session.user.id } }),
      prisma.report.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true, updatedAt: true },
      }),
      prisma.scheduler.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true, updatedAt: true },
      }),
      getHitlistTitleRows(session.user.id, { activeOnly: true, limit: 10 }),
      getRecentFeedbackItems(session.user.id, 4),
    ]);

  type RecentItem =
    | { kind: "report"; id: string; name: string; updatedAt: Date }
    | { kind: "scheduler"; id: string; name: string; updatedAt: Date };

  const recentProjects: RecentItem[] = [
    ...recentReports.map((r) => ({ kind: "report" as const, id: r.id, name: r.name, updatedAt: r.updatedAt })),
    ...recentSchedulers.map((s) => ({
      kind: "scheduler" as const,
      id: s.id,
      name: s.name,
      updatedAt: s.updatedAt,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          You are signed in with Spotify (OAuth based on the official example).
        </p>

        {(recentProjects.length > 0 || recentFeedback.length > 0) && (
          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">Recent projects</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Recently updated reports, schedulers, and feedback work.
            </p>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recentProjects.map((p) => (
                <li key={`${p.kind}-${p.id}`}>
                  <a
                    href={
                      signedId
                        ? `${p.kind === "report" ? `/reports/${p.id}` : `/scheduler/${p.id}`}?sid=${encodeURIComponent(signedId)}`
                        : p.kind === "report"
                          ? `/reports/${p.id}`
                          : `/scheduler/${p.id}`
                    }
                    className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={
                          p.kind === "report"
                            ? "shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/50 dark:text-violet-200"
                            : "shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                        }
                      >
                        {p.kind === "report" ? "Report" : "Scheduler"}
                      </span>
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {p.updatedAt.toLocaleString("en-GB")}
                    </span>
                  </a>
                </li>
              ))}
              {recentFeedback.map((entry) => (
                <li key={`feedback-${entry.id}`}>
                  <a
                    href={signedId ? `/feedback?sid=${encodeURIComponent(signedId)}` : "/feedback"}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                        Feedback
                      </span>
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {entry.feedbackBatch?.name ?? entry.tracks[0]?.title ?? "Feedback note"}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {entry.feedbackAt.toLocaleString("en-GB")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-100">Hitlist</h2>
            <div className="flex items-center gap-2">
              <Link
                href={signedId ? `/hitlist?sid=${encodeURIComponent(signedId)}` : "/hitlist"}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Open full hitlist
              </Link>
              {mainPlaylistCount > 0 ? <HitlistRefreshButton signedId={signedId} /> : null}
            </div>
          </div>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Tracks that appear in the Hitlist main group and (via the same Spotify track ID or artist+title) also on a
            tracked playlist that is <strong>not</strong> in that main group. Overlap between main-group playlists only
            does not count. <strong>Refresh</strong> recomputes from the latest snapshots (e.g. after a sync).
          </p>
          {mainPlaylistCount === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
              No playlists in the Hitlist main group yet. Add playlists to that group on{" "}
              <a
                href={signedId ? `/playlists?sid=${encodeURIComponent(signedId)}` : "/playlists"}
                className="text-[#1DB954] hover:underline"
              >
                Playlists
              </a>{" "}
              of via Groups.
            </p>
          ) : (
            <>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Newest 10 titles</h3>
              {activeHitlistTitles.length === 0 ? (
                <p className="mb-6 rounded-lg border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  No active matches. Sync playlists in the Hitlist main group and other tracked playlists, or use{" "}
                  <strong>Refresh</strong> to check against the latest snapshots.
                </p>
              ) : (
                <div className="mb-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Artists</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Title</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Playlisted at</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Date added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeHitlistTitles.map((row) => {
                        const activePlaylists = row.playlistPresences.filter((p) => p.isActive);
                        const show = activePlaylists.slice(0, 3);
                        const more = activePlaylists.length - show.length;
                        const hitlistHref = signedId
                          ? `/hitlist?sid=${encodeURIComponent(signedId)}&open=${encodeURIComponent(row.key)}`
                          : `/hitlist?open=${encodeURIComponent(row.key)}`;
                        return (
                          <tr key={row.key} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              {formatArtistsLabel(row.artistsJson)}
                            </td>
                            <td className="px-3 py-2">
                              <Link href={hitlistHref} className="font-medium text-[#1DB954] hover:underline">
                                {row.title}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              {show.map((p, idx) => {
                                const href = signedId
                                  ? `/playlists/${p.playlistId}?sid=${encodeURIComponent(signedId)}`
                                  : `/playlists/${p.playlistId}`;
                                return (
                                  <span key={p.playlistId}>
                                    {idx > 0 ? ", " : ""}
                                    <Link href={href} className="text-[#1DB954] hover:underline">{p.playlistName}</Link>
                                  </span>
                                );
                              })}
                              {more > 0 ? ` +${more}` : ""}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              {row.firstDetectedAt.toLocaleString("en-GB", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <a
            href={signedId ? `/playlists?sid=${encodeURIComponent(signedId)}` : "/playlists"}
            className="block rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
              Tracked playlists
            </h2>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {trackedPlaylistCount}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Playlists you follow
            </p>
          </a>
          <a
            href={signedId ? `/groups?sid=${encodeURIComponent(signedId)}` : "/groups"}
            className="block rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
              Playlist groups
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Organize playlists into groups
            </p>
          </a>
          <a
            href={signedId ? `/feedback?sid=${encodeURIComponent(signedId)}` : "/feedback"}
            className="block rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
              Feedback
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Notes, batches, and recent context for track follow-up
            </p>
          </a>
          <a
            href={signedId ? `/reports?sid=${encodeURIComponent(signedId)}` : "/reports"}
            className="block rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
              Reports
            </h2>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {reportCount}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Weighted charts from playlists and groups
            </p>
          </a>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
            Session
          </h2>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {session.user.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">E-mail</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {session.user.email ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Access token</dt>
              <dd className="truncate font-mono text-zinc-600 dark:text-zinc-400">
                {session.access_token ? `${session.access_token.slice(0, 20)}…` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
