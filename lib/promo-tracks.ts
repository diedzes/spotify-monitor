import { prisma } from "@/lib/db";

/**
 * Geeft een mapping van spotifyTrackId → fatdropUrl voor de opgegeven track-IDs.
 * Alleen tracks waar spotifyTrackId is ingevuld worden teruggegeven.
 */
export async function getPromoUrlsBySpotifyIds(
  userId: string,
  spotifyTrackIds: string[]
): Promise<Record<string, string>> {
  if (!spotifyTrackIds.length) return {};

  const rows = await prisma.promoTrack.findMany({
    where: {
      userId,
      spotifyTrackId: { in: spotifyTrackIds },
    },
    select: { spotifyTrackId: true, fatdropUrl: true },
  });

  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.spotifyTrackId) map[row.spotifyTrackId] = row.fatdropUrl;
  }
  return map;
}
