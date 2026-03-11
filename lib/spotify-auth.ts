/**
 * Spotify OAuth volgens het officiële voorbeeld:
 * https://github.com/spotify/web-api-examples/tree/master/authorization/authorization_code
 */

import { createHmac, randomBytes } from "node:crypto";

const STATE_COOKIE = "spotify_auth_state";
const SESSION_COOKIE = "spotify_session";
const STATE_MAX_AGE = 60 * 10; // 10 min
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dagen

function getBaseUrl(): string {
  let url = process.env.NEXTAUTH_URL ?? (process.env.VERCEL && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  url = url.replace(/\/$/, "");
  if (!url) url = "http://127.0.0.1:3000";
  return url;
}

export function getRedirectUri(): string {
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

export function encodeSession(session: SpotifySession): string {
  return signCookie(JSON.stringify(session));
}

export function decodeSession(cookieValue: string): SpotifySession | null {
  const raw = verifySignedCookie(cookieValue);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifySession;
  } catch {
    return null;
  }
}

/** Gebruik in Server Components: leest sessie uit cookie. */
export async function getSpotifySession(): Promise<SpotifySession | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(getSessionCookieName())?.value;
  if (!value) return null;
  return decodeSession(value);
}
