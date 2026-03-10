import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

// Vercel sets VERCEL_URL (e.g. spotify-monitor-ten.vercel.app). Auth.js needs a full URL.
const baseUrl =
  process.env.AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

const rawSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET;
const secret = (typeof rawSecret === "string" ? rawSecret : "").trim() || undefined;

if (process.env.VERCEL) {
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is missing. In Vercel: Settings → Environment Variables → add AUTH_SECRET for Production (value from: npx auth secret)."
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be at least 32 characters. Run: npx auth secret"
    );
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: secret ?? "development-secret-change-in-production",
  ...(baseUrl && { url: baseUrl }),

  providers: [
    Spotify({
      clientId: process.env.AUTH_SPOTIFY_ID ?? "",
      clientSecret: process.env.AUTH_SPOTIFY_SECRET ?? "",
      authorization: {
        params: {
          scope: SPOTIFY_SCOPES,
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          access_token: account.access_token,
          expires_at: account.expires_at ?? Math.floor(Date.now() / 1000 + 3600),
          refresh_token: account.refresh_token,
        };
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.access_token =
          typeof token.access_token === "string"
            ? token.access_token
            : undefined;
      }
      return session;
    },
  },

  pages: {
    signIn: "/",
    error: "/auth-error",
  },
});

declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError";
    access_token?: string;
  }
}