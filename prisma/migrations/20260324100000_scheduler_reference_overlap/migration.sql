-- CreateTable
CREATE TABLE "scheduler_references" (
    "id" TEXT NOT NULL,
    "schedulerId" TEXT NOT NULL,
    "rowsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_overlap_preferences" (
    "id" TEXT NOT NULL,
    "schedulerId" TEXT NOT NULL,
    "trackedPlaylistId" TEXT,
    "playlistGroupId" TEXT,
    "overlapPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scheduler_overlap_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_references_schedulerId_key" ON "scheduler_references"("schedulerId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_overlap_preferences_schedulerId_trackedPlaylistId_key" ON "scheduler_overlap_preferences"("schedulerId", "trackedPlaylistId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_overlap_preferences_schedulerId_playlistGroupId_key" ON "scheduler_overlap_preferences"("schedulerId", "playlistGroupId");

-- AddForeignKey
ALTER TABLE "scheduler_references" ADD CONSTRAINT "scheduler_references_schedulerId_fkey" FOREIGN KEY ("schedulerId") REFERENCES "schedulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_overlap_preferences" ADD CONSTRAINT "scheduler_overlap_preferences_schedulerId_fkey" FOREIGN KEY ("schedulerId") REFERENCES "schedulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_overlap_preferences" ADD CONSTRAINT "scheduler_overlap_preferences_trackedPlaylistId_fkey" FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_overlap_preferences" ADD CONSTRAINT "scheduler_overlap_preferences_playlistGroupId_fkey" FOREIGN KEY ("playlistGroupId") REFERENCES "playlist_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
