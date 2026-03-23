-- CreateEnum
CREATE TYPE "SchedulerMode" AS ENUM ('clock', 'ratio');

-- CreateEnum
CREATE TYPE "SchedulerSelectionMode" AS ENUM ('random', 'rank_preferred');

-- CreateEnum
CREATE TYPE "SchedulerRuleType" AS ENUM ('artist_maximum', 'artist_separation', 'title_separation');

-- CreateEnum
CREATE TYPE "SchedulerRunStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateTable
CREATE TABLE "schedulers" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "mode" "SchedulerMode" NOT NULL,
  "targetTrackCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "schedulers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_sources" (
  "id" TEXT NOT NULL,
  "schedulerId" TEXT NOT NULL,
  "trackedPlaylistId" TEXT,
  "playlistGroupId" TEXT,
  "include" BOOLEAN NOT NULL DEFAULT true,
  "weight" DOUBLE PRECISION,
  "selectionMode" "SchedulerSelectionMode" NOT NULL DEFAULT 'rank_preferred',
  "rankBiasStrength" INTEGER,

  CONSTRAINT "scheduler_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_clock_slots" (
  "id" TEXT NOT NULL,
  "schedulerId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "trackedPlaylistId" TEXT,
  "playlistGroupId" TEXT,

  CONSTRAINT "scheduler_clock_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_rules" (
  "id" TEXT NOT NULL,
  "schedulerId" TEXT NOT NULL,
  "ruleType" "SchedulerRuleType" NOT NULL,
  "valueInt" INTEGER,

  CONSTRAINT "scheduler_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_runs" (
  "id" TEXT NOT NULL,
  "schedulerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resultJson" TEXT,
  "status" "SchedulerRunStatus" NOT NULL,

  CONSTRAINT "scheduler_runs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "scheduler_sources"
ADD CONSTRAINT "scheduler_sources_schedulerId_fkey"
FOREIGN KEY ("schedulerId") REFERENCES "schedulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_sources"
ADD CONSTRAINT "scheduler_sources_trackedPlaylistId_fkey"
FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_sources"
ADD CONSTRAINT "scheduler_sources_playlistGroupId_fkey"
FOREIGN KEY ("playlistGroupId") REFERENCES "playlist_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_clock_slots"
ADD CONSTRAINT "scheduler_clock_slots_schedulerId_fkey"
FOREIGN KEY ("schedulerId") REFERENCES "schedulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_clock_slots"
ADD CONSTRAINT "scheduler_clock_slots_trackedPlaylistId_fkey"
FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_clock_slots"
ADD CONSTRAINT "scheduler_clock_slots_playlistGroupId_fkey"
FOREIGN KEY ("playlistGroupId") REFERENCES "playlist_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_rules"
ADD CONSTRAINT "scheduler_rules_schedulerId_fkey"
FOREIGN KEY ("schedulerId") REFERENCES "schedulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_runs"
ADD CONSTRAINT "scheduler_runs_schedulerId_fkey"
FOREIGN KEY ("schedulerId") REFERENCES "schedulers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

