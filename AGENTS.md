# FortniteSpriteTracking

A single-page web app ("Fortnite Sprite Tracker"). It lets you mark which sprites you own; progress can be saved locally or synced to a cloud account.

## Cursor Cloud specific instructions

- The frontend is `index.html` plus image assets in `images/`.
- Tailwind and `html2canvas` are loaded from CDNs at runtime, so an internet connection is needed in the browser for full styling and the "Save Image" feature.
- **Static-only mode:** serve the directory over HTTP (do not open via `file://`):
  - `python3 -m http.server 8000` then open `http://localhost:8000/index.html`.
  - Local progress persists in browser `localStorage` under the key `fnSpriteTracker61`.
- **Full app with accounts:** run the Node backend, which serves the frontend and API on one port:
  - `cd server && npm install && npm start`
  - Open `http://localhost:8000`
  - Optional: copy `server/.env.example` to `server/.env` and set `JWT_SECRET`.
  - **Neon Postgres:** set `DATABASE_URL` in `server/.env` with your connection string from the [Neon console](https://console.neon.tech/app/projects/super-queen-85743129) (Dashboard → Connect). Without it, the server falls back to local SQLite at `data/sprites.db`.
  - User accounts and sprite collections persist in Neon (or SQLite locally).
- Clear site data (or sign out) to reset local state; cloud data remains until overwritten while signed in.
