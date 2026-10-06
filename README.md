# Slidewinder

A puzzle game. Drag a Tetris-shaped piece to a side of the board: it enters from that side,
and all tiles slide away from you, as in 2048. Same-color tiles that meet merge, and a same-color group
with values that add up to 5 or more is removed. Remove all cores (bolted to the board) before the
90-second timer runs out. Gray stones arrive after each move.
Live at https://slidewinder.tomtebo.org/. It installs as a PWA (Add to Home Screen).

## Development

    npm install
    npm run dev       # dev server
    npm run build     # build to dist/
    npm run preview   # serve dist/

## Files

- `index.html`: page markup and help text
- `src/game.ts`: rules, levels and stones (no DOM)
- `src/pieces.ts`: piece shapes
- `src/render.ts`: SVG drawing and animation
- `src/main.ts`: input, dragging, the score bar and the tray
- `src/tutorial.ts`: the first-run tutorial (a fixed practice board and its steps)
- `src/style.css`: styles
- `scripts/icon.svg`: source of the app icon and favicon
- `scripts/render-icons.mjs`: `npm run icons` renders the icon to the PNG files in `public/` (needs a Playwright Chromium)
- `public/manifest.webmanifest`: PWA manifest

## Deploy

A push to `main` deploys the site. The GitHub Action (`.github/workflows/deploy.yml`) builds it and pushes `dist/` to the `deploy` branch.
The push to `deploy` fires the repository webhook. The hook `update-slidewinder` on ludo.tomtebo.org then runs `deploy/update-site.sh`,
which copies the branch to `/home/staffan/sites/slidewinder.tomtebo.org`. The update log is `/var/log/webhook-updates.log`.

`npm run deploy` builds locally and copies `dist/` with rsync, without GitHub.

One-time server setup: `deploy/setup-server.sh` (nginx site and TLS certificate) and `deploy/setup-webhook.sh` (the hook).
