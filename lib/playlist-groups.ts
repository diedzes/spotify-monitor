/**
 * Playlist groups: groepen van tracked playlists per gebruiker.
 */

import { prisma } from "@/lib/db";
import { normalizeGroupColor } from "@/lib/group-color";

export async function createPlaylistGroup(
  userId: string,
  name: string,
  description?: string | null,
  color?: string | null
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  return prisma.playlistGroup.create({
    data: {
      userId,
      name: trimmed,
      description: description?.trim() || null,
      ...(color != null && String(color).trim() !== ""
        ? { color: normalizeGroupColor(color) }
        : {}),
    },
  });
}

export async function updatePlaylistGroupForUser(
  userId: string,
  groupId: string,
  patch: { name?: string; description?: string | null; color?: string }
) {
  const existing = await prisma.playlistGroup.findFirst({
    where: { id: groupId, userId },
  });
  if (!existing) throw new Error("Group not found");

  const data: { name?: string; description?: string | null; color?: string } = {};
  if (patch.name !== undefined) {
    const t = patch.name.trim();
    if (!t) throw new Error("Name cannot be empty");
    data.name = t;
  }
  if (patch.description !== undefined) {
    data.description = patch.description === null ? null : patch.description.trim() || null;
  }
  if (patch.color !== undefined) {
    data.color = normalizeGroupColor(patch.color);
  }
  if (Object.keys(data).length === 0) return existing;

  return prisma.playlistGroup.update({
    where: { id: groupId },
    data,
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
          trackedPlaylist: {
            include: { _count: { select: { snapshots: true } } },
          },
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
  if (!group) throw new Error("Group not found");

  const playlist = await prisma.trackedPlaylist.findFirst({
    where: { id: trackedPlaylistId, userId },
  });
  if (!playlist) throw new Error("Playlist not found");

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
  if (!group) throw new Error("Group not found");

  await prisma.groupPlaylist.deleteMany({
    where: {
      groupId,
      trackedPlaylistId,
    },
  });
}
