# Deploying to Vercel

The website, the admin dashboard (`/admin`) and the API can run on Vercel. Vercel has no built-in PHP or MySQL, so this setup uses three pieces:

| Piece | What runs it | Cost |
| --- | --- | --- |
| Website pages, images, admin dashboard files | Vercel (static files) | Free on Hobby |
| PHP API, admin page, installer | Vercel Functions with the community [`vercel-php`](https://github.com/vercel-community/php) runtime (set in `vercel.json`) | Included |
| Database | An external MySQL-compatible database: [TiDB Cloud](https://tidbcloud.com) free tier or [Aiven](https://aiven.io) free MySQL | Free tiers |
| Uploaded images | [Vercel Blob](https://vercel.com/docs/vercel-blob) (Vercel functions have no lasting disk) | Free allowance on Hobby |

## Before you start: things to know

- **Vercel's free Hobby plan is for personal, non-commercial use.** A business website should be on the Pro plan (about US$20 per month) to stay within Vercel's terms.
- `vercel-php` is maintained by the community, not by Vercel. It works well, but if Vercel changes something, a runtime update may be needed.
- The database is a separate service with its own account. Keep its password private; it goes only into Vercel's Environment Variables, never into the code.
- Functions run in Frankfurt (`fra1` in `vercel.json`). Create the database in Frankfurt (or nearby in Europe) so pages load quickly.
- The GitHub Pages copy keeps working unchanged. Once Vercel is live, it can forward visitors there (step 8).

## 1. Create the database

**TiDB Cloud (recommended):** sign up, create a free cluster in **AWS Frankfurt (eu-central-1)**, then press **Connect**. Note the host, port (4000), user (looks like `xxxx.root`) and generate a password. In the SQL editor (or any MySQL client) run `CREATE DATABASE mjt;`.

**Aiven (alternative):** create a free MySQL service in a European region and note the host, port, user (`avnadmin`), password and database (`defaultdb`).

Both require encrypted connections, which the site uses by default.

## 2. Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project**, choose `dancity629/musa-joshua-timbershade`, and **Import**.
3. Framework preset: **Other**. Leave the build and output settings empty.
4. Before pressing Deploy, open **Environment Variables** and add the values from step 3.

## 3. Environment variables

Add each one for the **Production** environment only. This stops unmerged preview branches from using the live database.

| Name | Value |
| --- | --- |
| `DB_HOST` | Database host from step 1 |
| `DB_PORT` | `4000` for TiDB, or the port Aiven shows |
| `DB_NAME` | `mjt` (TiDB) or `defaultdb` (Aiven) |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `INSTALL_TOKEN` | A long random secret you make up, e.g. 30+ letters and numbers |
| `BLOB_READ_WRITE_TOKEN` | Added automatically in step 4 |

Optional: `DB_SSL=0` only for a database that does not support encryption (not recommended), and `UPLOAD_MAX_BYTES` (default 4 MB; Vercel rejects requests over 4.5 MB).

Then press **Deploy**.

## 4. Add image storage

In the project: **Storage → Create → Blob**, connect it to the project for **Production**. Vercel adds `BLOB_READ_WRITE_TOKEN` itself. Redeploy (**Deployments → ⋯ → Redeploy**) so the new variable is picked up.

## 5. Run the installer

Visit `https://<your-project>.vercel.app/install.php?token=<INSTALL_TOKEN>` and press **Install now**. It creates the tables and copies the current products, categories, homepage text and contact details into the database.

Then, in Vercel, **delete the `INSTALL_TOKEN` variable** and redeploy. Without it the installer is switched off completely. (It also refuses to run again once installed.)

## 6. Log in and change the password

Open `https://<your-project>.vercel.app/admin/`, log in with `Admin` / `Admin`, and choose a new password (at least 10 characters). Until you do, the API refuses every change.

## 7. Check the site

- Pages load, products show, and the cart's **Proceed to WhatsApp Checkout** opens WhatsApp with the number from **Contact Details**.
- Upload an image in **Media Library**, use it on a product, and see it on the website.
- `https://<your-project>.vercel.app/server/config.sample.php` shows **404** (server code is never served).

To use your own domain: **Settings → Domains → Add**, and follow Vercel's DNS steps.

## 8. Forward the GitHub Pages address (optional)

In `assets/js/config.js` set `siteUrl: 'https://<your-domain-or-vercel-app>'` and merge to `main`. Visitors to the old github.io address (including `/admin`) are then forwarded.

## How it differs from PHP hosting

| | PHP hosting (docs/DEPLOYMENT.md) | Vercel |
| --- | --- | --- |
| Settings | `server/config.php` | Environment variables |
| Login sessions | PHP session files | `admin_sessions` table in the database |
| Uploaded images | `uploads/` folder | Vercel Blob (public https URLs) |
| Largest upload | 5 MB | 4 MB |
| Rate-limit IP | `REMOTE_ADDR` | `X-Real-IP`, set by Vercel's edge |
| Server files hidden by | `.htaccess` | 404 routes in `vercel.json` |

## Updating later

Every merge to `main` redeploys automatically. Pull requests get preview URLs; without the database variables they show the built-in content, which is safe.

## Backups

- **Database:** TiDB Cloud and Aiven both take automatic backups on their free tiers; you can also export with any MySQL client (`mysqldump`).
- **Images:** they stay in the Blob store (Vercel → Storage → your store → Browser).
