import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const HITLIST_MAIN_GROUP_DESCRIPTION =
  "Source playlists for the Hitlist. Add playlists here to compare with your other tracked playlists.";

/** Standaardnaam voor de automatisch aangemaakte hoofdgroep (uniek per gebruiker via suffix). */
export const HITLIST_MAIN_GROUP_BASE_NAME = "Hoofdplaylist";

export async function getMainPlaylistGroup(userId: string) {
  return prisma.playlistGroup.findFirst({
    where: { userId, isMainGroup: true },
  });
}

export async function getMainSourcePlaylistIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.groupPlaylist.findMany({
    where: { group: { userId, isMainGroup: true } },
    select: { trackedPlaylistId: true },
  });
  return new Set(rows.map((r) => r.trackedPlaylistId));
}

/**
 * Zorgt dat de gebruiker precies één Hitlist main group heeft (lege groep als die nog niet bestond).
 */
export async function ensureMainPlaylistGroup(userId: string) {
  const existing = await getMainPlaylistGroup(userId);
  if (existing) return existing;

  for (let i = 0; i < 30; i++) {
    const name = i === 0 ? HITLIST_MAIN_GROUP_BASE_NAME : `${HITLIST_MAIN_GROUP_BASE_NAME} (${i})`;
    try {
      return await prisma.playlistGroup.create({
        data: {
          userId,
          name,
          description: HITLIST_MAIN_GROUP_DESCRIPTION,
          color: "#15803d",
          isMainGroup: true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Could not create Hitlist main group");
}

export async function isMainHitlistGroup(userId: string, groupId: string): Promise<boolean> {
  const g = await prisma.playlistGroup.findFirst({
    where: { id: groupId, userId, isMainGroup: true },
    select: { id: true },
  });
  return !!g;
}
