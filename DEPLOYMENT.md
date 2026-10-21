# Deploying IT Desk to the VPS

The same box and flow as ScoreSage and AutoMail: Docker behind the host's
Nginx + Certbot, at `https://it.wharveytech.com`. Ports 7888-7890 are taken,
so IT Desk uses **7891**.

**You need:** a Gemini API key (<https://aistudio.google.com/apikey>), the
password you want for the login screen, and optionally an Anthropic key
(<https://console.anthropic.com>) for the "Think harder" button.

---

## 1. DNS

| Type | Name | Value            | TTL |
| ---- | ---- | ---------------- | --- |
| A    | `it` | your server's IP | 300 |

```bash
dig +short it.wharveytech.com
```

## 2. Get the code onto the server

Push this folder to a GitHub repo, then on the VPS:

```bash
git clone https://github.com/<you>/IT_HelpDesk.git /home/deploy/it-helpdesk
```

```bash
cd /home/deploy/it-helpdesk && cp .env.example .env && nano .env
```

Set at least:

```dotenv
APP_PASSWORD=your-login-password
GEMINI_API_KEY=AIza...
PORT=7891
```

Optional: `ANTHROPIC_API_KEY=sk-ant-...` and `REMEMBER_DAYS=30` (each visit
renews it, so you only sign in again after 30 days away).

## 3. Build and start

```bash
docker compose up -d --build
```

Check it is healthy and answering on the loopback port:

```bash
docker compose ps && curl -s http://127.0.0.1:7891/api/health
```

## 4. Nginx and HTTPS

```bash
sudo cp nginx.conf /etc/nginx/sites-available/it-helpdesk && sudo ln -s /etc/nginx/sites-available/it-helpdesk /etc/nginx/sites-enabled/
```

First pass: in `/etc/nginx/sites-available/it-helpdesk`, comment out the whole
`listen 443` server block and the `return 301` redirect, then:

```bash
sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d it.wharveytech.com
```

Second pass: uncomment what you commented out (Certbot has created the
certificate files it points at), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The streaming location in `nginx.conf` turns off proxy buffering for the step
endpoint. Without it, steps arrive all at once instead of word by word.

## 5. Install the desktop app (Windows)

IT Desk installs as an app from Edge or Chrome. It opens in its own window but still reads everything from the
server, so your history is the same on every device.

1. Open `https://it.wharveytech.com` in **Edge**, sign in, and tick **Remember me**.
2. Go to **Settings → Desktop app → Install IT Desk**. Or use Edge's ⋯ menu → **Apps** → **Install this site as an
   app**; in Chrome, use the install icon at the right of the address bar.
3. Right-click the new taskbar icon and choose **Pin to taskbar**. Right-clicking it also gives New chat, Useful
   commands and Settings shortcuts.
4. Optional: open `edge://apps`, right-click IT Desk, and turn on **Start app when you sign in**.

Updates arrive by themselves whenever you redeploy; there is nothing to reinstall.

## 6. Backups to Cloudflare R2

Once a day the app snapshots the database, uploads it to R2, copies any new screenshots, and deletes snapshots older
than 30 days (`BACKUP_KEEP_DAYS`). No cron job is needed; the app runs it itself.

**In the Cloudflare dashboard:**

1. **R2 Object Storage → Create bucket.** Name it e.g. `it-desk-backups`. Leave Location on **Automatic**, and
   don't pick a jurisdiction: an EU jurisdiction uses a different endpoint.
2. **R2 Object Storage → Manage API tokens → Create API token.**
   - Permissions: **Object Read & Write**
   - Specify bucket: **Apply to specific buckets only** → `it-desk-backups`
   - TTL: **Forever**. Optionally limit Client IP to your VPS's IP.
3. Copy the **Access Key ID** and **Secret Access Key** (the secret is shown only once). Your **Account ID** is on
   the R2 overview page, and is also the first part of the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

**On the VPS**, add them to `.env`:

```dotenv
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET=it-desk-backups
```

```bash
cd /home/deploy/it-helpdesk && docker compose up -d
```

Then open **Settings → Backups → Back up now**. The bucket should show `db/helpdesk-<date>.db.gz` and an `uploads/`
folder. Settings shows the last backup time, and the error if one fails.

**Restoring** (to a new VPS, or after a disaster):

1. In the R2 dashboard, open the bucket's `db/` folder, download the newest `.db.gz`, rename it `restore.db.gz`,
   and copy it into the project folder on the VPS.
2. Stop the app and swap the database in. The volume name is `<folder>_ithelpdesk-data`; `docker volume ls` shows it.

```bash
docker compose down
```

```bash
docker run --rm -v it-helpdesk_ithelpdesk-data:/data -v "$PWD":/restore busybox sh -c 'rm -f /data/helpdesk.db-wal /data/helpdesk.db-shm && gunzip -c /restore/restore.db.gz > /data/helpdesk.db && chown 1000:1000 /data/helpdesk.db'
```

```bash
docker compose up -d
```

3. Screenshots: copy the files under `uploads/` in the bucket back into the volume's `uploads/` folder (for example
   with `rclone copy`). Chats work without them; only old attachments would be missing.

## Updating

```bash
cd /home/deploy/it-helpdesk && git pull && docker compose up -d --build
```

## Manual backup

Automatic R2 backups are covered in section 6. For a one-off local copy, everything (database and screenshots) is in
the `ithelpdesk-data` volume:

```bash
docker run --rm -v it-helpdesk_ithelpdesk-data:/data -v "$PWD":/backup busybox tar czf /backup/it-helpdesk-$(date +%F).tgz -C /data .
```

(`docker volume ls` shows the exact volume name if your folder name differs.)

## Troubleshooting

- **Logs:** `docker compose logs -f app`
- **"Wrong password" though it's right:** the container reads `.env` at
  start; run `docker compose up -d` after editing it.
- **Signed out everyone:** changing `APP_PASSWORD` or `SESSION_SECRET`
  invalidates all sessions by design.
- **Steps never appear:** check `GEMINI_API_KEY`, then the logs for
  `Gemini API error`. If a default model is retired, set `GEMINI_MODEL` /
  `GEMINI_FAST_MODEL` in `.env` to a current one.
