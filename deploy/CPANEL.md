# Deploying the websites on cPanel

The user site and the admin site are static files: they are built on your computer and uploaded to cPanel. The
backend runs elsewhere (see `lub-backend/deploy/README.md`); the sites talk to it at its own address.

The examples use `lyubid.com` (user site), `admin.lyubid.com` (admin site) and `api.lyubid.com` (backend). Replace
them with your own domain.

## 1. Build on your computer

User site, in PowerShell, in the `lub-web` folder:

```powershell
npm install
$env:VITE_API_BASE_URL="https://api.lyubid.com"
npm run build
```

Admin site, in the `lub-admin` folder:

```powershell
npm install
$env:VITE_API_BASE_URL="https://api.lyubid.com"
npm run build
```

Each build writes a `dist` folder. The address is built into the files, so build again whenever it changes.
`dist` includes a hidden `.htaccess` file that makes page links work and adds security headers: keep it.

## 2. Upload the user site

1. Zip the **contents** of `lub-web\dist` (select everything inside `dist`, including `.htaccess`, then Send to →
   Compressed folder). The zip must not contain a `dist` folder itself.
2. cPanel → **File Manager** → `public_html`. Delete what is there from an older version (keep `.well-known` if
   present), then **Upload** the zip and **Extract** it.
3. In File Manager, _Settings_ → tick **Show Hidden Files** and check that `.htaccess` is there.

## 3. The admin site on its own subdomain

1. cPanel → **Domains** → _Create A New Domain_ → `admin.lyubid.com`, with its own document root, for example
   `admin.lyubid.com` (not inside `public_html`).
2. Upload and extract the contents of `lub-admin\dist` into that folder the same way.

If you can, let only your own offices reach the admin site: add this line at the top of the admin folder's
`.htaccess`, with your own public address (shown at https://whatismyipaddress.com):

```apache
Require ip 203.0.113.10
```

## 4. HTTPS

cPanel → **SSL/TLS Status** → _Run AutoSSL_ for `lyubid.com`, `www.lyubid.com` and `admin.lyubid.com`. The
`.htaccess` sends every visitor to `https://`.

## 5. Tell the backend about the sites

In the backend's `deploy/.env.production`:

```
WEB_APP_URL=https://lyubid.com
CORS_ORIGINS=https://lyubid.com,https://www.lyubid.com,https://admin.lyubid.com
```

and restart it (`docker compose … up -d`). Without the site in `CORS_ORIGINS`, the browser refuses the backend's
answers and every page shows "We could not reach the server".

## Updating

Build again (step 1), then replace the files in the site's folder with the new `dist` contents (step 2). Visitors
get the new version on their next visit.
