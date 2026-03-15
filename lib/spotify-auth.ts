/**
 * Spotify OAuth volgens het officiële voorbeeld:
 * https://github.com/spotify/web-api-examples/tree/master/authorization/authorization_code
 */

import { createHmac, randomBytes } from "node:crypto";

const STATE_COOKIE = "spotify_auth_state";
const SESSION_COOKIE = "spotify_session";
/** Client-leesbare cookie (zelfde waarde) zodat fetch kan meesturen in header als Cookie niet gaat */
export const SESSION_HEADER_COOKIE = "spotify_session_s";
const STATE_MAX_AGE = 60 * 10; // 10 min
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dagen

export function getBaseUrl(): string {
  let url = process.env.NEXTAUTH_URL ?? (process.env.VERCEL && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  url = url.replace(/\/$/, "");
  if (!url) url = "http://127.0.0.1:3000";
  return url;
}

/** Callback URL voor Spotify OAuth. Gebruik SPOTIFY_REDIRECT_URI of NEXTAUTH_URL op Vercel om een vaste URL te hebben. */
export function getRedirectUri(): string {
  const explicit = process.env.SPOTIFY_REDIRECT_URI ?? process.env.AUTH_SPOTIFY_REDIRECT_URI;
  if (explicit?.trim()) return explicit.trim().replace(/\/$/, "");
  return `${getBaseUrl()}/api/auth/spotify/callback`;
}

export function generateState(): string {
  return randomBytes(32).toString("hex").slice(0, 32);
}

export function getStateCookieName(): string {
  return STATE_COOKIE;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function getStateCookieMaxAge(): number {
  return STATE_MAX_AGE;
}

export function getSessionCookieMaxAge(): number {
  return SESSION_MAX_AGE;
}

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    "development-secret-change-in-production"
  );
}

export function signCookie(value: string): string {
  const secret = getSecret();
  const sig = createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${sig}`;
}

export function verifySignedCookie(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac("sha256", getSecret()).update(value).digest("hex");
  return sig === expected ? value : null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = process.env.AUTH_SPOTIFY_ID ?? process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.AUTH_SPOTIFY_SECRET ?? process.env.SPOTIFY_CLIENT_SECRET ?? "";
  const redirectUri = getRedirectUri();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[Spotify token response]", res.status, text);
    throw new Error(`Spotify token error ${res.status}: ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

/** Vernieuw access token met refresh token (zoals PHP-docs: zonder user interaction). */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.AUTH_SPOTIFY_ID ?? process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.AUTH_SPOTIFY_SECRET ?? process.env.SPOTIFY_CLIENT_SECRET ?? "";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[Spotify refresh token]", res.status, text);
    throw new Error(`Spotify refresh ${res.status}: ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function getSpotifyProfile(accessToken: string): Promise<{ id: string; display_name: string | null; email: string | null }> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  const data = (await res.json()) as { id: string; display_name?: string | null; email?: string | null };
  return {
    id: data.id,
    display_name: data.display_name ?? null,
    email: data.email ?? null,
  };
}

export interface SpotifySession {
  user: { id: string; name: string | null; email: string | null };
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

/** Cookie waarde voor server-side sessie: alleen signed session-id (klein, onder 4KB-limiet). */
export function encodeSessionId(sessionId: string): string {
  return signCookie(sessionId);
}

/** Lees session-id uit cookie (geverifieerde handtekening). */
export function decodeSessionId(cookieValue: string): string | null {
  return verifySignedCookie(cookieValue);
}

export async function getSessionFromSignedValue(signedValue: string): Promise<SpotifySession | null> {
  const { prisma } = await import("@/lib/db");
  const sessionId = decodeSessionId(signedValue);
  if (!sessionId) return null;
  const row = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!row) return null;

  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 min – vernieuw net vóór verloop (zoals PHP auto_refresh)
  if (row.expiresAt.getTime() > now.getTime() + bufferMs) {
    return {
      user: { id: row.userId, name: row.userName, email: row.userEmail },
      access_token: row.accessToken,
      refresh_token: row.refreshToken ?? undefined,
      expires_at: Math.floor(row.expiresAt.getTime() / 1000),
    };
  }

  if (!row.refreshToken) return null;
  try {
    const tokens = await refreshAccessToken(row.refreshToken);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? row.refreshToken,
        expiresAt,
      },
    });
    return {
      user: { id: row.userId, name: row.userName, email: row.userEmail },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? row.refreshToken,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    };
  } catch {
    return null;
  }
}

/** Gebruik in Server Components: leest sessie uit cookie (session-id) en haalt sessie uit DB. */
export async function getSpotifySession(): Promise<SpotifySession | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(getSessionCookieName())?.value;
  if (!value) return null;
  return getSessionFromSignedValue(value);
}

/** Geef de signed session-id terug (cookie-waarde) voor links naar bv. /playlists?sid=... */
export async function getSessionSignedIdFromCookie(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(getSessionCookieName())?.value;
  return value ?? null;
}

/** Voor API routes: probeer cookie, anders X-Spotify-Session header (client stuurt die vanuit leesbare cookie). */
export async function getSpotifySessionFromRequest(request: Request): Promise<SpotifySession | null> {
  const cookieHeader = request.headers.get("cookie");
  const sessionCookie = getSessionCookieName();
  const match = cookieHeader?.match(new RegExp(`${sessionCookie}=([^;]+)`));
  const fromCookie = match?.[1] ? decodeURIComponent(match[1].trim()) : null;
  if (fromCookie) {
    const s = await getSessionFromSignedValue(fromCookie);
    if (s) return s;
  }
  const fromHeader = request.headers.get("x-spotify-session");
  if (fromHeader) return getSessionFromSignedValue(fromHeader.trim());
  return null;
}

/** Voor cron/background: haal geldige sessie op uit een DB-sessierow (vernieuw token indien verlopen). */
export async function getValidSessionFromRow(row: {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}): Promise<SpotifySession | null> {
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;
  if (row.expiresAt.getTime() > now.getTime() + bufferMs) {
    return {
      user: { id: row.userId, name: row.userName, email: row.userEmail },
      access_token: row.accessToken,
      refresh_token: row.refreshToken ?? undefined,
      expires_at: Math.floor(row.expiresAt.getTime() / 1000),
    };
  }
  if (!row.refreshToken) return null;
  const { prisma } = await import("@/lib/db");
  try {
    const tokens = await refreshAccessToken(row.refreshToken);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    await prisma.session.update({
      where: { id: row.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? row.refreshToken,
        expiresAt,
      },
    });
    return {
      user: { id: row.userId, name: row.userName, email: row.userEmail },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? row.refreshToken,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    };
  } catch {
    return null;
  }
}
