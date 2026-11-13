# Visitor Indexing — D1 Setup

This repository contains the public GitHub Pages notice/redirect, the visitor tracker, the private Cloudflare Worker, and its admin dashboard.

## Storage design

Visitor records are stored in a private Cloudflare D1 database named `visitor-index`. D1 is SQLite-backed; the Worker returns records as JSON and the dashboard exports JSON. The database is not directly accessible from the public website.

Each browser receives a random first-party visitor ID in localStorage. This is not browser fingerprinting. Clearing site storage or using another browser creates a new ID.

## 1. Create the D1 database

In Cloudflare Dashboard:
1. Open **Workers & Pages → D1 SQL Database**.
2. Select **Create database**.
3. Name it `visitor-index`.
4. Open the database and copy its database ID.

## 2. Create the table

Open the database's **Console** and run the complete SQL in:

`migrations/0001_create_visitors.sql`

This creates the visitors table and indexes. Alternatively, use Wrangler after setting the database ID in `wrangler.toml`:

```sh
npx wrangler d1 migrations apply visitor-index --remote
```

## 3. Create and connect the Worker

Create a separate Cloudflare Worker named `visitor-indexer`. Do not modify the existing Playlist Remixer API Worker.

Paste the contents of `worker/visitor-indexer.js` into the new Worker's editor and save/deploy.

In the Worker's **Settings → Bindings**, add a D1 database binding:
- Variable name: `DB`
- D1 database: `visitor-index`

In **Settings → Variables and Secrets**, add a secret:
- Name: `ADMIN_TOKEN`
- Value: a long random secret, at least 32 random bytes

Do not put this token in GitHub, HTML, or frontend JavaScript.

In **Triggers → Cron Triggers**, add:
`17 4 * * *`

This runs the automatic 90-day retention cleanup daily.

If using Wrangler instead of the dashboard, replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml`, then run:

```sh
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

The Worker URL will look like:
`https://visitor-indexer.<your-account>.workers.dev`

## 4. Connect the website

Replace the placeholder URL `https://REPLACE-WITH-YOUR-WORKER.workers.dev` in both:
- `visitor-tracker.js`
- `admin.html`

Commit those two updated files and wait for GitHub Pages to publish.

Test the backend at:
`https://YOUR-WORKER-URL/api/health`

The health endpoint must be called from the website origin or it will reject the request. The admin dashboard is:
`https://aryanavery1488-prog.github.io/admin.html`

Enter the `ADMIN_TOKEN` secret in the dashboard. It is kept in page memory and is not stored in localStorage.

## Data collected

After a visitor presses **Continue to website** on the notice page, the tracker sends:
- Random first-party visitor ID
- IP address from Cloudflare's `CF-Connecting-IP` header
- Browser user-agent string
- Page path and referring page path (query strings and fragments are not collected)
- Browser language and timezone
- Screen dimensions
- First-seen and last-seen timestamps and visit count

No precise GPS location, camera, microphone, contacts, or account passwords are collected.

## Retention, privacy, and access

Records automatically expire after 90 days since the most recent visit. The Worker cron job deletes expired rows. The D1 database is private; visitor records are never written to this GitHub repository. Only requests with the Worker admin token can list or delete records.

The landing page tells visitors that the site collects IP addresses and basic browser/visit information before they choose to continue. Ensure this notice, your privacy policy, and your retention practices comply with the rules that apply to your website and audience.

## Important limitation

The current tracker is loaded from the new user-site landing page. It counts visitors who enter through that page. To count people who directly open the older Playlist Remixer project URL, the tracker also needs to be included in that project's HTML.
