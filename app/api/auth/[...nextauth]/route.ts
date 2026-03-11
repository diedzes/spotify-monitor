import NextAuth from "next-auth";
import { authOptions, lastSpotifyTokenError, clearLastSpotifyTokenError } from "@/auth";

const handler = NextAuth(authOptions);

async function withSpotifyErrorCookie(req: Request): Promise<Response> {
  const res = await handler(req);
  if (res?.status === 302 && lastSpotifyTokenError) {
    const location = res.headers.get("Location") ?? "";
    const cookie = `spotify_token_error=${encodeURIComponent(lastSpotifyTokenError)}; Path=/; Max-Age=120; HttpOnly; SameSite=Lax`;
    const headers = new Headers(res.headers);
    headers.append("Set-Cookie", cookie);
    clearLastSpotifyTokenError();
    return new Response(null, { status: 302, headers });
  }
  return res;
}

export const GET = (req: Request) => withSpotifyErrorCookie(req);
export const POST = (req: Request) => withSpotifyErrorCookie(req);
