import { syncTrackedPlaylist } from "@/lib/sync-playlists";
import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import {
  parsePlaylistIdFromInput,
  fetchPlaylistMetadata,
  playlistMetadataToTrackedFields,
} from "@/lib/spotify-api";
import { Prisma } from "@prisma/client";

export type AddBatchResult = {
  ok: boolean;
  added: number;
  skipped: number;
  errors: Array<{ input: string; playlistId?: string; error: string }>;
};

export async function POST(request: Request): Promise<NextResponse<AddBatchResult | { error: string }>> {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { playlistUrlOrIds?: string[] | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body.playlistUrlOrIds;
  const lines: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : typeof raw === "string"
      ? raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one playlist URL or ID (one per line or as an array)." },
      { status: 400 }
    );
  }

  const parsed: Array<{ input: string; playlistId: string }> = [];
  const invalid: Array<{ input: string; error: string }> = [];
  for (const line of lines) {
    const id = parsePlaylistIdFromInput(line);
    if (id) parsed.push({ input: line, playlistId: id });
    else invalid.push({ input: line, error: "Invalid URL or ID" });
  }

  const uniqueIds = [...new Set(parsed.map((p) => p.playlistId))];
  const results: AddBatchResult = { ok: true, added: 0, skipped: 0, errors: [...invalid] };

  for (const playlistId of uniqueIds) {
    try {
      const metadata = await fetchPlaylistMetadata(session.access_token, playlistId);
      const fields = playlistMetadataToTrackedFields(metadata);
      const created = await prisma.trackedPlaylist.create({
        data: {
          userId: session.user.id,
          ...fields,
        },
      });
      await syncTrackedPlaylist(created.id, session.access_token);
      results.added += 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        results.skipped += 1;
        continue;
      }
      if (err instanceof Error) {
        if (err.message.startsWith("Spotify API 404")) {
          results.errors.push({
            input: parsed.find((p) => p.playlistId === playlistId)?.input ?? playlistId,
            playlistId,
            error: "Playlist not found or not public",
          });
          continue;
        }
        if (err.message.startsWith("Spotify API 401")) {
          return NextResponse.json(
            { error: "Sessie verlopen. Log opnieuw in." },
            { status: 401 }
          );
        }
      }
      results.errors.push({
        input: parsed.find((p) => p.playlistId === playlistId)?.input ?? playlistId,
        playlistId,
        error: err instanceof Error ? err.message : "Could not add",
      });
    }
  }

  return NextResponse.json(results);
}
