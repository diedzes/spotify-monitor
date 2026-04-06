/**
 * Gewogen chart uit meerdere playlists en/of groepen.
 *
 * Dedupe-strategie:
 * - Per unieke tracked playlist telt elk nummer maar één keer mee.
 * - Als dezelfde playlist zowel expliciet is geselecteerd als via een groep binnenkomt,
 *   heeft de expliciete selectie prioriteit (die weight wordt gebruikt).
 */

import { prisma } from "@/lib/db";

export type ScoringMode = "rank_points" | "normalized";

export interface ChartRow {
  spotifyTrackId: string;
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string;
  score: number;
  occurrences: number;
  sources: Array<{ type: "playlist" | "group"; name: string; weight: number }>;
}

export interface BuildChartResult {
  rows: ChartRow[];
  errors: string[]; // bronnen overgeslagen (geen snapshot etc.)
}

function parseArtists(artistsJson: string): string {
  try {
    const arr = JSON.parse(artistsJson) as Array<{ name?: string }>;
    return Array.isArray(arr) ? arr.map((a) => a.name ?? "").filter(Boolean).join(", ") : "";
  } catch {
    return "";
  }
}

/**
 * rank_points: points = (L - r + 1) met r = 1-based rank.
 * normalized: points = 1 - (r-1)/(L-1); voor L=1 geldt points = 1.
 */
function pointsForPosition(position0Based: number, trackCount: number, mode: ScoringMode): number {
  const L = trackCount;
  const r = position0Based + 1;
  if (mode === "rank_points") {
    return L - r + 1;
  }
  if (mode === "normalized") {
    if (L <= 1) return 1;
    return 1 - (r - 1) / (L - 1);
  }
  return 0;
}

/**
 * Bouw gewogen chart uit een report.
 * - Groups worden uitgeklapt naar hun gekoppelde playlists; het gewicht van de groep geldt voor elk van die playlists.
 * - Dedupe: als een playlist zowel expliciet als via een groep voorkomt, wordt alleen de expliciete bron gebruikt.
 * - Per playlist wordt de nieuwste snapshot gebruikt; ontbreekt die, dan wordt die bron overgeslagen en een fout gemeld.
 */
export async function buildChart(
  reportId: string,
  userId: string,
  scoringMode: ScoringMode
): Promise<BuildChartResult> {
  const report = await prisma.report.findFirst({
    where: { id: reportId, userId },
    include: {
      sources: {
        where: { include: true },
        include: {
          trackedPlaylist: { include: { snapshots: { orderBy: { syncedAt: "desc" }, take: 1 } } },
          playlistGroup: {
            include: {
              groupPlaylists: {
                include: {
                  trackedPlaylist: { include: { snapshots: { orderBy: { syncedAt: "desc" }, take: 1 } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!report) throw new Error("Report not found");

  const errors: string[] = [];

  // Stap 1: verzamel per tracked playlist (weight, type, name, snapshotId).
  // Dedupe: expliciet geselecteerde playlist overschrijft dezelfde playlist uit een groep.
  const playlistWeights = new Map<
    string,
    { weight: number; type: "playlist" | "group"; name: string; snapshotId: string }
  >();

  for (const src of report.sources) {
    if (src.trackedPlaylistId && src.trackedPlaylist) {
      const name = src.trackedPlaylist.name;
      const snap = src.trackedPlaylist.snapshots[0];
      if (!snap) {
        errors.push(`Playlist "${name}" has no snapshot yet; sync the playlist first.`);
        continue;
      }
      playlistWeights.set(src.trackedPlaylistId, {
        weight: src.weight,
        type: "playlist",
        name,
        snapshotId: snap.id,
      });
    } else if (src.playlistGroupId && src.playlistGroup) {
      const groupName = src.playlistGroup.name;
      for (const gp of src.playlistGroup.groupPlaylists) {
        const tp = gp.trackedPlaylist;
        if (!tp) continue;
        const snap = tp.snapshots[0];
        if (!snap) {
          errors.push(`Playlist "${tp.name}" (from group "${groupName}") has no snapshot yet; sync first.`);
          continue;
        }
        if (!playlistWeights.has(tp.id)) {
          playlistWeights.set(tp.id, { weight: src.weight, type: "group", name: groupName, snapshotId: snap.id });
        }
      }
    }
  }

  const trackScores = new Map<
    string,
    { score: number; occurrences: number; title: string; artists: string; album: string; spotifyUrl: string; sources: ChartRow["sources"] }
  >();

  for (const [, { weight, type, name, snapshotId }] of playlistWeights) {
    const tracks = await prisma.snapshotTrack.findMany({
      where: { snapshotId },
      orderBy: { position: "asc" },
    });
    const L = tracks.length;
    const sourceEntry = { type, name, weight };

    for (const t of tracks) {
      const pts = pointsForPosition(t.position, L, scoringMode);
      const added = weight * pts;
      const existing = trackScores.get(t.spotifyTrackId);
      const artists = parseArtists(t.artistsJson);
      if (!existing) {
        trackScores.set(t.spotifyTrackId, {
          score: added,
          occurrences: 1,
          title: t.title,
          artists,
          album: t.album,
          spotifyUrl: t.spotifyUrl,
          sources: [sourceEntry],
        });
      } else {
        existing.score += added;
        existing.occurrences += 1;
        existing.sources.push(sourceEntry);
      }
    }
  }

  const rows: ChartRow[] = Array.from(trackScores.entries()).map(([spotifyTrackId, v]) => ({
    spotifyTrackId,
    title: v.title,
    artists: v.artists,
    album: v.album,
    spotifyUrl: v.spotifyUrl,
    score: Math.round(v.score * 1000) / 1000,
    occurrences: v.occurrences,
    sources: v.sources,
  }));

  rows.sort((a, b) => b.score - a.score);

  return { rows, errors };
}
