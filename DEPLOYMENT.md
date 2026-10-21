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

## Updating

```bash
cd /home/deploy/it-helpdesk && git pull && docker compose up -d --build
```

## Backups

Everything (database and screenshots) is in the `ithelpdesk-data` volume:

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
