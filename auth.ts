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

// Op Vercel: altijd de huidige deployment-URL gebruiken, anders klopt de callback niet met Spotify.
if (process.env.VERCEL && process.env.VERCEL_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
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
