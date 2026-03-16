import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ChartRow = {
  spotifyTrackId: string;
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string;
  score: number;
  occurrences: number;
  sources: Array<{ type: string; name: string; weight: number }>;
};

async function createSpotifyPlaylist(
  accessToken: string,
  userId: string,
  name: string,
  description: string | null
): Promise<{ id: string; url: string }> {
  const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description: description ?? undefined,
      public: false,
    }),
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

async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[]
): Promise<void> {
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

function rowsToTrackUris(rows: ChartRow[]): string[] {
  return rows
    .map((row) => {
      if (row.spotifyTrackId) {
        return `spotify:track:${row.spotifyTrackId}`;
      }
      const m = row.spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
      return m?.[1] ? `spotify:track:${m[1]}` : null;
    })
    .filter((x): x is string => typeof x === "string");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const { id } = await params;

  let body: { name?: string; description?: string } = {};
  try {
    if (request.headers.get("content-length")) {
      body = await request.json();
    }
  } catch {
    // negeer body-fouten, gebruik defaults
  }

  try {
    const report = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      include: {
        results: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });
    if (!report) {
      return NextResponse.json({ error: "Report niet gevonden" }, { status: 404 });
    }
    const latestResult = report.results[0] ?? null;
    if (!latestResult) {
      return NextResponse.json({ error: "Geen resultaat om te exporteren. Genereer eerst een chart." }, { status: 400 });
    }

    const rawJson = latestResult.editedRowsJson ?? latestResult.rowsJson;
    let rows: ChartRow[];
    try {
      const rowsJson =
        typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson);
      rows = JSON.parse(rowsJson) as ChartRow[];
    } catch {
      return NextResponse.json({ error: "Kon chart-data niet lezen." }, { status: 500 });
    }
    if (!rows.length) {
      return NextResponse.json({ error: "Geen tracks in dit resultaat om te exporteren." }, { status: 400 });
    }

    const uris = rowsToTrackUris(rows);
    if (!uris.length) {
      return NextResponse.json({ error: "Geen geldige Spotify-tracks in deze chart." }, { status: 400 });
    }

    const playlistName =
      (body.name && body.name.trim()) || `Report: ${report.name}`;
    const playlistDescription =
      body.description?.trim() || `Gegenereerd met Spotify Monitor op ${new Date().toLocaleString("nl-NL")}`;

    const created = await createSpotifyPlaylist(
      session.access_token,
      session.user.id,
      playlistName,
      playlistDescription
    );
    await addTracksToPlaylist(session.access_token, created.id, uris);

    return NextResponse.json({
      ok: true,
      spotifyPlaylistId: created.id,
      spotifyPlaylistUrl: created.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    console.error("[POST /api/reports/[id]/export/playlist]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

