This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

Create a `.env` or `.env.local` file in the project root (voor lokaal development volstaat `.env.local`). Required variables:

- **`DATABASE_URL`** – PostgreSQL connection string voor runtime (Next.js/Prisma queries). Lokaal en op Vercel: gebruik de **pooler**-URL (poort 6543) voor Supabase.
- **`AUTH_SPOTIFY_ID`** of **`SPOTIFY_CLIENT_ID`** – Spotify app Client ID
- **`AUTH_SPOTIFY_SECRET`** of **`SPOTIFY_CLIENT_SECRET`** – Spotify app Client Secret
- **`AUTH_SECRET`**, **`NEXTAUTH_SECRET`** of **`BETTER_AUTH_SECRET`** – Geheim voor cookie/sessie-encryptie
- **`NEXTAUTH_URL`** (optioneel) – Base URL van de app, bijv. `http://localhost:3000`. **Op Vercel:** zet dit op je productie-URL (bijv. `https://spotify-monitor-ten.vercel.app`) zodat de Spotify redirect URI niet per deployment wisselt.
- **`SPOTIFY_REDIRECT_URI`** of **`AUTH_SPOTIFY_REDIRECT_URI`** (optioneel) – Volledige callback-URL voor Spotify (bijv. `https://spotify-monitor-ten.vercel.app/api/auth/spotify/callback`). Overschrijft de afgeleide URL; handig als inloggen op Vercel “plotseling” faalt.

**Spotify “Inloggen mislukt” op Vercel:** Voeg in het [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) bij jouw app → Settings → **Redirect URIs** exact de URL toe die de app toont (bijv. `https://jouw-project.vercel.app/api/auth/spotify/callback`). Zet op Vercel **NEXTAUTH_URL** of **SPOTIFY_REDIRECT_URI** op diezelfde basis-URL/callback zodat de waarde stabiel blijft.

## Database op Supabase (stap voor stap)

