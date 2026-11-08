# Spotify Monitor — Claude Code overdracht

Dit bestand is de projectmemory voor Claude Code. Lees het volledig voordat je code wijzigt.

**Product:** interne webapp van Sport Sounds / Shoot om Spotify-playlists te volgen, hits te detecteren, contacten en feedback vast te leggen, clientrapporten te maken, mails te draften en radio-achtige schedulers te genereren.

**Repo:** https://github.com/diedzes/spotify-monitor  
**Productie:** https://spotify-monitor-ten.vercel.app (Vercel, branch `main`)  
**Eigenaar:** Diederik van Zessen. UI-copy is Engels; interne docs en deze overdracht zijn Nederlands.

**Huidige staat (8 sep 2026):** `main` staat op commit `e02b989` — contacts kunnen als curator aan tracked playlists gekoppeld worden. Geen geautomatiseerde tests. Geen GitHub Actions.

---

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind 4
- Prisma 6 als **runtime-ORM alleen** (queries + generated client)
- PostgreSQL op **Supabase** (pooler poort 6543, `?pgbouncer=true`)
- Custom Spotify OAuth (geen NextAuth/Auth.js in gebruik, ondanks env-namen)
- Deploy: Vercel, build = `prisma generate && next build` — **geen migraties in de build**
- Pad-alias: `@/*` → projectroot

Er is **geen** `middleware.ts`. Next.js 16 gebruikt hier `proxy.ts` (cache-headers op `/playlists`, debuglog op een oude callback-path).

---

## Commands

```bash
npm install
npx prisma generate          # na clone en na schema-wijziging
npm run dev                  # http://localhost:3000
npm run build
npm run lint
npm run db:generate          # prisma generate
npm run db:migrate:apply     # supabase db push && prisma generate  (lokaal, door gebruiker)
npm run db:studio
```

Eerste keer database: `supabase login` daarna `supabase link --project-ref <PROJECT_REF>`.

Gebruiker voert `db:migrate:apply`, commits en Vercel-deploys zelf uit, tenzij hij expliciet anders vraagt.

---

## Directory map

| Pad | Rol |
|-----|-----|
| `app/` | Pages + Route Handlers. Data-routes: `export const dynamic = "force-dynamic"` |
| `app/api/` | REST-achtige API, sessie via cookie/`X-Spotify-Session` |
| `components/` | Client UI (header, hitlist, feedback, reports, dialogs) |
| `lib/` | Domeinlogica — **hier horen nieuwe features, niet in pages** |
| `prisma/schema.prisma` | ORM-model; tabelnamen via `@@map("snake_case")` |
| `prisma/migrations/` | **historisch**. Niet meer gebruiken om te migreren |
| `supabase/migrations/` | **enige bron voor nieuwe schemawijzigingen** |
| `scripts/` | onderhoud (backup, inventory, user-id migrate, contact-role backfill) |
| `docs/` | deels **verouderd** (zie onder) |

---

## Domein (wat de app doet)

Alle data is gescoped op `userId` = Spotify user id uit de sessie.

**Playlists** (`/playlists`)  
Tracked playlists syncen met Spotify. Snapshot + tracks bij wijziging van `snapshotId`. Bulk add/delete, bulk exclude-from-hitlist, import via Spotify-profiel-URL of user id (`lib/spotify-user-id.ts`, `lib/spotify-profile-playlists.ts`). Sync: `lib/sync-playlists.ts` + `lib/spotify-api.ts`. Wekelijkse cron: `GET /api/cron/sync-all`.

**Groups** (`/groups`)  
Playlists groeperen. Precies één groep per user met `isMainGroup=true` (Hitlist-bron, defaultnaam `Hoofdplaylist`). Zie `lib/main-playlist-group.ts`. Groep `Owned` wordt op het dashboard gebruikt om eigen playlists uit hitlist-previews te filteren.

**Hitlist** (`/hitlist`)  
Welke tracks uit de hoofdgroep ook op andere tracked playlists staan. Match op Spotify track-id, plus fallback op genormaliseerde (eerste artiest + titel) voor regionale releases. `excludeFromHitlist` sluit match-kant uit, niet de bronnen in de hoofdgroep. Rebuild: `lib/hitlist.ts`.

**Reports** (`/reports`)  
Gewogen chart uit playlists/groepen (`lib/chart-builder.ts`). Resultaten: `rowsJson` (origineel) + optioneel `editedRowsJson`. Export CSV of Spotify-playlist.

**Scheduler** (`/scheduler`)  
Clock- of ratio-mode playlistgeneratie met rules (artist maximum/separation, title separation), overlap t.o.v. een reference, lock/replace/reorder van runs. Motor: `lib/scheduler-engine.ts`. Conflictteksten in de run-rows zijn Nederlands.

