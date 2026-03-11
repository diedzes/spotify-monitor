import type { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

const secret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET;

// Redirect URI moet exact overeenkomen met wat in het Spotify-dashboard staat:
// https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
// Gebruik HTTPS (behalve loopback); geen trailing slash.
if (process.env.VERCEL && process.env.VERCEL_URL && !process.env.NEXTAUTH_URL) {
  const base = `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  process.env.NEXTAUTH_URL = base;
}
if (process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.replace(/\/$/, "");
}

/** Wordt gezet bij token-fout zodat we die op de pagina kunnen tonen (geen logs nodig). */
export let lastSpotifyTokenError: string | null = null;

export function clearLastSpotifyTokenError(): void {
  lastSpotifyTokenError = null;
}

/** Custom token request: logt de fout en zet lastSpotifyTokenError voor weergave op de pagina. */
async function spotifyTokenRequest({
  provider,
  params,
}: {
  provider: { token?: { url?: string }; clientId?: string; clientSecret?: string; callbackUrl?: string };
  params: Record<string, string>;
}) {
  const tokenUrl = provider.token?.url ?? "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code ?? "",
    redirect_uri: provider.callbackUrl ?? "",
    client_id: provider.clientId ?? "",
    client_secret: provider.clientSecret ?? "",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    lastSpotifyTokenError = `${res.status}: ${text}`;
    throw new Error(`Spotify token error ${res.status}: ${text}`);
  }
  return { tokens: JSON.parse(text) as Record<string, unknown> };
}

export const authOptions: NextAuthOptions = {
  secret: secret ?? undefined,
  providers: [
    SpotifyProvider({
      clientId: process.env.AUTH_SPOTIFY_ID ?? process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret:
        process.env.AUTH_SPOTIFY_SECRET ?? process.env.SPOTIFY_CLIENT_SECRET ?? "",
      authorization: {
        params: { scope: SPOTIFY_SCOPES },
      },
      token: {
        request: spotifyTokenRequest as never,
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = account.expires_at ?? Math.floor(Date.now() / 1000 + 3600);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session as { access_token?: string }).access_token = token.access_token as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/auth-error",
  },
  debug: process.env.VERCEL === "1",
};

declare module "next-auth" {
  interface Session {
    access_token?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  }
}
