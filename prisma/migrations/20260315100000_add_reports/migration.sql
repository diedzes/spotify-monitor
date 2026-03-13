-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_sources" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "trackedPlaylistId" TEXT,
    "playlistGroupId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "include" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "report_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_results" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsJson" TEXT NOT NULL,

    CONSTRAINT "report_results_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_trackedPlaylistId_fkey" FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_playlistGroupId_fkey" FOREIGN KEY ("playlistGroupId") REFERENCES "playlist_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_results" ADD CONSTRAINT "report_results_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