**Contacts + organizations**  
CRM-achtig. Status: `warm` / `do_not_contact` / `no_recent_contact` / `cold`. Many-to-many curator-koppeling via `contact_playlists`. CSV-export: `lib/contacts-csv.ts`.

**Feedback**  
Batches van tracks, entries met kind `comment` | `sync` | `play`. Sync heeft evidence-URL + Open Graph preview. Play (stadium) heeft wedstrijdmetadata via football-data.org (`FOOTBALL_DATA_TOKEN`, `lib/football-data.ts`).

**Client track report**  
Per Spotify-track: playlists + feedback (Stadium Play / Media Sync), printbare/selecteerbare export, geschiedenis van wat al verstuurd is. `lib/track-client-report.ts`.

**Mail Drafter** (`/mail-drafter`)  
Client-side templates: `[Voornaam]`, `[Achternaam]`, `[Organisatie]`, plus geselecteerde Spotify- of FatDrop-tracks.

**FatDrop** (`/fatdrop`)  
Promo-links (`promo_tracks`) plakken en optioneel koppelen aan een Spotify-track. Die URL’s landen in Mail Drafter en reports.

---

## Auth en sessie (kritiek)

Custom OAuth in `lib/spotify-auth.ts`.

- Login: `/api/auth/spotify/login` → callback `/api/auth/spotify/callback`
- Session-rij in `sessions` (tokens + Spotify user). Cookie `spotify_session` = **signed session-id** (httpOnly). Tweede cookie `spotify_session_s` is client-leesbaar voor de header-fallback.
- Access token wordt ~5 min voor expiry vernieuwd. Bij Spotify `invalid_grant` worden refresh tokens van die user gewist → opnieuw inloggen.
- **Driedubbele sessie-lookup** (niet vereenvoudigen zonder reden):
  1. httpOnly cookie
  2. query `?sid=` (signed id; na login redirect naar `/dashboard?sid=...`)
  3. header `X-Spotify-Session` (client leest `spotify_session_s` of `localStorage.spotify_sid`)
- `StoreSessionFromUrl` zet `sid` in localStorage en haalt het uit de URL. Homepage wist de opgeslagen sid (logout).
- Client pages dupliceren vaak `getSessionHeaders()` — bestaand patroon; bij nieuwe client-fetches hetzelfde doen (`credentials: "include"` + header).
- Server pages: `getSpotifySession()`, anders `getSessionFromSignedValue(sid)` uit searchParams, anders `redirect("/")`.

Localhost-sessies staan **niet** in de productie-database. Inloggen en data bekijken altijd op dezelfde URL.

---

## Database migrations (hard rule)

**Nieuwe schemawijzigingen gaan via Supabase SQL, niet via Prisma Migrate.**

1. Nieuw bestand `supabase/migrations/YYYYMMDDHHMMSS_beschrijving.sql` — idempotent (`IF NOT EXISTS`, echte tabelnaam uit Prisma `@@map()`, dus `report_results` niet `ReportResult`).
2. `prisma/schema.prisma` gelijk trekken (types, relaties, indexes).
3. Appcode/types aanpassen.
4. **Stop en zeg tegen de gebruiker** lokaal te draaien: `npm run db:migrate:apply` (eerste keer: `supabase login` + `supabase link`).
5. Gebruiker commit + push. Vercel bouwt zonder migrate.

Nooit: `prisma migrate dev`, `prisma migrate deploy`, of migrate in de Vercel build. `prisma/migrations/` is legacy.

---

## Environment variables

Lokaal: `.env` of `.env.local` (gitignored). Zelfde namen op Vercel (Production én Preview bij voorkeur identiek).

| Variabele | Doel |
|-----------|------|
| `DATABASE_URL` | Supabase **pooler** (poort 6543, `?pgbouncer=true`) |
| `AUTH_SPOTIFY_ID` of `SPOTIFY_CLIENT_ID` | Spotify app |
| `AUTH_SPOTIFY_SECRET` of `SPOTIFY_CLIENT_SECRET` | Spotify secret |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` / `BETTER_AUTH_SECRET` | HMAC voor session-cookie |
| `NEXTAUTH_URL` | Stabiele basis-URL, op Vercel de productie-URL |
| `SPOTIFY_REDIRECT_URI` of `AUTH_SPOTIFY_REDIRECT_URI` | Volledige callback-URL (aanbevolen op Vercel) |
| `CRON_SECRET` | Cron-auth; zonder deze var weigert `/api/cron/sync-all` |
| `FOOTBALL_DATA_TOKEN` | Stadium Play-wedstrijden (football-data.org) |
| `INTEGRATION_SECRET` + `INTEGRATION_SPOTIFY_USER_ID` | `GET /api/integration/tracks` voor het Sport Sounds-beschikbaarheidsbord; vast aan één Spotify-account (`lib/integration-tracks.ts`) |

Spotify Dashboard Redirect URI moet **exact** matchen, o.a. `https://spotify-monitor-ten.vercel.app/api/auth/spotify/callback`.

