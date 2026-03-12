/**
 * Veilige helpers voor Spotify Web API-calls met Bearer token uit sessie.
 */

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

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
  const res = await fetch(`${SPOTIFY_API_BASE}/playlists/${encodeURIComponent(playlistId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<SpotifyPlaylistMetadata>;
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
    isPublic: meta.public ?? true,
    isCollaborative: meta.collaborative ?? false,
  };
}
