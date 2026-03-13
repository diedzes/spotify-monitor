/**
 * Playlistgroepen: groepen van tracked playlists per gebruiker.
 */

import { prisma } from "@/lib/db";

export async function createPlaylistGroup(
  userId: string,
  name: string,
  description?: string | null
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Naam is verplicht");
  return prisma.playlistGroup.create({
    data: {
      userId,
      name: trimmed,
      description: description?.trim() || null,
    },
  });
}

export async function getPlaylistGroups(userId: string) {
  return prisma.playlistGroup.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { groupPlaylists: true } },
    },
  });
}

export async function getPlaylistGroupById(userId: string, groupId: string) {
  return prisma.playlistGroup.findFirst({
    where: { id: groupId, userId },
    include: {
      groupPlaylists: {
        include: {
          trackedPlaylist: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function addPlaylistToGroup(
  userId: string,
  groupId: string,
  trackedPlaylistId: string
) {
  const group = await prisma.playlistGroup.findFirst({
    where: { id: groupId, userId },
  });
  if (!group) throw new Error("Groep niet gevonden");

  const playlist = await prisma.trackedPlaylist.findFirst({
    where: { id: trackedPlaylistId, userId },
  });
  if (!playlist) throw new Error("Playlist niet gevonden");

  const existing = await prisma.groupPlaylist.findUnique({
    where: {
      groupId_trackedPlaylistId: { groupId, trackedPlaylistId },
    },
  });
  if (existing) return existing;

  return prisma.groupPlaylist.create({
    data: { groupId, trackedPlaylistId },
  });
}

export async function removePlaylistFromGroup(
  userId: string,
  groupId: string,
  trackedPlaylistId: string
) {
  const group = await prisma.playlistGroup.findFirst({
    where: { id: groupId, userId },
  });
  if (!group) throw new Error("Groep niet gevonden");

  await prisma.groupPlaylist.deleteMany({
    where: {
      groupId,
      trackedPlaylistId,
    },
  });
}