`FOOTBALL_DATA_TOKEN` staat niet in de README; wel nodig voor feedback “Stadium Play”.

---

## Cron / sync

`GET /api/cron/sync-all` synct alle tracked playlists van users met geldige refresh token en rebuild de hitlist.

Auth: `Authorization: Bearer <CRON_SECRET>` of `?secret=`.  
`vercel.json` is leeg: Vercel Cron stuurt geen secret mee. Gebruik een **externe** cron (cron-job.org e.d.) op de productie-URL.

Lange jobs: `maxDuration = 300` op die route. Playlist-sync is gevoelig voor timeouts; niet lichtzinnig serialiseren of extra Spotify-calls toevoegen in de hot path.

---

## Codeconventies

- Wijzig alleen wat de taak nodig heeft. Geen drive-by refactors, geen extra markdown tenzij gevraagd.
- Domeinlogica in `lib/`, dunne `app/api/*/route.ts`. Nieuwe UI in bestaande pagina’s/componenten, niet een parallelle stack.
- Prisma-queries altijd filteren op `userId` van de sessie. Geen data van andere Spotify-users lekken.
- Toasts: `sonner`. Bevestigen van destructieve acties: `components/ConfirmDialog.tsx`.
- Lijstfilters horen in de URL (query params), niet alleen in component-state.
- `artistsJson` is een JSON-string van `{ name, id? }[]`. Parsen via bestaande helpers (`formatArtistsLabel`, etc.).
- Spotify-tracks zonder id (local files) krijgen id `local-{position}` — geen open.spotify.com-link.
- UI-strings voor gebruikers: **Engels**. Scheduler conflict-details in run-JSON zijn historisch NL; niet mixen in nieuwe user-facing copy.
- Geen secrets, `.env*`, of `.claude/settings.local.json` committen.
- Commits alleen als de gebruiker het vraagt. Geen force-push, geen `--no-verify`.

Verifieer UI-wijzigingen in de browser (of `npm run dev` + de flow doorklikken). Een screenshot is geen verificatie.

---

## Onderhoudsscripts

Allen Prisma tegen `DATABASE_URL`. Destructieve scripts hebben dry-run; `--apply` is nodig om te schrijven.

| Script | Doel |
|--------|------|
| `npm run db:backup` | JSON-dump naar `backups/` (gitignored) |
| `npm run db:inventory` | tellingen |
| `npm run db:export-playlists` | followed playlists export |
| `npm run db:backfill-contact-roles` / `:apply` | rollen backfill |
| `npm run db:migrate-user` / `:apply` | alle rijen van oud → nieuw Spotify user id (teamaccount) |

`scripts/migrate-spotify-user-id.sql` is de SQL-variant van die user-id-migratie.

---

## Verouderde docs — niet volgen

- `docs/SUPABASE_PRISMA_MIGRATIONS_MANUAL.md` — beschrijft `prisma migrate deploy` op Vercel. **Achterhaald.** Huidige waarheid: README “Database Migrations Strategy” + deze file.
- `docs/SUPABASE_REPORTS_MIGRATION.md` — eenmalige handmatige SQL van maart 2026; niet het migratieproces.
- `.cursor/rules/` — Cursor-restant; zelfde migratieregel staat in `.claude/rules/`.

README is leidend voor env, Vercel-sessieproblemen en cron.

---

## Bekende valkuilen

- Preview vs production: andere `DATABASE_URL` of andere inlog-URL → “sessie hoort bij andere omgeving”.
- Na env-wijziging op Vercel: **redeploy**.
- Hitlist is pas betrouwbaar na sync + rebuild; lege laatste snapshots worden overgeslagen ten gunste van oudere met tracks.
- Client Credentials (`lib/spotify-client-credentials.ts`) is app-only (geen user playlists wijzigen); user-token uit de sessie is nodig voor private data en writes.
- `.claude/settings.local.json` en `.claude/worktrees/` zijn lokaal; niet committen.

---

## Werken in Claude Code

1. Open deze repo-root (niet een worktree tenzij bewust).
2. Dit `CLAUDE.md` wordt automatisch geladen.
3. Kleine, reviewbare diffs. Schema → SQL-migratie + Prisma + code, daarna user laten `db:migrate:apply` draaien.
4. Na afloop: wat veranderde, wat de user lokaal moet doen, wat niet geverifieerd is.
