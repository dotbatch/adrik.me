# adrik.me

Personal site for Adrik Grigorian — Technical Lead Manager at General Motors.

Plain HTML, CSS and JavaScript. No build step, no frameworks: everything that ships lives in `public/`.

```
public/
  index.html          the whole site
  assets/css/         styles (light + dark themes)
  assets/js/          main.js (effects, theme, easter eggs), hero3d.js (three.js hero), dash.js (About dashboard)
  assets/img/         hero.jpg, portrait.jpg, favicon.svg
  .htaccess           HTTPS redirect, caching, security headers
scripts/deploy.ps1    manual FTP deploy
.github/workflows/    automatic deploy on push to main
```

## Local preview

Open `public/index.html` in a browser, or serve the folder:

```bash
npx serve public
```

## Deploying

Full walkthrough and troubleshooting: [DEPLOYMENT.md](DEPLOYMENT.md).

### Automatic (GitHub Actions)

Every push to `main` uploads `public/` to the cPanel host. Only changed files are sent; the action keeps a
`.ftp-deploy-sync-state.json` file on the server to track what it uploaded.

One-time setup in **GitHub → Settings → Secrets and variables → Actions**:

| Kind     | Name             | Value                                        |
|----------|------------------|----------------------------------------------|
| Secret   | `FTP_SERVER`     | e.g. `ftp.adrik.me`                          |
| Secret   | `FTP_USERNAME`   | cPanel FTP user                              |
| Secret   | `FTP_PASSWORD`   | cPanel FTP password                          |
| Variable | `FTP_REMOTE_DIR` | optional, defaults to `public_html/`         |
| Variable | `FTP_PROTOCOL`   | optional, `ftps` (default) or `ftp`          |

You can also run it by hand from the **Actions** tab (“Deploy to cPanel” → Run workflow).

### Manual (from your PC)

```powershell
Copy-Item .env.deploy.example .env.deploy   # then fill it in; it is git-ignored
./scripts/deploy.ps1 -DryRun                # list what would upload
./scripts/deploy.ps1
```

## Updating content

- Text lives directly in `public/index.html` (sections: About, Work, Life, Contact).
- The rotating hero phrases are the `phrases` array in `public/assets/js/main.js`.
- 3D hero: hobby objects, their positions and click messages are `MESSAGES` / `layout` in `public/assets/js/hero3d.js`.
  three.js loads from the jsDelivr CDN via the import map in `index.html`.
- Dashboard indicator lights: each button's `data-msg` in the About section of `public/index.html` is the text it shows.
- Swap photos by replacing `public/assets/img/portrait.jpg` (square) and `hero.jpg` (wide).
