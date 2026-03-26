import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import { parseRunResultJson } from "@/lib/scheduler-run-result";
import type { ScheduledRow } from "@/lib/scheduler-types";

export const dynamic = "force-dynamic";

function toTrackUri(row: ScheduledRow): string | null {
  const id = row.spotifyTrackId?.trim();
  if (!id) return null;
  if (id.startsWith("spotify:track:")) return id;
  if (/^[A-Za-z0-9]{22}$/.test(id)) return `spotify:track:${id}`;
  if (id.includes("open.spotify.com/track/")) {
    const m = id.match(/track\/([A-Za-z0-9]{22})/);
    return m?.[1] ? `spotify:track:${m[1]}` : null;
  }
  if (row.spotifyUrl) {
    const m = row.spotifyUrl.match(/track\/([A-Za-z0-9]{22})/);
    return m?.[1] ? `spotify:track:${m[1]}` : null;
  }
  return null;
}

async function createSpotifyPlaylist(accessToken: string, userId: string, name: string, description: string) {
  const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description, public: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify create playlist ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { id: string; external_urls?: { spotify?: string } };
  return {
    id: body.id,
    url: body.external_urls?.spotify ?? `https://open.spotify.com/playlist/${body.id}`,
  };
}

async function addTracksToPlaylist(accessToken: string, playlistId: string, uris: string[]) {
  const chunkSize = 100;
  for (let i = 0; i < uris.length; i += chunkSize) {
    const chunk = uris.slice(i, i + chunkSize);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Spotify add tracks ${res.status}: ${text}`);
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { id, runId } = await params;
  const scheduler = await prisma.scheduler.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!scheduler) return NextResponse.json({ error: "Scheduler niet gevonden" }, { status: 404 });

  let body: { name?: string; description?: string } = {};
  try {
    if (request.headers.get("content-length")) body = await request.json();
  } catch {
    // no-op
  }

  const run = await prisma.schedulerRun.findFirst({
    where: { id: runId, schedulerId: id },
    select: { id: true, resultJson: true, editedResultJson: true, status: true, createdAt: true },
  });
  if (!run) return NextResponse.json({ error: "Run niet gevonden" }, { status: 404 });
  if (run.status !== "success") {
    return NextResponse.json({ error: "Deze run is nog niet succesvol afgerond." }, { status: 400 });
  }

  const raw = run.editedResultJson ?? run.resultJson;
  const { rows } = parseRunResultJson(raw);
  const uris = rows
    .filter((r) => r.status === "scheduled")
    .map(toTrackUri)
    .filter((v): v is string => !!v);
  const uniqueUris = Array.from(new Set(uris));
  if (!uniqueUris.length) {
    return NextResponse.json({ error: "Geen geldige tracks om te exporteren." }, { status: 400 });
  }

  const playlistName = body.name?.trim() || `Scheduler: ${scheduler.name}`;
  const playlistDescription =
    body.description?.trim() || `Run export ${new Date(run.createdAt).toLocaleString("nl-NL")} via Spotify Monitor`;

  const created = await createSpotifyPlaylist(session.access_token, session.user.id, playlistName, playlistDescription);
  await addTracksToPlaylist(session.access_token, created.id, uniqueUris);

  return NextResponse.json({
    ok: true,
    spotifyPlaylistId: created.id,
    spotifyPlaylistUrl: created.url,
    trackCount: uniqueUris.length,
  });
}
