import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpotifySession } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default async function PlaylistsPage() {
  const session = await getSpotifySession();
  if (!session) redirect("/");

  const playlists = await prisma.trackedPlaylist.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {session.user.name ?? session.user.email}
            </span>
            <Link
              href="/api/auth/spotify/logout"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              Uitloggen
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tracked playlists
          </h1>
          <Link
            href="/playlists/new"
            className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1ed760]"
          >
            Add playlist
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Naam</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Owner</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Tracks</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Laatste sync</th>
                <th className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">Acties</th>
              </tr>
            </thead>
            <tbody>
              {playlists.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    Nog geen playlists. Klik op &quot;Add playlist&quot; om een Spotify playlist toe te voegen.
                  </td>
                </tr>
              ) : (
                playlists.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.ownerName}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.trackCount}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(p.lastSyncedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://open.spotify.com/playlist/${p.spotifyPlaylistId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1DB954] hover:underline"
                      >
                        Open in Spotify
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
