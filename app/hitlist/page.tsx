import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { StoreSessionFromUrl } from "@/components/StoreSessionFromUrl";
import { HitlistTable } from "@/components/HitlistTable";
import { getHitlistTitleRows } from "@/lib/hitlist";
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

  const params = await searchParams;
  const open = typeof params.open === "string" ? params.open : null;
  const rows = await getHitlistTitleRows(session.user.id);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <StoreSessionFromUrl />
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Hitlist</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Full hitlist overview. Click a title to see per-playlist history (added and removed times).
        </p>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
            No hitlist titles yet. Sync playlists and refresh hitlist from Dashboard.
          </p>
        ) : (
          <HitlistTable
            signedId={signedId}
            initialOpenKey={open}
            rows={rows.map((r) => ({
              key: r.key,
              title: r.title,
              artistsJson: r.artistsJson,
              spotifyTrackId: r.spotifyTrackId,
              firstDetectedAt: r.firstDetectedAt.toISOString(),
              lastSeenAt: r.lastSeenAt.toISOString(),
              activePlaylistCount: r.activePlaylistCount,
              playlistPresences: r.playlistPresences.map((p) => ({
                playlistId: p.playlistId,
                playlistName: p.playlistName,
                addedAt: p.addedAt.toISOString(),
                removedAt: p.removedAt ? p.removedAt.toISOString() : null,
                isActive: p.isActive,
              })),
            }))}
          />
        )}
      </main>
    </div>
  );
}
