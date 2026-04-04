import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSpotifySessionFromRequest, getSessionCookieName, decodeSessionId } from "@/lib/spotify-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (session) {
    const playlists = await prisma.trackedPlaylist.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    const playlistIds = playlists.map((p) => p.id);
    const groupLinks = playlistIds.length
      ? await prisma.groupPlaylist.findMany({
          where: {
            trackedPlaylistId: { in: playlistIds },
            group: { userId: session.user.id },
          },
          include: { group: { select: { id: true, name: true, color: true } } },
        })
      : [];
    const groupsByPlaylistId = new Map<string, Array<{ id: string; name: string; color: string }>>();
    for (const link of groupLinks) {
      const list = groupsByPlaylistId.get(link.trackedPlaylistId) ?? [];
      list.push({ id: link.group.id, name: link.group.name, color: link.group.color });
      groupsByPlaylistId.set(link.trackedPlaylistId, list);
    }
    return NextResponse.json({
      user: session.user,
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        ownerName: p.ownerName,
        trackCount: p.trackCount,
        lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
        spotifyPlaylistId: p.spotifyPlaylistId,
        isPublic: p.isPublic,
        isMainPlaylist: p.isMainPlaylist,
        groups: groupsByPlaylistId.get(p.id) ?? [],
      })),
    });
  }

  const store = await cookies();
  const cookieValue = store.get(getSessionCookieName())?.value;
  const headerValue = request.headers.get("x-spotify-session")?.trim() ?? null;
  const clientHadCookie = request.headers.get("x-debug-client-had-session-cookie") === "1";
  const sessionIdFromCookie = cookieValue ? decodeSessionId(cookieValue) : null;
  const sessionIdFromHeader = headerValue ? decodeSessionId(headerValue) : null;
  const sessionId = sessionIdFromCookie ?? sessionIdFromHeader;
  const dbRow = sessionId ? await prisma.session.findUnique({ where: { id: sessionId } }) : null;
  const validIdButNotInDb = !!sessionId && !dbRow;
  return NextResponse.json(
    {
      error: "Niet ingelogd",
      hint: validIdButNotInDb ? "session_not_in_db" : undefined,
      debug: {
        hasCookie: !!cookieValue,
        hasHeader: !!headerValue,
        clientHadSessionCookie: clientHadCookie,
        hasValidSessionId: !!sessionId,
        sessionFoundInDb: !!dbRow,
      },
    },
    { status: 401 }
  );
}
