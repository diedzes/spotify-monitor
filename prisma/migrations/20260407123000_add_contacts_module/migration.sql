-- Create organizations table
CREATE TABLE "organizations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- Create contacts table
CREATE TABLE "contacts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "organizationId" TEXT,
  "organizationNameSnapshot" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "role" TEXT,
  "notes" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- Indexes for user-scoped lookups and search
CREATE INDEX "organizations_userId_name_idx" ON "organizations"("userId", "name");
CREATE INDEX "contacts_userId_fullName_idx" ON "contacts"("userId", "fullName");
CREATE INDEX "contacts_userId_email_idx" ON "contacts"("userId", "email");
CREATE INDEX "contacts_userId_organizationNameSnapshot_idx" ON "contacts"("userId", "organizationNameSnapshot");
CREATE INDEX "contacts_organizationId_idx" ON "contacts"("organizationId");

-- FK contact -> organization
ALTER TABLE "contacts"
ADD CONSTRAINT "contacts_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
