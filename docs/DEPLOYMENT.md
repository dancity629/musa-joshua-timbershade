# Deploying the website and admin dashboard

The public website, the admin dashboard (`/admin`), the API (`/api`) and uploaded images all run together on one **PHP 8.1+ and MySQL 5.7+/MariaDB 10.3+** host, such as any cPanel shared hosting plan.

GitHub Pages cannot run PHP or a database, so it cannot host the dashboard. The GitHub Pages copy keeps working with the built-in content, and can forward visitors to the new site once it is live (step 7).

## What you need

- A hosting plan with PHP 8.1 or newer, MySQL or MariaDB, and free SSL (AutoSSL / Let's Encrypt). Most Nigerian cPanel hosts (Whogohost, Truehost, Qservers, Hostinger and others) qualify.
- A domain name pointed at that hosting, for example `musajoshuatimbershade.com.ng`.
- PHP extensions `pdo_mysql`, `fileinfo` and `gd` (normally on by default).

## 1. Create the database

In cPanel, open **MySQL Databases**:

1. Create a database (e.g. `youracct_mjt`).
2. Create a database user with a long random password.
3. Add the user to the database with **All Privileges**.

Keep the database name, user and password for step 3.

## 2. Upload the files

Download this repository as a ZIP (GitHub: **Code → Download ZIP**), unzip it on your computer, then in cPanel **File Manager** open `public_html` and upload the files so that `index.html`, `admin/`, `api/`, `server/` and `uploads/` sit directly inside `public_html`.

Make sure the hidden `.htaccess` files were uploaded too (File Manager → Settings → **Show hidden files**). They protect the `server/` and `uploads/` folders.

## 3. Add the configuration

1. In `server/`, copy `config.sample.php` to `config.php`.
2. Edit `config.php` and fill in the database name, user and password from step 1.
3. Leave `debug` set to `false`.

`server/config.php` is never committed to git and is blocked from the web by `server/.htaccess`. For extra safety you can move it outside `public_html` and point to it with `SetEnv MJT_CONFIG /home/youracct/mjt-config.php` in the root `.htaccess`.

## 4. Run the installer

Visit `https://yourdomain/install.php` and press **Install now**. It creates the tables and copies the website's current products, categories, homepage text and contact details into the database, so the site looks the same as before.

Then:

- delete `install.php` from the server, and
- set `'allow_web_install' => false` in `server/config.php`.

(With SSH access you can run `php server/cli-install.php` instead.)

## 5. Log in and change the password

Open `https://yourdomain/admin/` and log in with:

- Username: `Admin`
- Password: `Admin`

You must choose a new password (at least 10 characters) before anything else works. Until it is changed, the API refuses every change, so the default password can never be used to edit the live site.

## 6. Check the site

- Every page loads, the menu works on a phone, and products show.
- Change a heading in **Homepage**, reload the homepage, and see the change.
- Add a product to the cart and press **Proceed to WhatsApp Checkout**: WhatsApp opens with the number from **Contact Details**.
- `https://yourdomain/server/config.php` shows **Forbidden**.
- The site loads on `https://`. Once SSL works, uncomment the "force https" lines in the root `.htaccess`.

## 7. Forward the old GitHub Pages address

In this repository, edit `assets/js/config.js` and set:

```js
siteUrl: 'https://yourdomain'
```

Commit to `main`. Visitors to `https://dancity629.github.io/musa-joshua-timbershade/` (and `/admin`) are then forwarded to the same page on your domain.

## Backups

- **Database:** cPanel → **Backup** (or phpMyAdmin → Export) before large changes, and regularly.
- **Images:** download the `uploads/` folder. Uploaded images are only on the server, not in git.

## Updating the code later

Upload the changed files over the old ones. Never overwrite `server/config.php` or the `uploads/` folder.

## Security summary

| Area | What protects it |
| --- | --- |
| Passwords | Stored only as bcrypt hashes (`password_hash`). The default password must be changed before any edit. |
| Login | Server-side PHP sessions; cookie is HttpOnly, SameSite=Strict, Secure on https. 5 failed attempts in 15 minutes locks that IP and username; 20 locks the IP. |
| Sessions | End after 30 minutes idle or 8 hours total, and when the password changes. |
| API | Every admin endpoint checks the session on the server; every change also needs the CSRF token. The dashboard page itself is only rendered for a logged-in admin. |
| Database | PDO prepared statements everywhere; strict input validation per field; foreign keys. |
| Uploads | JPG, PNG and WebP only, checked from the file's bytes; 5 MB and 8000 px limits; random file names; scripts cannot run in `uploads/`. |
| Content | Stored as plain text and shown with `textContent`, so no HTML or scripts can be injected into the site. Links must be site pages or http(s)/mailto/tel. |
| Secrets | Database credentials live only in `server/config.php` on the server, never in JavaScript or git. |

## Running the tests locally

```bash
# MariaDB/MySQL running, database "mjt" created, server/config.php pointing at it
php server/cli-install.php
php -S 127.0.0.1:8080 server/dev-router.php &
php tests/api-test.php http://127.0.0.1:8080          # 79 API checks
# reinstall, then the browser test (needs Playwright):
node tests/e2e.js http://127.0.0.1:8080               # 33 end-to-end checks
python3 -m http.server 8090 &
node tests/static-fallback.js http://127.0.0.1:8090   # GitHub Pages copy still works
```
