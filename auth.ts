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

// Op Vercel: alleen NEXTAUTH_URL vullen als die nog niet staat.
// Zet in Vercel (Production) NEXTAUTH_URL=https://spotify-monitor-ten.vercel.app
// zodat de callback overeenkomt met je domein (VERCEL_URL is vaak een preview-URL).
if (process.env.VERCEL && process.env.VERCEL_URL && !process.env.NEXTAUTH_URL) {
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
