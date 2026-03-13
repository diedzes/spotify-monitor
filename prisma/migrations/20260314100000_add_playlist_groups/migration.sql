-- CreateTable
CREATE TABLE "playlist_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlist_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_playlists" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "trackedPlaylistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "playlist_groups_userId_name_key" ON "playlist_groups"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "group_playlists_groupId_trackedPlaylistId_key" ON "group_playlists"("groupId", "trackedPlaylistId");

-- AddForeignKey
ALTER TABLE "group_playlists" ADD CONSTRAINT "group_playlists_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "playlist_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_playlists" ADD CONSTRAINT "group_playlists_trackedPlaylistId_fkey" FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
