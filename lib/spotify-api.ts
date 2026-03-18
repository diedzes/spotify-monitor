/**
 * Veilige helpers voor Spotify Web API-calls met Bearer token uit sessie.
 */

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_429_RETRIES = 5;

/**
 * Fetch met retry bij 429 (Rate Limit). Wacht op Retry-After of 1s en probeer opnieuw.
 */
export async function spotifyFetch(
  url: string,
  options: RequestInit & { accessToken: string }
): Promise<Response> {
  const { accessToken, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url, { ...fetchOptions, headers });
    lastRes = res;
    if (res.status !== 429) return res;
    const retryAfter = res.headers.get("Retry-After");
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : DEFAULT_RETRY_AFTER_MS;
    if (attempt < MAX_429_RETRIES) await new Promise((r) => setTimeout(r, Math.min(waitMs, 60000)));
  }
  return lastRes!;
}

/**
 * Haal playlist ID uit een Spotify URL of een raw ID.
 * Ondersteunt:
 * - https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n
 * - open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n
 * - 3cEYpjA9oz9GiPac4AsH4n (alleen ID)
 */
export function parsePlaylistIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Alleen ID (Spotify IDs zijn 22 base62 karakters)
  const idOnly = /^[a-zA-Z0-9]{22}$/;
  if (idOnly.test(trimmed)) return trimmed;

  // URL-vormen
  const patterns = [
    /(?:https?:\/\/)?open\.spotify\.com\/playlist\/([a-zA-Z0-9]{22})/,
    /spotify:playlist:([a-zA-Z0-9]{22})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export interface SpotifyPlaylistMetadata {
  id: string;
  name: string;
  description: string | null;
  owner: { display_name: string };
  images: Array<{ url: string }>;
  snapshot_id: string;
  tracks: { total: number };
  followers?: { total: number };
  public: boolean;
  collaborative: boolean;
}

/**
 * Haal playlist metadata op via de Spotify Web API.
 * Gebruik access_token uit getSpotifySession().
 */
export async function fetchPlaylistMetadata(
  accessToken: string,
  playlistId: string
): Promise<SpotifyPlaylistMetadata> {
  const res = await spotifyFetch(
    `${SPOTIFY_API_BASE}/playlists/${encodeURIComponent(playlistId)}`,
    { accessToken }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<SpotifyPlaylistMetadata>;
}

export interface SpotifyPlaylistTrackItem {
  track: {
    id: string | null;
    uri: string;
    name: string;
    external_urls: { spotify: string };
    album: { name: string };
    artists: Array<{ id?: string; name: string }>;
  } | null;
}

export interface SpotifyPlaylistTracksResponse {
  items: SpotifyPlaylistTrackItem[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

/**
 * Haal één pagina playlist items op (max 50).
 */
export async function fetchPlaylistTracksPage(
  accessToken: string,
  playlistId: string,
  offset: number,
  limit: number = 50
): Promise<SpotifyPlaylistTracksResponse> {
  const url = `${SPOTIFY_API_BASE}/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}`;
  const res = await spotifyFetch(url, { accessToken });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<SpotifyPlaylistTracksResponse>;
}

/**
 * Zet Spotify playlist response om naar velden voor ons TrackedPlaylist model.
 */
export function playlistMetadataToTrackedFields(meta: SpotifyPlaylistMetadata) {
  return {
    spotifyPlaylistId: meta.id,
    name: meta.name,
    description: meta.description ?? null,
    ownerName: meta.owner?.display_name ?? "Unknown",
    imageUrl: meta.images?.[0]?.url ?? null,
    snapshotId: meta.snapshot_id ?? null,
    trackCount: meta.tracks?.total ?? 0,
    followerCount: meta.followers?.total ?? 0,
    isPublic: meta.public ?? true,
    isCollaborative: meta.collaborative ?? false,
  };
}
