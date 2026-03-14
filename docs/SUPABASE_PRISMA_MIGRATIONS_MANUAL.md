# Supabase: `_prisma_migrations` handmatig vullen

Alle tabellen bestaan al in Supabase (via de andere docs), maar Prisma weet dat nog niet. Deze pagina zorgt ervoor dat Prisma **denkt** dat alle bestaande migraties al zijn toegepast, door de tabel `_prisma_migrations` met de juiste checksums te vullen.

Daarna kan `prisma migrate deploy` op Vercel (en eventueel lokaal) draaien zonder tabellen opnieuw te willen aanmaken. Nieuwe migraties werken dan automatisch.

> ⚠️ **Alleen doen als de tabellen al bestaan**  
> Gebruik dit alleen als je de SQL uit `SUPABASE_CORE_TABLES.md` en `SUPABASE_REPORTS_MIGRATION.md` al hebt uitgevoerd en de app nu werkt, maar Prisma-migraties nog ontbreken.

---

## Stap 1 – Maak de `_prisma_migrations`-tabel aan

Ga in Supabase naar jouw project → **SQL Editor** → **New query** en plak:

```sql
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id                  VARCHAR(36) PRIMARY KEY NOT NULL,
  checksum            VARCHAR(64) NOT NULL,
  finished_at         TIMESTAMPTZ,
  migration_name      VARCHAR(255) NOT NULL,
  logs                TEXT,
  rolled_back_at      TIMESTAMPTZ,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
);
```

Klik op **Run**. Als de tabel al bestaat, is dat geen probleem.

---

## Stap 2 – Markeer de 5 bestaande migraties als “toegepast”

In dezelfde SQL Editor, voer nu deze query uit om 5 rijen toe te voegen aan `_prisma_migrations`. De `checksum`-waarden zijn de SHA256-hashes van jouw huidige `migration.sql`-bestanden.

```sql
INSERT INTO "_prisma_migrations" (
  id,
  checksum,
  finished_at,
  migration_name,
  logs,
  rolled_back_at,
  started_at,
  applied_steps_count
)
VALUES
  -- 20260312094430_init
  (
    '30D25BF4-F03A-400C-ABAE-1CA198BC9530',
    '003d91e6581bb91565f057d97467b4642afe25d03f8c0b78d54aaffa312dc535',
    now(),
    '20260312094430_init',
    '',
    NULL,
    now(),
    1
  ),
  -- 20260312100000_add_sessions
  (
    '31D697ED-DF73-4AFF-BB1C-55D11F95093A',
    '8fc2980d001b558020d4683bda80194c43ee6f68d1a36f540746439a5c667cea',
    now(),
    '20260312100000_add_sessions',
    '',
    NULL,
    now(),
    1
  ),
  -- 20260313100000_add_playlist_snapshots
  (
    'D9E4306F-C7F6-4803-8D6E-C8CD1147BDF3',
    '242d4e827d35306162b8425f4b5a31dcc9c541a86fd62032970fa87c31888a9c',
    now(),
    '20260313100000_add_playlist_snapshots',
    '',
    NULL,
    now(),
    1
  ),
  -- 20260314100000_add_playlist_groups
  (
    '33074890-3B39-4477-8544-BC0D0001B3C1',
    '7bbf1423c0f570d7fd56be8c2de53b33eda9e401a63885f04fbca8743df97456',
    now(),
    '20260314100000_add_playlist_groups',
    '',
    NULL,
    now(),
    1
  ),
  -- 20260315100000_add_reports
  (
    '0F8D427F-F5F5-4A82-BE94-2EAC879ACCE3',
    '6d99e4386105d6669c37d2fba0be2b0eef44fe17e856809edee07fd839d30559',
    now(),
    '20260315100000_add_reports',
    '',
    NULL,
    now(),
    1
  )
ON CONFLICT (migration_name) DO NOTHING;
```

Klik weer op **Run**.

Daarmee vertel je Prisma: “deze 5 migraties zijn al succesvol uitgevoerd”.

---

## Stap 3 – Controle (optioneel lokaal)

Als je lokale machine Supabase goed kan bereiken, kun je lokaal controleren:

```bash
cd /Users/diederikvanzessen/Documents/spotify-monitor
npx prisma migrate deploy
```

Als alles klopt, zou Prisma melden dat er geen openstaande migraties zijn (of ze direct “succeeded” melden) en niet meer proberen tabellen opnieuw aan te maken.

Lukt dit lokaal niet vanwege netwerk (P1001), dan kun je deze stap overslaan; het belangrijkste is dat Vercel met dezelfde `DATABASE_URL` draait. Bij de volgende build op Vercel zou `prisma migrate deploy` dan ook geen bestaande tabellen meer willen aanmaken.

---

## Stap 4 – Vercel build (met `prisma migrate deploy`)

Zorg dat op **Vercel** de `DATABASE_URL` exact dezelfde is als in je `.env` lokaal.

Omdat het build-script `prisma migrate deploy && next build` draait:

1. Ziet Prisma op Vercel nu dat alle bestaande migraties al zijn toegepast (via `_prisma_migrations`).
2. Voert Prisma alleen **nieuwe** migraties uit die je later toevoegt.

Nieuwe schema-wijzigingen doe je dan gewoon met:

```bash
npx prisma migrate dev --name beschrijving
```

Commit de nieuwe migratie-map in `prisma/migrations/` en push naar GitHub; Vercel voert die migratie dan automatisch uit bij de volgende deploy.

---

## Uitbreiding: kolom `editedRowsJson` (report_results)

Als je later de migratie **20260316100000_add_edited_rows_json** hebt toegevoegd (bewerkbare chart-resultaten), voer dan in Supabase **SQL Editor** uit:

```sql
ALTER TABLE "report_results" ADD COLUMN IF NOT EXISTS "editedRowsJson" TEXT;
```

Als je `_prisma_migrations` handmatig bijhoudt, voeg dan ook een rij toe voor deze migratie (zonder `ON CONFLICT`):

```sql
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'ccb675bf726bd672b1c8e2de3f00a63ed542767cff9f1aa222102f7648c6308d',
  now(),
  '20260316100000_add_edited_rows_json',
  '',
  NULL,
  now(),
  1
);
```

