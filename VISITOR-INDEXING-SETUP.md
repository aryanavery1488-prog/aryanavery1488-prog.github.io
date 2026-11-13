# Visitor Indexing Setup

This repository contains the public GitHub Pages frontend, a private Cloudflare Worker, and an admin dashboard.

## Important status

The code is committed to GitHub, but visitor indexing will NOT start collecting records until the Worker and private R2 bucket are deployed and the placeholder Worker URL is replaced in `visitor-tracker.js` and `admin.html`.

## 1. Create private storage

In Cloudflare Dashboard:
1. Open **R2 Object Storage**.
2. Create a bucket named `visitor-index-private`.
3. Keep it private. Do not enable public access or a public custom domain.
4. The Worker configuration binds it as `VISITOR_BUCKET`.

Each visitor is stored as a separate JSON object under `visitors/{visitor_id}.json`.

## 2. Deploy the Worker

Install Wrangler and authenticate with Cloudflare, then from this repository run:

```sh
npx wrangler login
npx wrangler r2 bucket create visitor-index-private
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

When prompted for `ADMIN_TOKEN`, use a long random secret (at least 32 random bytes). Do not put it in GitHub, HTML, JavaScript, or this repository. The R2 bucket creation command may say it already exists if you created it in the dashboard; that is fine.

The Worker uses the R2 binding in `wrangler.toml`. It accepts requests only from `https://aryanavery1488-prog.github.io`.

## 3. Connect the website and dashboard

After deployment, copy the Worker URL, such as `https://visitor-indexer.<your-account>.workers.dev`.

Replace the placeholder `https://REPLACE-WITH-YOUR-WORKER.workers.dev` in both:
- `visitor-tracker.js`
- `admin.html`

Commit those two changes and wait for GitHub Pages to publish.

## 4. Open the dashboard

Visit:

`https://aryanavery1488-prog.github.io/admin.html`

Enter the secret configured as the Worker `ADMIN_TOKEN`. The dashboard can list, inspect, export, and delete visitor records. The token is held only in the page's memory and is not saved in browser storage.

## Data collected

- Random first-party visitor ID stored in localStorage
- IP address supplied by Cloudflare's `CF-Connecting-IP` request header
- Browser user-agent string
- Page URL and referring page
- Browser language and timezone
- Screen dimensions
- First-seen and last-seen timestamps and visit count

No precise GPS location, camera, microphone, contacts, or account passwords are collected.

## Retention and access

Records are automatically deleted after 90 days by the Worker cron trigger. The R2 bucket must remain private. Only requests with the Worker admin token can list records or delete individual records. The public visitor endpoint can create/update a record but cannot read records.

## Privacy notice

The landing page displays a notice that the site collects IP address and basic browser/visit information for visitor statistics and security. Update the notice and this document if the data practices change. Ensure your use complies with applicable privacy laws and provide a contact method and any required opt-out/consent mechanism for your audience.

## Security notes

- Never publish the admin token.
- Do not make the R2 bucket public.
- Do not put visitor JSON files in the GitHub repository.
- Restrict access to the Cloudflare account and rotate the admin token if exposed.
- This implementation identifies returning browsers using localStorage; clearing browser storage or using another browser creates a new visitor ID.
