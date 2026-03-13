import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpotifySession, getSessionFromSignedValue, getSessionSignedIdFromCookie } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";

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

  const [trackedPlaylistCount, reportCount] = await Promise.all([
    prisma.trackedPlaylist.count({ where: { userId: session.user.id } }),
    prisma.report.count({ where: { userId: session.user.id } }),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Home
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {session.user.name ?? session.user.email}
            </span>
            <a
              href="/api/auth/spotify/logout"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Uitloggen
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          Je bent ingelogd met Spotify (OAuth volgens het officiële voorbeeld).
        </p>
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
