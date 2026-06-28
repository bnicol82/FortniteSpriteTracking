# FortniteSpriteTracking

A single-page static web app ("Fortnite Sprite Tracker"). It lets you mark which sprites you own; progress is saved to `localStorage`.

## Cursor Cloud specific instructions

- This is a **pure static site** with no build system, package manager, dependencies, lint, or test tooling. The entire app is `index.html` plus image assets in `images/`.
- Tailwind and `html2canvas` are loaded from CDNs at runtime, so an internet connection is needed in the browser for full styling and the "Save Image" feature.
- To run it locally, serve the directory over HTTP (do not open via `file://`, since images are loaded with relative paths and some browsers restrict `file://`):
  - `python3 -m http.server 8000` then open `http://localhost:8000/index.html`.
- App state (owned sprites) persists in browser `localStorage` under the key `fnSpriteTracker61`; clear site data to reset.
- There is nothing to install in the update script.
