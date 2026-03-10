import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,

  providers: [
    Spotify({
      clientId: process.env.AUTH_SPOTIFY_ID!,
      clientSecret: process.env.AUTH_SPOTIFY_SECRET!,
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
  },
});

declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError";
    access_token?: string;
  }
}