1. **Account en project**
   - Ga naar [supabase.com](https://supabase.com) en log in (of maak een account).
   - Klik op **New project**.
   - Kies een **Organization** (of maak er een).
   - Vul in:
     - **Name**: bijv. `spotify-monitor`
     - **Database password**: kies een sterk wachtwoord en **sla dit op** (je hebt het nodig voor de connection string).
     - **Region**: kies het dichtst bij jou (bijv. West EU).
   - Klik op **Create new project** en wacht tot het project klaar is (1–2 min).

2. **Connection string ophalen**
   - In het linkermenu: **Project Settings** (tandwiel) → **Database**.
   - Scroll naar **Connection string**; kies **URI**.
   - Gebruik de **pooler**-URL (host `pooler.supabase.com`, poort **6543**) voor `DATABASE_URL`. Vervang **`[YOUR-PASSWORD]`** door je database-wachtwoord.

3. **Lokaal (`.env` of `.env.local`)**
   - Zet **`DATABASE_URL`** op de pooler-URL, bijvoorbeeld:
     ```env
     DATABASE_URL="postgresql://postgres.[ref]:WACHTWOORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
     ```
   - Schema-wijzigingen worden niet meer via Prisma Migrate gedaan; zie **Database Migrations Strategy** hieronder.

4. **Op Vercel**
   - Vercel → je project → **Settings** → **Environment Variables**.
   - Zet **`DATABASE_URL`** = de pooler-URL (poort 6543, `?pgbouncer=true`). Kies Environment **Production** (en eventueel Preview).
   - **Build:** De build command moet **geen** database-migraties uitvoeren. Gebruik de standaard build (zie hieronder onder *Vercel build*).

**Tip:** Je kunt dezelfde Supabase-database voor lokaal én Vercel gebruiken.

### Sessies testen: één keer inloggen op de live app (Vercel)

De tabel `sessions` in Supabase wordt alleen gevuld wanneer je **op de live Vercel-URL** inlogt. Als je alleen op `localhost` inlogt, draait de callback lokaal en schrijft die naar je lokale (of geconfigureerde) database. Om te controleren of sessies op Supabase worden aangemaakt:

1. **Open je app op Vercel**  
   Ga in je browser naar de echte productie-URL van je app, bijvoorbeeld:
   - `https://spotify-monitor-ten.vercel.app`  
   of wat jouw Vercel-project ook is (te vinden onder **Vercel → je project → Domains**).  
   Gebruik **niet** `http://localhost:3000`.

2. **Klik op “Login with Spotify”**  
   Op de homepage van de live app: klik op de knop om met Spotify in te loggen.

3. **Voltooi de Spotify-inlog**  
   Spotify opent (in dezelfde tab of popup). Log in bij Spotify als dat moet en **sta de app toe** (“Agree” / “Toestaan”). Daarna stuurt Spotify je terug naar je app.

4. **Kijk waar je terechtkomt**
   - **Dashboard** (bijv. `/dashboard` of `/dashboard?sid=...`) → de callback is gelukt; er zou nu een rij in de tabel `sessions` in Supabase moeten staan. Controleer dat in Supabase → **Table Editor** → `sessions`.
   - **Homepage met fout in de URL** (bijv. `/?error=spotify&error_description=...`) → er is iets misgegaan (token-uitwisseling of database). Noteer de `error_description` en kijk in **Vercel → Logs** naar `[Spotify callback]` voor de details.

Als je daarna in Supabase nog steeds geen rijen in `sessions` ziet, wijst `DATABASE_URL` op Vercel waarschijnlijk naar een andere database, of de callback faalt voordat de sessie wordt opgeslagen (zie de logs).

### Overzicht: wat kan er misgaan tussen Vercel en database?

Als je **"Sessie hoort bij andere omgeving"** ziet (Session-id geldig: ja, Sessie in DB: nee), dan gebruikt de pagina/API een andere database of omgeving dan waar je ingelogd bent. Onderstaande punten kun je nalopen.

| # | Oorzaak | Wat er gebeurt | Controle / oplossing |
|---|--------|-----------------|----------------------|
| 1 | **Andere URL gebruikt voor inloggen** | Je logde in op localhost of een preview-URL; de sessie staat in de DB van die omgeving. Op productie is er geen sessie. | Altijd inloggen op **dezelfde** URL als waar je Playlists opent. Gebruik alleen de productie-URL (of alleen localhost) en kom via Dashboard → Tracked playlists. |
| 2 | **`DATABASE_URL` op Vercel wijst naar andere database** | Production en Preview kunnen verschillende env vars hebben, of de waarde is een ander Supabase-project. | Vercel → Project → **Settings** → **Environment Variables**. Controleer dat **Production** (en **Preview** als je die gebruikt) exact dezelfde `DATABASE_URL` hebben als het Supabase-project waar je in de Table Editor kijkt. |
| 3 | **Preview vs Production** | Je opent een Preview-deploy (bijv. van een branch) maar logde in op Production, of andersom. | Zet voor **Preview** dezelfde `DATABASE_URL` als voor Production, of gebruik alleen de Production-URL om in te loggen én Playlists te openen. |
| 4 | **Sessie nooit aangemaakt op deze deploy** | De callback na Spotify-login is niet op deze Vercel-deploy uitgevoerd, of is daar gefaald vóór `prisma.session.create`. | Log op **deze** site opnieuw in (startpagina → Uitloggen → Inloggen met Spotify). Controleer Vercel → **Logs** voor de callback-route; bij fouten staat daar `[Spotify callback]`. |
| 5 | **Database niet bereikbaar vanaf Vercel** | Time-out of verbindingsfout bij schrijven/lezen (verkeerde pooler, firewall, of wachtwoord). | Gebruik de **Transaction**-pooler-URL (poort 6543, `?pgbouncer=true`) voor serverless. Test de connection string lokaal met `npx prisma db pull` of een kleine query. |
| 6 | **Tabel `sessions` ontbreekt of ander schema** | Migraties zijn op deze database niet gedraaid. | In Supabase: **Table Editor** → controleer of de tabel `sessions` bestaat. Zo niet: voer lokaal `supabase db push` uit (zie **Database Migrations Strategy**), of voer de SQL uit `supabase/migrations/*.sql` handmatig in de Supabase SQL Editor uit. |
| 7 | **Oude sessie-id in browser** | Er staat nog een `sid` in localStorage van een vorige sessie of andere omgeving; die sessie bestaat niet in **deze** DB. | Klik op "Naar startpagina" (die wist de opgeslagen sid). Log daarna op **deze** URL opnieuw in en ga via Dashboard → Tracked playlists. |
| 8 | **Cookie wordt niet meegestuurd** | Sessie-cookie wordt niet meegestuurd (SameSite, ander domein). De app valt terug op de `sid` in de link; als die van een andere omgeving komt, vindt de API geen sessie. | Ga **via het Dashboard** naar Tracked playlists (link met `?sid=...`), zodat de juiste sid voor deze omgeving wordt gebruikt. Na opnieuw inloggen op deze site is de nieuwe sid correct. |

**Praktische checklist als het blijft misgaan**

1. Gebruik **één vaste URL** (bijv. `https://jouw-app.vercel.app`) voor inloggen én voor Playlists.
2. In Vercel: **Production** en **Preview** dezelfde `DATABASE_URL` (zelfde Supabase-project).
3. In Supabase: in **dat** project de tabel `sessions` controleren; na een geslaagde login op die URL moet daar een rij bijkomen.
4. Na wijziging van env vars op Vercel: **Redeploy** doen (env wordt bij build geladen).

## Database Migrations Strategy

- **Prisma wordt niet meer gebruikt voor production migrations.** Het schema in productie wordt uitsluitend bijgewerkt via Supabase SQL migrations.
- **Alle schemawijzigingen** gebeuren via bestanden in **`supabase/migrations/`** (`.sql`). Maak daar nieuwe bestanden met een datum-prefix (bijv. `20250310120000_add_foo.sql`) en schrijf de benodigde SQL.
- **Lokaal vóór deploy:** Voer **`supabase db push`** (of `supabase migration up`) lokaal uit tegen je Supabase-project, zodat de migraties op de database worden toegepast. Doe dit vóór je code deployt naar Vercel.
- **Na schemawijziging:** Werk `prisma/schema.prisma` bij zodat het overeenkomt met de database (handmatig of via `prisma db pull`), en voer daarna **`npx prisma generate`** (of `npm run db:generate`) uit zodat de Prisma Client en types kloppen.

**Samenvatting:** Schema = `supabase/migrations/*.sql` → lokaal `supabase db push` → eventueel `prisma schema` bijwerken + `prisma generate`. Geen Prisma Migrate en geen migrate-stap in de Vercel build of in GitHub Actions.

### How to apply a database migration

Volg deze stappen om een migratie uit `supabase/migrations/` op je (remote) Supabase-database toe te passen, en daarna de app te deployen:

1. **Supabase CLI inloggen**
   ```bash
   supabase login
   ```

2. **Project koppelen** (eenmalig per project; `<PROJECT_REF>` vind je in Supabase → Project Settings → General → Reference ID)
   ```bash
   supabase link --project-ref <PROJECT_REF>
   ```

3. **Migraties naar de database pushen**
   ```bash
   supabase db push
   ```

4. **Prisma Client opnieuw genereren** (na schema-wijzigingen)
   ```bash
   npx prisma generate
   ```

5. **App deployen** (bijv. push naar `main` of trigger een deploy in Vercel)

Gebruik **geen** `prisma migrate deploy`; migraties lopen alleen via de Supabase CLI.

## Prisma (runtime only)

De app gebruikt [Prisma](https://www.prisma.io/) als ORM voor runtime-queries tegen PostgreSQL. Prisma wordt alleen gebruikt voor de gegenereerde client en types; migraties lopen via Supabase (zie **Database Migrations Strategy**).

**Eerste keer / na clone:**

```bash
npm install
# Voeg DATABASE_URL toe aan .env of .env.local
npx prisma generate
```

**Handige commands:**

| Command | Beschrijving |
|---------|--------------|
| `npm run db:generate` | Genereer Prisma Client (`prisma generate`) – nodig na schema-wijzigingen |
| `npm run db:studio` | Prisma Studio openen om data te bekijken/bewerken |

**Vercel build**

De build mag **geen** database-migraties uitvoeren. Gebruik als Build Command in Vercel de standaard: **`npm run build`** (of laat het leeg; dan gebruikt Vercel `npm run build`). In dit project is dat `prisma generate && next build` – alleen client genereren en Next.js bouwen. Voeg geen `prisma migrate deploy` of andere migrate-stap toe aan de build.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
