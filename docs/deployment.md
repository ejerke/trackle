# Deployment

Production runs on one Linux server: **Cloudflare → Caddy → Node** (one
process serving the API and the built web app) with SQLite on local disk.
Files referenced here live in [`deploy/`](../deploy/).

```
Browser ──HTTPS──▶ Cloudflare ──HTTPS (origin cert)──▶ Caddy :443 ──HTTP──▶ Node 127.0.0.1:3000 ──▶ /var/lib/trackle/trackle.db
```

## Checklist before going public

- [ ] `ENABLE_LAB` is **not** set anywhere in production.
- [ ] `CLIENT_IP_HEADER=cf-connecting-ip` (in `trackle.service`), and Caddy's
      `trusted_proxies` lists Cloudflare's ranges, so rate limits see real clients
      ([ADR 0010](adr/0010-rate-limiting.md)).
- [ ] Cloudflare SSL/TLS mode is **Full (strict)**.
- [ ] Daily backups are enabled and a restore has been tried once.

## One-time server setup

Commands assume a systemd-based distro; adapt package commands to yours.

1. **Node 24.** Install system-wide so the service can use it (distro package,
   NodeSource, or a mise install the `trackle` user can read). Note the path:
   `command -v node`. If it isn't `/usr/bin/node`, edit `ExecStart` in the
   unit files.
   Build tools are needed only if npm can't download a prebuilt
   better-sqlite3 for your platform: `gcc`, `make`, `python3`.

2. **User and code.**
   ```sh
   sudo useradd --system --create-home --home-dir /opt/trackle --shell /usr/sbin/nologin trackle
   sudo -u trackle git clone <your-repo-url> /opt/trackle
   cd /opt/trackle && sudo -u trackle npm ci && sudo -u trackle npm run build
   ```

3. **Service** (creates `/var/lib/trackle` for the database).
   ```sh
   sudo cp deploy/trackle.service deploy/trackle-backup.service deploy/trackle-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now trackle trackle-backup.timer
   curl http://127.0.0.1:3000/api/health      # {"ok":true}
   ```
   `deploy.sh` restarts the service with `sudo systemctl restart trackle`; let
   the `trackle` user do exactly that and nothing else:
   ```sh
   echo 'trackle ALL=(root) NOPASSWD: /usr/bin/systemctl restart trackle' | sudo tee /etc/sudoers.d/trackle
   ```

4. **Cloudflare.** DNS: an orange-cloud (proxied) record for
   `trackle.ejerke.org` pointing at the server. SSL/TLS mode: Full (strict).
   SSL/TLS → Origin Server → *Create certificate* for the hostname; save it as
   `/etc/caddy/certs/trackle-origin.pem` and `.key` (readable by the caddy user).

5. **Caddy.** Merge [`deploy/Caddyfile`](../deploy/Caddyfile) into
   `/etc/caddy/Caddyfile` (the global `servers` block must be at the top), then
   `caddy validate --config /etc/caddy/Caddyfile` and `sudo systemctl reload caddy`.

6. **Firewall.** Only 443 (and SSH) need to be open. Optionally allow 443 only
   from Cloudflare's ranges; Caddy's `trusted_proxies` already prevents forged
   client IPs, the firewall additionally hides the origin.

## Deploying updates

```sh
sudo -u trackle /opt/trackle/deploy/deploy.sh             # latest origin/master
sudo -u trackle /opt/trackle/deploy/deploy.sh <commit>    # a specific commit
```

The script fetches, runs `npm ci`, tests, builds, **backs up the database**,
restarts the service (migrations run on start) and waits for the health check.
It stops at the first failure.

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs the same
install, typecheck, tests and build on every push, so a red CI run means
"don't deploy". Automatic deployment (CD) from CI is a later step: it needs an
SSH deploy key for the server stored as a GitHub secret, and a workflow that
runs `deploy.sh` after CI passes on master.

## Backups and restore

- `trackle-backup.timer` runs daily at 03:30 and keeps 30 backups in
  `/var/lib/trackle/backups/`. Deploys add one before every restart.
- Manual: `sudo -u trackle env DATABASE_PATH=/var/lib/trackle/trackle.db BACKUP_DIR=/var/lib/trackle/backups npm run backup`.
- Backups use SQLite's online backup API, so they're consistent even while the
  server is writing.
- **Copy backups off the machine too** (e.g. rsync to another host); a backup
  on the same disk doesn't survive the disk.

Restore:

```sh
sudo systemctl stop trackle
sudo -u trackle cp /var/lib/trackle/backups/trackle-<stamp>.db /var/lib/trackle/trackle.db
sudo -u trackle rm -f /var/lib/trackle/trackle.db-wal /var/lib/trackle/trackle.db-shm
sudo systemctl start trackle
```

## Rolling back

`deploy.sh <previous-commit>` (the script prints it on failure). If the bad
version ran a migration, the old code will refuse to start against the newer
schema (by design, see [database.md](database.md#migrations)): restore the
backup taken just before that deploy as well.

## Operating

| Task | Command |
| ---- | ------- |
| Logs | `journalctl -u trackle -f` (JSON lines; pipe through `jq` if you like) |
| Status | `systemctl status trackle` |
| Restart | `sudo systemctl restart trackle` |
| Last backups | `ls -l /var/lib/trackle/backups` |
| Database shell | `sudo -u trackle sqlite3 /var/lib/trackle/trackle.db` |
