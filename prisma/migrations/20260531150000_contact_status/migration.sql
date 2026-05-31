-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('warm', 'do_not_contact', 'no_recent_contact', 'cold');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "contactStatus" "ContactStatus";

-- CreateIndex
CREATE INDEX "contacts_userId_contactStatus_idx" ON "contacts"("userId", "contactStatus");
