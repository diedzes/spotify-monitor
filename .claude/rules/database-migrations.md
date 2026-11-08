---
paths: supabase/migrations/**/*.sql, prisma/schema.prisma
---

# Database migrations (Supabase SQL)

Prisma Migrate wordt in dit project **niet** gebruikt voor schemawijzigingen. Productie-schema gaat via Supabase.

Wanneer je tabellen/kolommen/indexes toevoegt of wijzigt:

1. Nieuw of bijgewerkt bestand in `supabase/migrations/YYYYMMDDHHMMSS_beschrijving.sql` met idempotente SQL (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). Gebruik de echte tabelnaam uit Prisma `@@map()` (bijv. `report_results`, niet `ReportResult`).
2. `prisma/schema.prisma` bijwerken zodat het model overeenkomt (types zoals `Json?`, `String`, enums, relaties, indexes).
3. Appcode aanpassen die de nieuwe kolommen gebruikt.
4. **Niet zelf `supabase db push` of `prisma migrate deploy` draaien** tenzij de gebruiker dat vraagt. Zeg tegen de gebruiker lokaal: `npm run db:migrate:apply` (of `supabase db push` daarna `npx prisma generate`). Eerste keer: `supabase login` en `supabase link --project-ref <PROJECT_REF>`.
5. Herinner de gebruiker te committen en te deployen. Geen migrate-stap in de Vercel build.

Nooit `prisma migrate dev` of `prisma migrate deploy`. `prisma/migrations/` is legacy.

Volledige context: `CLAUDE.md` en README-sectie "Database Migrations Strategy".
