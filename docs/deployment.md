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

2. **User and code.** The code lives in a bare clone; each deploy unpacks a
   commit into its own release folder (see [Deploying updates](#deploying-updates)).
   CI must have passed on master once, so the `production` branch exists.
   ```sh
   sudo useradd --system --create-home --home-dir /opt/trackle --shell /usr/sbin/nologin trackle
   sudo -u trackle git clone --bare <your-repo-url> /opt/trackle/repo.git
   ```
   *Private repo:* the server needs read access. Create a key
   (`sudo -u trackle ssh-keygen -t ed25519 -N '' -f /opt/trackle/.ssh/id_ed25519`),
   add the `.pub` on GitHub under *Settings → Deploy keys* (read-only, no write
   access), and clone with the `git@github.com:…` URL.

3. **Services** (creates `/var/lib/trackle` for the database).
   ```sh
   cd /tmp && sudo -u trackle git --git-dir=/opt/trackle/repo.git archive production deploy | tar -x
   sudo cp /tmp/deploy/*.service /tmp/deploy/*.timer /etc/systemd/system/ && rm -r /tmp/deploy
   sudo systemctl daemon-reload
   sudo systemctl enable trackle
   ```
   The deploy script restarts the service with `sudo systemctl restart trackle`;
   let the `trackle` user do exactly that and nothing else:
   ```sh
   echo 'trackle ALL=(root) NOPASSWD: /usr/bin/systemctl restart trackle' | sudo tee /etc/sudoers.d/trackle
   ```
   First deploy (builds the first release, creates `/opt/trackle/current` and
   starts the service), then turn on backups and continuous deployment:
   ```sh
   sudo -u trackle git --git-dir=/opt/trackle/repo.git show production:deploy/deploy.sh | sudo -u trackle bash -s
   curl http://127.0.0.1:3000/api/health      # {"ok":true}
   sudo systemctl enable --now trackle-backup.timer trackle-deploy.timer
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

**Push to master. That's it.** The pipeline:

```
git push master ──▶ CI: typecheck, test, build ──green──▶ CI pushes the commit to `production`
                                                                   │
server: trackle-deploy.timer (every minute) ──git fetch──▶ production moved? ──▶ deploy.sh
```

The server *pulls*: GitHub has no key to the server and no port is opened for
it. Only commits that passed CI reach `production`
([`ci.yml`](../.github/workflows/ci.yml), job `promote`). A deploy shows up
within about a minute plus build time; follow it with `journalctl -u trackle-deploy -f`.

What [`deploy.sh`](../deploy/deploy.sh) does for a new commit:

1. Unpacks it into `/opt/trackle/releases/<sha>/`, then `npm ci`, tests and builds
   there. The running server is untouched; if anything fails, it stops here.
2. **Backs up the database.**
3. Points the `/opt/trackle/current` symlink at the new release (atomic) and
   restarts the service (migrations run on start).
4. Waits for `/api/health`. If it never comes up, switches `current` back to
   the previous release and restarts that.

A commit that failed isn't retried automatically; the next commit on
`production` is. The newest 5 releases stay on disk.

```
/opt/trackle/
  repo.git/                bare clone
  releases/<sha>/          one folder per deployed commit, never modified
  current -> releases/<sha>
  HOLD                     present = automatic deploys paused
  last-failed              commit whose deploy failed
```

Manual runs (as the `trackle` user):

```sh
sudo -u trackle /opt/trackle/current/deploy/deploy.sh            # deploy production now, resume auto-deploys
sudo -u trackle /opt/trackle/current/deploy/deploy.sh <commit>   # pin a commit, pause auto-deploys
```

To stop CD entirely: `sudo systemctl disable --now trackle-deploy.timer`.

## Backups and restore

- `trackle-backup.timer` runs daily at 03:30 and keeps 30 backups in
  `/var/lib/trackle/backups/`. Deploys add one before every restart.
- Manual: `cd /opt/trackle/current && sudo -u trackle env DATABASE_PATH=/var/lib/trackle/trackle.db BACKUP_DIR=/var/lib/trackle/backups npm run backup`.
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

A deploy whose health check fails rolls itself back. To go back from a
release that is up but buggy:

```sh
ls -t /opt/trackle/releases                                           # newest first
sudo -u trackle /opt/trackle/current/deploy/deploy.sh <previous-sha>   # seconds if still on disk
```

This also **pauses automatic deploys** (creates `/opt/trackle/HOLD`), so the
timer doesn't redeploy the bad commit. Push a fix to master, then resume with
`deploy.sh` (no arguments), or `rm /opt/trackle/HOLD` and let the timer pick
it up.

If the bad version ran a migration, the old code will refuse to start against
the newer schema (by design, see [database.md](database.md#migrations)):
restore the backup taken just before that deploy as well (see above).

## Operating

| Task | Command |
| ---- | ------- |
| Logs | `journalctl -u trackle -f` (JSON lines; pipe through `jq` if you like) |
| Status | `systemctl status trackle` |
| Restart | `sudo systemctl restart trackle` |
| Deploy log | `journalctl -u trackle-deploy -f` |
| Live release | `readlink /opt/trackle/current` |
| Deploys paused? | `ls /opt/trackle/HOLD` |
| Last backups | `ls -l /var/lib/trackle/backups` |
| Database shell | `sudo -u trackle sqlite3 /var/lib/trackle/trackle.db` |
