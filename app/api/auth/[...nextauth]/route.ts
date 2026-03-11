import NextAuth from "next-auth";
import { authOptions, lastSpotifyTokenError, clearLastSpotifyTokenError } from "@/auth";

const handler = NextAuth(authOptions);

async function withSpotifyErrorCookie(req: Request): Promise<Response> {
  const res = await handler(req);
  if (res?.status === 302 && lastSpotifyTokenError) {
    const location = res.headers.get("Location") ?? "";
    const value = encodeURIComponent(lastSpotifyTokenError);
    clearLastSpotifyTokenError();
    return new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Set-Cookie": `spotify_token_error=${value}; Path=/; Max-Age=120; HttpOnly; SameSite=Lax`,
      },
    });
  }
  return res;
}

export const GET = (req: Request) => withSpotifyErrorCookie(req);
export const POST = (req: Request) => withSpotifyErrorCookie(req);
