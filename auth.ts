import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

// Zorg dat Auth.js (die intern AUTH_SECRET leest) altijd een waarde ziet
const rawSecret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET;
const secret = (typeof rawSecret === "string" ? rawSecret : "").trim() || undefined;
if (secret && !process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = secret;
}

// Vercel: basis-URL voor Auth.js
const baseUrl =
  process.env.AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

if (process.env.VERCEL) {
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is missing. In Vercel: Settings → Environment Variables → add AUTH_SECRET or BETTER_AUTH_SECRET for Production/Preview."
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be at least 32 characters. Run: npx auth secret"
    );
  }
}

const spotifyClientId = (process.env.AUTH_SPOTIFY_ID ?? "").trim();
const spotifyClientSecret = (process.env.AUTH_SPOTIFY_SECRET ?? "").trim();
if (process.env.VERCEL && (!spotifyClientId || !spotifyClientSecret)) {
  throw new Error(
    "AUTH_SPOTIFY_ID and AUTH_SPOTIFY_SECRET must be set in Vercel Environment Variables."
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: secret ?? "development-secret-change-in-production",
  ...(baseUrl && { url: baseUrl }),

  providers: [
    Spotify({
      clientId: spotifyClientId,
      clientSecret: spotifyClientSecret,
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