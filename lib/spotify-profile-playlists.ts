/**
 * Publieke playlists van een Spotify-gebruiker (Web API).
 * Paginatie volgt het `next`-veld van Spotify (correct bij grote accounts).
 *
 * Token: eerst Client Credentials (zoals gevraagd); bij 401/403 valt de app terug
 * op de OAuth-token van de ingelogde gebruiker — Spotify staat CC niet altijd toe
 * voor user-playlist endpoints.
 */

import { spotifyFetch } from "@/lib/spotify-api";
import { getSpotifyClientCredentialsToken } from "@/lib/spotify-client-credentials";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export type NormalizedPublicPlaylist = {
  spotifyPlaylistId: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
  spotifyUrl: string;
  ownerName: string;
  ownerSpotifyUserId: string;
  isPublic: boolean;
};

type SpotifyUserProfile = {
  id: string;
  display_name: string | null;
};

type SpotifyPlaylistPageItem = {
  id: string;
  name: string;
  public: boolean | null;
  tracks: { total: number };
  images: Array<{ url: string }>;
  external_urls: { spotify: string };
  owner: { id: string; display_name: string | null };
};

type SpotifyUserPlaylistsResponse = {
  items: SpotifyPlaylistPageItem[];
  next: string | null;
};

function normalizeItem(item: SpotifyPlaylistPageItem): NormalizedPublicPlaylist {
  return {
    spotifyPlaylistId: item.id,
    name: item.name,
    trackCount: item.tracks?.total ?? 0,
    imageUrl: item.images?.[0]?.url ?? null,
    spotifyUrl: item.external_urls?.spotify ?? `https://open.spotify.com/playlist/${item.id}`,
    ownerName: item.owner?.display_name ?? item.owner?.id ?? "Unknown",
    ownerSpotifyUserId: item.owner?.id ?? "",
    isPublic: item.public === true,
  };
}

/**
 * Profiel ophalen. Probeert eerst client credentials, daarna user OAuth.
 */
export async function fetchSpotifyUserProfileWithTokenFallback(
  spotifyUserId: string,
  userOAuthToken: string
): Promise<SpotifyUserProfile> {
  const url = `${SPOTIFY_API_BASE}/users/${encodeURIComponent(spotifyUserId)}`;

  let cc: string | undefined;
  try {
    cc = await getSpotifyClientCredentialsToken();
  } catch {
    cc = undefined;
  }

  if (cc) {
    const res = await spotifyFetch(url, { accessToken: cc });
    if (res.ok) return res.json() as Promise<SpotifyUserProfile>;
    if (res.status !== 401 && res.status !== 403) {
      const text = await res.text();
      throw new Error(`Spotify API ${res.status}: ${text || res.statusText}`);
    }
  }

  const res = await spotifyFetch(url, { accessToken: userOAuthToken });
  if (res.status === 404) {
    throw new Error("USER_NOT_FOUND");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<SpotifyUserProfile>;
}

/**
 * Alle items waar `public === true`, dedup op playlist-id, gesorteerd op naam.
 */
async function loadAllPublicPlaylists(spotifyUserId: string, accessToken: string): Promise<NormalizedPublicPlaylist[]> {
  const byId = new Map<string, NormalizedPublicPlaylist>();
  let nextUrl: string | null =
    `${SPOTIFY_API_BASE}/users/${encodeURIComponent(spotifyUserId)}/playlists?limit=50&offset=0`;

  while (nextUrl) {
    const res = await spotifyFetch(nextUrl, { accessToken });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Spotify API ${res.status}: ${text || res.statusText}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    const page = (await res.json()) as SpotifyUserPlaylistsResponse;
    for (const item of page.items) {
      if (item.public !== true) continue;
      byId.set(item.id, normalizeItem(item));
    }
    nextUrl = page.next;
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/**
 * Publieke playlists ophalen met CC indien mogelijk, anders OAuth.
 */
export async function fetchAllPublicPlaylistsForSpotifyUser(
  spotifyUserId: string,
  userOAuthToken: string
): Promise<{ playlists: NormalizedPublicPlaylist[]; usedClientCredentials: boolean }> {
  let cc: string | undefined;
  try {
    cc = await getSpotifyClientCredentialsToken();
  } catch {
    cc = undefined;
  }

  if (cc) {
    try {
      const playlists = await loadAllPublicPlaylists(spotifyUserId, cc);
      return { playlists, usedClientCredentials: true };
    } catch (e) {
      const status = typeof e === "object" && e !== null && "status" in e ? (e as { status: number }).status : 0;
      if (status !== 401 && status !== 403) throw e;
    }
  }

  const playlists = await loadAllPublicPlaylists(spotifyUserId, userOAuthToken);
  return { playlists, usedClientCredentials: false };
}
