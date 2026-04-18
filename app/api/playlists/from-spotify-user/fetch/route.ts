import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { extractSpotifyUserIdFromInput } from "@/lib/spotify-user-id";
import {
  fetchAllPublicPlaylistsForSpotifyUser,
  fetchSpotifyUserProfileWithTokenFallback,
} from "@/lib/spotify-profile-playlists";

export const dynamic = "force-dynamic";

/**
 * POST { profileUrlOrUserId: string }
 * Haalt publieke playlists van het opgegeven Spotify-account op.
 */
export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { profileUrlOrUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = typeof body.profileUrlOrUserId === "string" ? body.profileUrlOrUserId.trim() : "";
  const spotifyUserId = extractSpotifyUserIdFromInput(raw);
  if (!spotifyUserId) {
    return NextResponse.json(
      {
        error:
          "Ongeldige invoer. Gebruik een Spotify-profiel-URL (open.spotify.com/user/…) of het user-id.",
      },
      { status: 400 }
    );
  }

  try {
    const profile = await fetchSpotifyUserProfileWithTokenFallback(spotifyUserId, session.access_token);
    const { playlists, usedClientCredentials } = await fetchAllPublicPlaylistsForSpotifyUser(
      profile.id,
      session.access_token
    );

    return NextResponse.json({
      ok: true,
      spotifyUser: {
        id: profile.id,
        displayName: profile.display_name,
      },
      playlists,
      usedClientCredentials,
      empty: playlists.length === 0,
      message:
        playlists.length === 0
          ? "Geen publieke playlists gevonden voor dit account (of ze zijn niet zichtbaar via de API)."
          : undefined,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Spotify-account niet gevonden. Controleer de URL of user-id." },
        { status: 404 }
      );
    }
    if (e instanceof Error) {
      if (e.message.includes("Spotify API 401") || e.message.includes("Spotify API 403")) {
        return NextResponse.json(
          { error: "Spotify weigert de aanvraag. Log opnieuw in of controleer de app-instellingen." },
          { status: 502 }
        );
      }
      if (e.message.includes("niet geconfigureerd")) {
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }
    console.error("[from-spotify-user/fetch]", e);
    return NextResponse.json(
      { error: "Kon playlists niet ophalen. Probeer het later opnieuw." },
      { status: 500 }
    );
  }
}
