import { NextResponse } from "next/server";
import { getSpotifySessionFromRequest } from "@/lib/spotify-auth";
import { rebuildOrUpdateHitlistForUser } from "@/lib/hitlist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSpotifySessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  try {
    const result = await rebuildOrUpdateHitlistForUser(session.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Hitlist rebuild mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
