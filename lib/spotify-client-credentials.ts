/**
 * Spotify Client Credentials flow (app-only token).
 * Gebruikt dezelfde SPOTIFY_CLIENT_ID / AUTH_SPOTIFY_ID + secret als OAuth.
 * Token wordt in-memory gecached tot kort voor expiry (rate limits besparen).
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";

type Cached = { token: string; expiresAtMs: number };

let cache: Cached | null = null;

/** Veiligheidsmarge vóór echte expiry (ms). */
const EXPIRY_SKEW_MS = 60_000;

function getClientCredentials(): { id: string; secret: string } | null {
  const id = process.env.AUTH_SPOTIFY_ID ?? process.env.SPOTIFY_CLIENT_ID ?? "";
  const secret = process.env.AUTH_SPOTIFY_SECRET ?? process.env.SPOTIFY_CLIENT_SECRET ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

/**
 * Haalt een access token op via Client Credentials.
 * Gooit als client id/secret ontbreken of Spotify faalt.
 */
export async function getSpotifyClientCredentialsToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAtMs > now + EXPIRY_SKEW_MS) {
    return cache.token;
  }

  const creds = getClientCredentials();
  if (!creds) {
    throw new Error("SPOTIFY_CLIENT_ID en SPOTIFY_CLIENT_SECRET (of AUTH_*) zijn niet geconfigureerd.");
  }

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Client credentials token failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
  cache = {
    token: data.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return cache.token;
}

export function clearSpotifyClientCredentialsCacheForTests(): void {
  cache = null;
}
