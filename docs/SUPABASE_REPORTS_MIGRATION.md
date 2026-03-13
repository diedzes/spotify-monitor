# Supabase: Reports-tabellen toevoegen

Voer onderstaande SQL **één keer** uit in Supabase om de reports-tabellen aan te maken.

**Waar:** Supabase → jouw project → **SQL Editor** → New query → plak de SQL → Run.

---

## Stap 1: Tabel `reports`

```sql
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
```

---

## Stap 2: Tabel `report_sources`

```sql
CREATE TABLE "report_sources" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "trackedPlaylistId" TEXT,
    "playlistGroupId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "include" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "report_sources_pkey" PRIMARY KEY ("id")
);
```

---

## Stap 3: Tabel `report_results`

```sql
CREATE TABLE "report_results" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsJson" TEXT NOT NULL,

    CONSTRAINT "report_results_pkey" PRIMARY KEY ("id")
);
```

---

## Stap 4: Foreign keys

**Waar:** dezelfde plek als stappen 1–3: Supabase → **SQL Editor** → New query → plak onderstaande SQL → Run.
Voer dit uit ná de tabellen (stappen 1–3). Afhankelijkheden: bestaande tabellen `reports`, `tracked_playlists`, `playlist_groups`.

```sql
ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_trackedPlaylistId_fkey" FOREIGN KEY ("trackedPlaylistId") REFERENCES "tracked_playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_sources" ADD CONSTRAINT "report_sources_playlistGroupId_fkey" FOREIGN KEY ("playlistGroupId") REFERENCES "playlist_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_results" ADD CONSTRAINT "report_results_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## Alles in één keer

Je kunt ook de volledige migratie in één query uitvoeren (zelfde inhoud als in `prisma/migrations/20260315100000_add_reports/migration.sql`):

```sql
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
```

Na het uitvoeren zouden de tabellen **reports**, **report_sources** en **report_results** zichtbaar moeten zijn in de Table Editor.
