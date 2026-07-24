import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { HitlistRefreshButton } from "@/components/HitlistRefreshButton";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { HitlistTable } from "@/components/HitlistTable";
import { getHitlistRows, getPlaylistIdsInNamedGroup } from "@/lib/hitlist";
import { getSessionFromSignedValue, getSessionSignedIdFromCookie, getSpotifySession } from "@/lib/spotify-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function HitlistPage({ searchParams }: Props) {
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
  if (!session) redirect("/");

  const [rows, ownedPlaylistIds] = await Promise.all([
    getHitlistRows(session.user.id),
    getPlaylistIdsInNamedGroup(session.user.id, "Owned"),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Hitlist</h1>
          <HitlistRefreshButton signedId={signedId} />
        </div>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Full hitlist overview. Every row is one hit on one playlist, sorted by First Seen by default.
        </p>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
            Nog geen hitlist titels.{" "}
            <a href={signedId ? `/playlists?sid=${encodeURIComponent(signedId)}` : "/playlists"} className="text-[#1DB954] hover:underline">
              Sync je playlists
            </a>{" "}
            en gebruik daarna Refresh op het Dashboard.
          </p>
        ) : (
          <HitlistTable
            signedId={signedId}
            ownedPlaylistIds={ownedPlaylistIds}
            rows={rows.map((r) => ({
              id: r.id,
              title: r.title,
              artistsJson: r.artistsJson,
              spotifyTrackId: r.spotifyTrackId,
              playlistId: r.playlistId,
              playlistName: r.playlistName,
              firstSeenAt: r.firstSeenAt.toISOString(),
              lastSeenAt: r.lastSeenAt.toISOString(),
              removedAt: r.removedAt ? r.removedAt.toISOString() : null,
              isActive: r.isActive,
            }))}
          />
        )}
      </main>
    </div>
  );
}
