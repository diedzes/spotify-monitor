import { NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";
import {
  parsePlaylistIdFromInput,
  fetchPlaylistMetadata,
  playlistMetadataToTrackedFields,
} from "@/lib/spotify-api";
import { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  const session = await getSpotifySession();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: { playlistUrlOrId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige body" }, { status: 400 });
  }

  const playlistUrlOrId = typeof body.playlistUrlOrId === "string" ? body.playlistUrlOrId.trim() : "";
  const playlistId = parsePlaylistIdFromInput(playlistUrlOrId);
  if (!playlistId) {
    return NextResponse.json(
      { error: "Ongeldige Spotify playlist URL of ID. Gebruik een link zoals https://open.spotify.com/playlist/... of alleen het playlist ID." },
      { status: 400 }
    );
  }

  try {
    const metadata = await fetchPlaylistMetadata(session.access_token, playlistId);
    const fields = playlistMetadataToTrackedFields(metadata);
    await prisma.trackedPlaylist.create({
      data: {
        userId: session.user.id,
        ...fields,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Deze playlist staat al in je lijst." },
        { status: 409 }
      );
    }
    if (err instanceof Error) {
      if (err.message.startsWith("Spotify API 404")) {
        return NextResponse.json(
          { error: "Playlist niet gevonden. Controleer de URL of ID en of de playlist openbaar is." },
          { status: 400 }
        );
      }
      if (err.message.startsWith("Spotify API 401")) {
        return NextResponse.json(
          { error: "Sessie verlopen. Log opnieuw in." },
          { status: 401 }
        );
      }
    }
    console.error("[playlists/add]", err);
    return NextResponse.json(
      { error: "Kon playlist niet toevoegen. Probeer het later opnieuw." },
      { status: 500 }
    );
  }
}
