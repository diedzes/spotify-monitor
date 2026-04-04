-- AlterTable
ALTER TABLE "tracked_playlists" ADD COLUMN "isMainPlaylist" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "hitlist_matches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotifyTrackId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistsJson" TEXT NOT NULL,
    "mainTrackedPlaylistId" TEXT NOT NULL,
    "matchedTrackedPlaylistId" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hitlist_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hitlist_matches_userId_spotifyTrackId_mainTrackedPlaylistId_matchedTrackedPlaylistId_key" ON "hitlist_matches"("userId", "spotifyTrackId", "mainTrackedPlaylistId", "matchedTrackedPlaylistId");

-- CreateIndex
CREATE INDEX "hitlist_matches_userId_isActive_idx" ON "hitlist_matches"("userId", "isActive");

-- CreateIndex
CREATE INDEX "hitlist_matches_userId_removedAt_idx" ON "hitlist_matches"("userId", "removedAt");

-- AddForeignKey
ALTER TABLE "hitlist_matches" ADD CONSTRAINT "hitlist_matches_mainTrackedPlaylistId_fkey" FOREIGN KEY ("mainTrackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hitlist_matches" ADD CONSTRAINT "hitlist_matches_matchedTrackedPlaylistId_fkey" FOREIGN KEY ("matchedTrackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
