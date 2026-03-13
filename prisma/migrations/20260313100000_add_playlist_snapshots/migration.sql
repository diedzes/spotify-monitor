-- CreateTable
CREATE TABLE "playlist_snapshots" (
    "id" TEXT NOT NULL,
    "trackedPlaylistId" TEXT NOT NULL,
    "spotifySnapshotId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshot_tracks" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "spotifyTrackId" TEXT NOT NULL,
    "spotifyUri" TEXT NOT NULL,
    "spotifyUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistsJson" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "snapshot_tracks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "playlist_snapshots" ADD CONSTRAINT "playlist_snapshots_trackedPlaylistId_fkey" FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_tracks" ADD CONSTRAINT "snapshot_tracks_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "playlist_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
