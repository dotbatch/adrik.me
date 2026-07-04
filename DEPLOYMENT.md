# How deployment works

adrik.me is a static site. Everything in `public/` is copied as-is to the cPanel host over FTP — there is no
build step and no PHP. Anything outside `public/` (README, scripts, workflow) never goes to the server.

There are two ways to deploy. Both upload the same files and neither one deletes old files on the server.

## 1. Automatic — push to `main`

File: `.github/workflows/deploy.yml`

1. You push (or merge a pull request) to the `main` branch on GitHub.
2. GitHub Actions checks out the repo and runs
   [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action).
3. The action connects to the host with FTPS and uploads `public/` into `public_html/`.
4. It keeps a `.ftp-deploy-sync-state.json` file on the server, so after the first run it only sends files that
   changed. Don't delete that file; if you do, the next run simply re-uploads everything.

You can also start a deploy by hand: **GitHub → Actions → "Deploy to cPanel" → Run workflow**.
Watch progress and errors in the same Actions tab.

### One-time setup

In **GitHub → repo Settings → Secrets and variables → Actions**:

| Kind     | Name             | Value                                                         |
|----------|------------------|---------------------------------------------------------------|
| Secret   | `FTP_SERVER`     | FTP host, e.g. `ftp.adrik.me`                                 |
| Secret   | `FTP_USERNAME`   | cPanel FTP user                                               |
| Secret   | `FTP_PASSWORD`   | cPanel FTP password                                           |
| Variable | `FTP_REMOTE_DIR` | Optional. Default `public_html/`. Use `/` if the FTP account already opens in the site folder. |
| Variable | `FTP_PROTOCOL`   | Optional. Default `ftps`. Use `ftp` only if the host has no TLS. |

Secrets are encrypted by GitHub and never appear in logs. The password lives only there (and optionally in your
local `.env.deploy`), never in the repo.

The workflow only runs on a branch named `main`. If the repo's default branch is still `master`, rename it on
GitHub (Settings → Branches) or push a `main` branch and make it the default.

## 2. Manual — from your PC

File: `scripts/deploy.ps1` (Windows PowerShell)

```powershell
Copy-Item .env.deploy.example .env.deploy   # first time only, then fill it in
./scripts/deploy.ps1 -DryRun                # list the files it would upload
./scripts/deploy.ps1                        # upload everything in public/
```

`.env.deploy` holds the same FTP values as the GitHub secrets, plus `FTP_REMOTE_DIR` and `FTP_SECURE`
(`true` for FTPS). It is in `.gitignore`, so it is never committed.

The script uploads every file each time (it doesn't track changes) and creates folders as needed.
Use it when GitHub Actions is down, or to test a change on the live host without pushing.

## Troubleshooting

- **Login / 530 errors**: check the username. cPanel FTP users are usually `name@adrik.me`.
- **TLS / certificate errors**: set `FTP_PROTOCOL` to `ftp` (Actions) or `FTP_SECURE=false` (script). This is
  less secure, so only do it if FTPS fails.
- **Site looks unchanged**: hard-refresh (Ctrl+F5). CSS and JS are cached for a week by `public/.htaccess`.
- **Files landed in the wrong folder**: fix `FTP_REMOTE_DIR`, then delete the misplaced files in cPanel's File
  Manager.
- **Old files hanging around**: deploys never delete anything, so remove stale files in cPanel's File Manager.
