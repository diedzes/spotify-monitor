This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

Create a `.env` or `.env.local` file in the project root (voor lokaal development volstaat `.env.local`). Required variables:

- **`DATABASE_URL`** – PostgreSQL connection string voor **runtime** (Next.js/Prisma queries). Lokaal en op Vercel: gebruik de **pooler**-URL (poort 6543) voor Supabase.
- **`DIRECT_URL`** – Alleen nodig voor **migraties** (Prisma CLI). Directe database-verbinding (geen pooler), bij Supabase poort **5432**. Gebruik je Supabase: zet deze lokaal in `.env` en in GitHub Secrets; **niet** op Vercel.
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

2. **Connection strings ophalen**
   - In het linkermenu: **Project Settings** (tandwiel) → **Database**.
   - Scroll naar **Connection string**; kies **URI**.
   - Je hebt twee URLs nodig:
     - **Pooler (runtime):** host met `pooler.supabase.com`, poort **6543**. Voor `DATABASE_URL` (Vercel + lokaal runtime).
     - **Direct (migraties):** host `db.[project-ref].supabase.co`, poort **5432**. Voor `DIRECT_URL` (lokaal CLI + GitHub Actions).
   - Vervang overal **`[YOUR-PASSWORD]`** door je database-wachtwoord.

3. **Lokaal (`.env` of `.env.local`)**
   - Zet **beide** URLs, bijvoorbeeld:
     ```env
     DATABASE_URL="postgresql://postgres.[ref]:WACHTWOORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
     DIRECT_URL="postgresql://postgres.[ref]:WACHTWOORD@db.[ref].supabase.co:5432/postgres"
     ```
   - Daarna: `npx prisma migrate dev --name init` (of bestaande migratie). Tabellen komen in Supabase; migraties gebruiken `DIRECT_URL`.

4. **Op Vercel (alleen runtime)**
   - Vercel → je project → **Settings** → **Environment Variables**.
   - Zet **alleen** **`DATABASE_URL`** = de **pooler**-URL (poort 6543, `?pgbouncer=true`). Kies Environment **Production** (en eventueel Preview).
   - **`DIRECT_URL` hoef je op Vercel niet te zetten.** De build draait geen migraties; alle runtime-queries gebruiken `DATABASE_URL`.

5. **GitHub Secrets (voor migraties in productie)**
   - GitHub → je repo → **Settings** → **Secrets and variables** → **Actions**.
   - Voeg een secret toe: **Name:** `DIRECT_URL`, **Value:** zie hieronder.
   - Bij elke push naar `main` draait de workflow **Run database migrations** (`.github/workflows/migrate.yml`) en voert `npx prisma migrate deploy` uit.

   **Waarde voor `DIRECT_URL` in GitHub:**  
   GitHub Actions heeft geen volledige IPv6-ondersteuning; de directe Supabase-host (`db.xxx.supabase.co:5432`) is vaak alleen via IPv6 bereikbaar, waardoor je **P1001: Can't reach database server** krijgt. Kies één van deze twee:

   - **Optie A (aanbevolen, geen extra kosten):** Zet in GitHub Secrets **`DIRECT_URL`** = je **pooler**-URL (zelfde als `DATABASE_URL`: host `pooler.supabase.com`, poort **6543**, met `?pgbouncer=true`). De workflow maakt dan verbinding via de pooler (IPv4-compatible). Migraties werken hiermee; lokaal kun je gewoon de echte directe URL in `.env` blijven gebruiken.
   - **Optie B:** Schakel in Supabase de **IPv4 add-on** in (Project Settings → Add-ons). Dan blijft de **directe** URL (poort 5432) ook vanaf GitHub bereikbaar; je kunt die dan als `DIRECT_URL` in GitHub Secrets zetten.

**Tip:** Je kunt dezelfde Supabase-database voor lokaal én Vercel gebruiken, of lokaal een eigen PostgreSQL gebruiken en alleen op Vercel Supabase.

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
| 6 | **Tabel `sessions` ontbreekt of ander schema** | Migraties zijn op deze database niet gedraaid. | In Supabase: **Table Editor** → controleer of de tabel `sessions` bestaat. Zo niet: voer de SQL uit `prisma/migrations/.../migration.sql` uit, of run `npx prisma migrate deploy` tegen deze `DATABASE_URL`. |
| 7 | **Oude sessie-id in browser** | Er staat nog een `sid` in localStorage van een vorige sessie of andere omgeving; die sessie bestaat niet in **deze** DB. | Klik op "Naar startpagina" (die wist de opgeslagen sid). Log daarna op **deze** URL opnieuw in en ga via Dashboard → Tracked playlists. |
| 8 | **Cookie wordt niet meegestuurd** | Sessie-cookie wordt niet meegestuurd (SameSite, ander domein). De app valt terug op de `sid` in de link; als die van een andere omgeving komt, vindt de API geen sessie. | Ga **via het Dashboard** naar Tracked playlists (link met `?sid=...`), zodat de juiste sid voor deze omgeving wordt gebruikt. Na opnieuw inloggen op deze site is de nieuwe sid correct. |

**Praktische checklist als het blijft misgaan**

1. Gebruik **één vaste URL** (bijv. `https://jouw-app.vercel.app`) voor inloggen én voor Playlists.
2. In Vercel: **Production** en **Preview** dezelfde `DATABASE_URL` (zelfde Supabase-project).
3. In Supabase: in **dat** project de tabel `sessions` controleren; na een geslaagde login op die URL moet daar een rij bijkomen.
4. Na wijziging van env vars op Vercel: **Redeploy** doen (env wordt bij build geladen).

## Prisma (database)

De app gebruikt [Prisma](https://www.prisma.io/) met PostgreSQL.

**Eerste keer / na clone:**

```bash
npm install
# Voeg DATABASE_URL toe aan je bestaande .env.local (of kopieer .env.example naar .env en vul in)
npx prisma generate
npx prisma migrate dev --name init   # of een andere migratienaam
```

**Handige commands:**

| Command | Beschrijving |
|---------|--------------|
| `npm run db:generate` | Genereer Prisma Client (`prisma generate`) |
| `npm run db:migrate` | Migraties uitvoeren in development (`prisma migrate dev`) |
| `npm run db:migrate:deploy` | Migraties uitvoeren in productie (`prisma migrate deploy`) – handmatig; productie doet dit via GitHub Actions |
| `npm run db:studio` | Prisma Studio openen om data te bekijken/bewerken |

**Migraties: lokaal vs productie**

- **Lokaal een migratie maken**  
  Na wijzigingen in `prisma/schema.prisma`, met `DATABASE_URL` en `DIRECT_URL` in `.env`:
  ```bash
  npx prisma migrate dev --name beschrijvende_naam
  ```
  Dit maakt een migratiebestand en past die lokaal toe (via `DIRECT_URL`). Commit de map `prisma/migrations/` en push naar `main`.

- **Productie: migraties toepassen**  
  Bij elke **push naar `main`** draait de GitHub Actions workflow **Run database migrations** (`.github/workflows/migrate.yml`). Die voert `npx prisma migrate deploy` uit met de `DIRECT_URL` uit GitHub Secrets. Openstaande migraties worden dan op de Supabase-database toegepast; op Vercel draaien **geen** migraties tijdens de build.

**Supabase pooling**  
De Prisma-setup is compatibel met Supabase: runtime gebruikt de pooler-URL (`DATABASE_URL`, poort 6543); migraties gebruiken de directe URL (`DIRECT_URL`, poort 5432) via `directUrl` in `prisma/schema.prisma`.

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
