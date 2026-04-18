import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { fetchPlaylistMetadataPreferringClientCredentials, playlistMetadataToTrackedFields } from "@/lib/spotify-api";
import { syncTrackedPlaylist } from "@/lib/sync-playlists";

export const dynamic = "force-dynamic";

export type AddFromProfileResult = {
  ok: boolean;
  added: number;
  skipped: number;
  errors: Array<{ spotifyPlaylistId: string; error: string }>;
};

/**
 * POST { spotifyPlaylistIds: string[] }
 * Voegt geselecteerde playlists toe aan TrackedPlaylist (dedup op Spotify playlist-id).
 */
export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { spotifyPlaylistIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const ids = Array.isArray(body.spotifyPlaylistIds)
    ? body.spotifyPlaylistIds.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return NextResponse.json({ error: "Geen playlist-ids opgegeven." }, { status: 400 });
  }

  const result: AddFromProfileResult = { ok: true, added: 0, skipped: 0, errors: [] };

  for (const spotifyPlaylistId of unique) {
    try {
      const metadata = await fetchPlaylistMetadataPreferringClientCredentials(
        spotifyPlaylistId,
        session.access_token
      );
      const fields = playlistMetadataToTrackedFields(metadata);
      const created = await prisma.trackedPlaylist.create({
        data: {
          userId: session.user.id,
          ...fields,
        },
      });
      await syncTrackedPlaylist(created.id, session.access_token);
      result.added += 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        result.skipped += 1;
        continue;
      }
      if (err instanceof Error) {
        if (err.message.startsWith("Spotify API 404")) {
          result.errors.push({ spotifyPlaylistId, error: "Playlist niet gevonden of niet publiek." });
          continue;
        }
        if (err.message.startsWith("Spotify API 401")) {
          return NextResponse.json({ error: "Sessie verlopen. Log opnieuw in." }, { status: 401 });
        }
        result.errors.push({ spotifyPlaylistId, error: err.message });
        continue;
      }
      result.errors.push({ spotifyPlaylistId, error: "Onbekende fout" });
    }
  }

  return NextResponse.json(result);
}
