-- AlterTable
ALTER TABLE "scheduler_clock_slots" ADD COLUMN "spotifyTrackId" TEXT;

-- De-duplicate per (schedulerId, position) before unique constraint
DELETE FROM "scheduler_clock_slots" a
USING "scheduler_clock_slots" b
WHERE a."schedulerId" = b."schedulerId"
  AND a."position" = b."position"
  AND a."id" < b."id";

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_clock_slots_schedulerId_position_key"
ON "scheduler_clock_slots"("schedulerId", "position");

