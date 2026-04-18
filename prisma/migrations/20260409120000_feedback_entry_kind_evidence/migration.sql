-- CreateEnum
CREATE TYPE "FeedbackEntryKind" AS ENUM ('comment', 'sync', 'play');

-- AlterTable
ALTER TABLE "feedback_entries" ADD COLUMN "entryKind" "FeedbackEntryKind" NOT NULL DEFAULT 'comment';
ALTER TABLE "feedback_entries" ADD COLUMN "evidenceUrl" TEXT;
ALTER TABLE "feedback_entries" ADD COLUMN "evidencePreviewTitle" TEXT;
ALTER TABLE "feedback_entries" ADD COLUMN "evidencePreviewImage" TEXT;
ALTER TABLE "feedback_entries" ADD COLUMN "evidencePreviewSiteName" TEXT;

-- CreateIndex
CREATE INDEX "feedback_entries_userId_entryKind_idx" ON "feedback_entries"("userId", "entryKind");
