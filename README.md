This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

Create a `.env` or `.env.local` file in the project root (voor lokaal development volstaat `.env.local`). Required variables:

- **`DATABASE_URL`** – PostgreSQL connection string (voor Prisma), bijv. `postgresql://user:password@localhost:5432/spotify_monitor`
- **`AUTH_SPOTIFY_ID`** of **`SPOTIFY_CLIENT_ID`** – Spotify app Client ID
- **`AUTH_SPOTIFY_SECRET`** of **`SPOTIFY_CLIENT_SECRET`** – Spotify app Client Secret
- **`AUTH_SECRET`**, **`NEXTAUTH_SECRET`** of **`BETTER_AUTH_SECRET`** – Geheim voor cookie/sessie-encryptie
- **`NEXTAUTH_URL`** (optioneel) – Base URL van de app, bijv. `http://localhost:3000`

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
   - In het linkermenu: **Project Settings** (tandwiel onderaan).
   - Klik op **Database** in de linkerkolom.
   - Scroll naar **Connection string**.
   - Kies het tabje **URI**.
   - Kopieer de string. Die ziet er zo uit:
     ```
     postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
     ```
   - Vervang **`[YOUR-PASSWORD]`** door het database-wachtwoord dat je bij stap 1 hebt ingesteld.
   - Voor Prisma moet je vaak **Session mode** gebruiken (poort **5432**) of **Transaction mode** (poort **6543**). Supabase toont beide; gebruik de URI die bij **Session** of **Direct connection** staat (poort 5432) als je geen connection pooling nodig hebt, of de **Transaction**-URI (6543) voor serverless (bijv. Vercel). Beide werken met Prisma.

3. **In je project gebruiken**
   - Plak de aangepaste URI (met je echte wachtwoord) in `.env.local` als `DATABASE_URL`:
     ```env
     DATABASE_URL="postgresql://postgres.[project-ref]:JE_WACHTWOORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
     ```
   - Bij **Session pooler** (6543) voeg vaak `?pgbouncer=true` toe aan de URL (zoals hierboven). Bij **Direct connection** (5432) kun je `?pgbouncer=true` weglaten.
   - Daarna lokaal: `npx prisma migrate dev --name init` (of je bestaande migratie). De tabellen komen dan in Supabase te staan.

4. **Op Vercel**
   - Zelfde connection string: in Vercel → je project → **Settings** → **Environment Variables** → **Add** → Name: `DATABASE_URL`, Value: dezelfde URI. Kies Environment **Production** (en eventueel Preview).
   - Na deploy gebruikt de app op Vercel deze Supabase-database.

**Tip:** Je kunt dezelfde Supabase-database voor lokaal én Vercel gebruiken, of lokaal een eigen PostgreSQL gebruiken en alleen op Vercel Supabase.

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
| `npm run db:migrate:deploy` | Migraties uitvoeren in productie (`prisma migrate deploy`) |
| `npm run db:studio` | Prisma Studio openen om data te bekijken/bewerken |

Na wijzigingen in `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name beschrijvende_naam
```

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
