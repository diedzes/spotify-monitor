ALTER TABLE "organizations"
ADD COLUMN "type" TEXT;

CREATE INDEX "organizations_userId_type_idx" ON "organizations"("userId", "type");
