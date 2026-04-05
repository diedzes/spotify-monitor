import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpotifySession, getSessionFromSignedValue, getSessionSignedIdFromCookie } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { AppHeader } from "@/components/AppHeader";
import { formatArtistsLabel, getActiveHitlist, getRecentlyRemovedHitlist, spotifyTrackHref } from "@/lib/hitlist";
import { HitlistRefreshButton } from "@/components/HitlistRefreshButton";

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

  const [trackedPlaylistCount, mainPlaylistCount, reportCount, recentReports, recentSchedulers, activeHitlist, removedHitlist] =
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
      getActiveHitlist(session.user.id),
      getRecentlyRemovedHitlist(session.user.id, 14),
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
          Je bent ingelogd met Spotify (OAuth volgens het officiële voorbeeld).
        </p>

        {recentProjects.length > 0 && (
          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">Recent projects</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Laatst bijgewerkte reports en schedulers — direct verder werken.
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
                      {p.updatedAt.toLocaleString("nl-NL")}
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
            {mainPlaylistCount > 0 ? (
              <HitlistRefreshButton signedId={signedId} />
            ) : null}
          </div>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Nummers die in de Hitlist-hoofdgroep staan én (via dezelfde Spotify-track-ID of artiest+titel) ook op een
            tracked playlist die <strong>niet</strong> in die hoofdgroep zit. Overlap alleen tussen hoofdgroep-playlists
            onderling telt niet mee. <strong>Refresh</strong> herberekent op de nieuwste snapshots (zoals na sync).
          </p>
          {mainPlaylistCount === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
              Nog geen playlists in de Hitlist-hoofdgroep. Voeg playlists toe aan die groep op{" "}
              <a
                href={signedId ? `/playlists?sid=${encodeURIComponent(signedId)}` : "/playlists"}
                className="text-[#1DB954] hover:underline"
              >
                Playlists
              </a>{" "}
              of via Groepen.
            </p>
          ) : (
            <>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Active Hitlist</h3>
              {activeHitlist.length === 0 ? (
                <p className="mb-6 rounded-lg border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Geen actieve matches. Sync de playlists in de Hitlist-hoofdgroep en andere tracked playlists, of gebruik{" "}
                  <strong>Refresh</strong> om op de nieuwste snapshots te controleren.
                </p>
              ) : (
                <div className="mb-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Artists</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Title</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Main playlist</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Also playlisted at</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Date added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeHitlist.map((row) => {
                        const mainHref = signedId
                          ? `/playlists/${row.mainPlaylist.id}?sid=${encodeURIComponent(signedId)}`
                          : `/playlists/${row.mainPlaylist.id}`;
                        const plHref = signedId
                          ? `/playlists/${row.matchedPlaylist.id}?sid=${encodeURIComponent(signedId)}`
                          : `/playlists/${row.matchedPlaylist.id}`;
                        const trackHref = spotifyTrackHref(row.spotifyTrackId);
                        return (
                          <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              {formatArtistsLabel(row.artistsJson)}
                            </td>
                            <td className="max-w-[220px] px-3 py-2">
                              {trackHref ? (
                                <a
                                  href={trackHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-[#1DB954] hover:underline"
                                >
                                  {row.title}
                                </a>
                              ) : (
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                              )}
                              <span className="mt-0.5 block break-all font-mono text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
                                {row.spotifyTrackId}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <Link href={mainHref} className="text-[#1DB954] hover:underline">
                                {row.mainPlaylist.name}
                              </Link>
                            </td>
                            <td className="px-3 py-2">
                              <Link href={plHref} className="text-[#1DB954] hover:underline">
                                {row.matchedPlaylist.name}
                              </Link>
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

              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Removed in last 14 days</h3>
              {removedHitlist.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Geen recent verwijderde matches.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Artist</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Title</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Main playlist</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Removed from playlist</th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Removed at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {removedHitlist.map((row) => {
                        const mainHref = signedId
                          ? `/playlists/${row.mainPlaylist.id}?sid=${encodeURIComponent(signedId)}`
                          : `/playlists/${row.mainPlaylist.id}`;
                        const plHref = signedId
                          ? `/playlists/${row.matchedPlaylist.id}?sid=${encodeURIComponent(signedId)}`
                          : `/playlists/${row.matchedPlaylist.id}`;
                        const trackHref = spotifyTrackHref(row.spotifyTrackId);
                        const removedAt = row.removedAt;
                        return (
                          <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                            <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              {formatArtistsLabel(row.artistsJson)}
                            </td>
                            <td className="px-3 py-2">
                              {trackHref ? (
                                <a
                                  href={trackHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-[#1DB954] hover:underline"
                                >
                                  {row.title}
                                </a>
                              ) : (
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Link href={mainHref} className="text-[#1DB954] hover:underline">
                                {row.mainPlaylist.name}
                              </Link>
                            </td>
                            <td className="px-3 py-2">
                              <Link href={plHref} className="text-[#1DB954] hover:underline">
                                {row.matchedPlaylist.name}
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                              {removedAt ? removedAt.toLocaleString("nl-NL") : "—"}
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
              Playlists die je volgt
            </p>
          </a>
          <a
            href={signedId ? `/groups?sid=${encodeURIComponent(signedId)}` : "/groups"}
            className="block rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">
              Playlistgroepen
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Groepen om playlists in te organiseren
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
              Gewogen charts uit playlists en groepen
            </p>
          </a>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
            Sessie
          </h2>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Naam</dt>
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
