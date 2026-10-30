# Claude Code Guidelines for adrik.me

adrik.me is Adrik Grigorian's public personal site: who he is, what he does at General Motors, and what he
enjoys outside of work. Recruiters, colleagues and strangers read it, and it is judged as the work of an
engineering leader. Clarity and polish beat cleverness.

## Code Change Philosophy

### Keep Changes Small and Focused
- **One logical change per commit.** Each commit does exactly one thing
- If a task feels too large, break it into subtasks
- Prefer several small commits over one large one
- Check the change in a browser (desktop and phone width, light and dark) after each step, not at the end

**Quality over speed. Small steps compound into big progress.**

### Task Prioritization

When choosing the next task, prioritize in this order:

1. **Structure and shared pieces:** page layout, design tokens in `styles.css`, shared JS helpers
2. **Integration points:** deploy workflow, `.htaccess`, links between the main site and `drive/`
3. **Unknowns and spikes:** e.g. new three.js / cannon-es features, mobile performance, host behaviour
4. **Standard features:** new sections, drive-mode areas and mini games
5. **Polish and quick wins:** styling, wording, small cleanups

**Fail fast on risky work. Save easy wins for later.**

## Planning and Tickets

- **"Make a story" (or task / ticket) means create a Jira item, not write code.** Work is tracked in the Jira
  project **BO** ("Adrik.me"): https://pixsol.atlassian.net/jira/core/projects/BO/board
- BO has no Story issue type: create a **Task** under the matching Workstream (BO-1 Ring of fire jump,
  BO-2 Drive mode: Polish, BO-3 Drive mode: More of the world, BO-4 Main site, BO-5 Housekeeping)
- Give it a why, a what and acceptance criteria. Only start implementing when asked to

## Content Rules

These come first. Breaking one is a bug even if the page looks fine.

- **Facts must be true.** Titles, dates and numbers come from Adrik's resume or from him. Never invent roles,
  dates, metrics or quotes. If something is unknown, ask or leave it out
- **Nothing confidential from GM.** Only public-level descriptions of the work: no internal system names,
  team names, part numbers, tools, architecture or unreleased products
- **No personal contact details** beyond the LinkedIn link: no phone number, home address or personal email
- **Tone: plain, warm and humble.** Avoid cheesy taglines and anything that reads as bragging
  ("best on a team"); prefer simple statements ("always a team player")
- **Interests are cars, sports (basketball now, soccer too), biking, tech, movies, family and helping
  others.** Keep copy consistent across the main site, the 3D hero, the dashboard and drive mode

## Public Repo Rules

- **No secrets in the repo.** FTP credentials live only in GitHub Actions secrets and the git-ignored
  `.env.deploy`. Never commit, print or echo them
- **Don't change hosting, DNS, GitHub settings or the cPanel account** without asking first
- **Don't impersonate brands.** No GM logos or branding on the site

## Code Quality Standards

### Write Concise Code
After writing any code file, ask: *"Would a senior engineer say this is overcomplicated?"* If yes, **simplify**.

### Avoid Over-Engineering
- Only make changes that are requested or clearly necessary
- Don't add features beyond what was asked
- Don't refactor code that doesn't need it
- A bug fix doesn't need surrounding code cleaned up
- A simple feature doesn't need extra configurability

### Clean Code Practices
- Don't pad files
- Don't leave dead code or temporary debug hooks (e.g. `window.__dbg`); if it's unused, delete it
- No backwards-compatibility hacks or `// removed` comments for deleted code
- Short comments explaining *why*, especially around physics tuning and 3D geometry

### Task Decomposition
- Use micro tasks. The smaller the task, the better the code
- Break complex work into discrete, testable units
- Each micro task should be completable in one focused session

## Legacy and Technical Debt

This repo is public and doubles as a portfolio piece. Every shortcut is visible.

**Fight entropy. Leave the codebase better than you found it.**

## Project-Specific Rules

### Tech Stack
- Plain HTML, CSS and JavaScript. **No build step and no frameworks**
- three.js 0.160.0 (3D hero, drive mode) and cannon-es 0.20.0 (drive-mode physics), loaded from jsDelivr
  through import maps with exact versions
- Fonts: Inter, JetBrains Mono, Space Grotesk from Google Fonts
- Hosting: cPanel (Apache), deployed over FTPS by GitHub Actions on push to `main`

### Directory Structure
```
public/              Everything that ships to the host
  index.html         Main site
  assets/css/        styles.css (light + dark themes via tokens on :root)
  assets/js/         main.js, hero3d.js (3D hero), dash.js (About dashboard)
  assets/img/        Images, favicon, og-card
  drive/             Experimental drivable world (drive.js, index.html), noindex
  .htaccess          HTTPS, caching (HTML/CSS/JS revalidate), security headers
scripts/deploy.ps1   Manual FTP deploy
.github/workflows/   Automatic deploy
DEPLOYMENT.md        How deploys work; ROADMAP-drive.md for drive-mode plans
```

### Code Standards
- Match the surrounding code: 2-space indent, existing naming and comment density
- Colors come from the CSS tokens; every UI change must work in light and dark mode
- Layouts must work at phone width (16px gutter, no horizontal scroll)
- Respect `prefers-reduced-motion` for anything animated
- 3D and physics: pause rendering when off screen, cap pixel ratio at 2

### Boundaries: Never Modify
- `.env.deploy` or any credentials
- The deploy workflow's secret names without updating `DEPLOYMENT.md`
- GitHub repo settings, DNS, or the hosting account without asking first

### Testing
- Preview locally (`.claude/launch.json` serves `public/`) and check desktop, phone, light and dark
- No console errors on load
- For drive mode, test driving, resets and any mini game after physics changes

## Commit Guidelines

1. One logical change per commit
2. Write descriptive commit messages
3. Format: `type: brief description`
   - `feat:` new feature, section or drive-mode area
   - `fix:` bug fix
   - `refactor:` code restructuring
   - `style:` visual or copy tweaks
   - `docs:` documentation and plans
   - `ci:` workflows and deployment pipeline
   - `chore:` maintenance
4. Only commit the files for the change at hand; other sessions may have unrelated work in progress
5. Push to GitHub only when asked. Never force-push `main` without explicit approval and a backup branch
