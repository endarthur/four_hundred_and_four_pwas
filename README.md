# 404 PWA Factory

**A client-side app store that 404s itself into existence.**

This technique appears to be novel — as far as we can tell, nobody has combined GitHub Pages' custom 404 handling with service workers and IndexedDB to create a zero-backend installable app platform before.

## How it works

```
1. User clicks "Publish" on the factory page (index.html)
   └─ App metadata + HTML are written to IndexedDB

2. User navigates to /apps/<uuid>/
   └─ No such file exists on disk → GitHub Pages serves 404.html

3. 404.html bootstraps the app
   ├─ Looks up the UUID in IndexedDB to verify it exists
   ├─ Registers sw.js scoped to /apps/<uuid>/
   └─ Reloads the page once the SW activates

4. Service worker intercepts the reload
   ├─ Navigation request → serves app HTML from IndexedDB
   ├─ manifest.json → generates a Web App Manifest from app metadata
   └─ icon-*.png → renders an icon on OffscreenCanvas

5. Browser sees a valid manifest + SW → offers "Install" prompt
   └─ App lands on the home screen as a standalone PWA
```

## Architecture

Three files. That's the whole thing.

| File | Role |
|------|------|
| `index.html` | Factory UI. Publishes test apps to IndexedDB, lists existing ones. Detects its own base path so it works on both localhost and GitHub Pages. |
| `404.html` | Bootstrap page. Served for any `/apps/<uuid>/` request that hits a 404. Extracts the UUID from the URL, verifies the app exists in IndexedDB, registers the service worker with the correct scope, waits for activation, and reloads. |
| `sw.js` | Shared service worker. One physical file registered with many scopes (one per app). Handles `fetch` events by routing to virtual responses: app HTML, manifest JSON, and dynamically-rendered PNG icons — all pulled from IndexedDB. |

### IndexedDB schema (`pwa-factory`, v1)

| Store | Key | Contents |
|-------|-----|----------|
| `apps` | `id` (UUID) | `{ id, name, shortName, createdAt, themeColor, iconText }` |
| `content` | `appId` (UUID) | `{ appId, html }` — the full HTML source of the app |

## Try it

**Live:** [https://endarthur.github.io/four_hundred_and_four_pwas/](https://endarthur.github.io/four_hundred_and_four_pwas/)

**Local dev:**

```bash
npx http-server -p 8080
```

Then open `http://localhost:8080`. Publish a test app and click "Open" to trigger the 404 → SW → install flow. (Locally, `http-server` serves `404.html` for missing paths by default.)

## Key technical details

- **Base path detection** — `index.html` infers its base from `location.pathname` (stripping the trailing filename), so the same code works at `/` (localhost) and `/four_hundred_and_four_pwas/` (GitHub Pages). `404.html` extracts it as everything before `/apps/`.

- **One SW, many scopes** — `sw.js` lives at the repo root but gets registered once per app with `{ scope: '<base>/apps/<uuid>/' }`. Each registration's `fetch` handler reads the scope to figure out which app ID to serve. All registrations share the same IndexedDB.

- **Manifest `id` trick** — The generated `manifest.json` sets `id` to the app's scope path (`/repo/apps/<uuid>/`). This tells the browser each app is a distinct installable entity, so you can install multiple factory-built PWAs side by side.

- **Dynamic icons** — Icons are rendered on the fly via `OffscreenCanvas` inside the service worker. No static assets needed.

- **Persistent storage** — On publish, the factory calls `navigator.storage.persist()` so the browser won't evict app data under storage pressure.

## Status

**Proof of concept.** This demonstrates the core mechanics: publish test apps with random names, colors, and icon letters, each getting its own URL, manifest, icons, and service worker scope. Apps are installable on desktop (Chrome/Edge) and Android, with multiple apps side by side.

## Notes

The bootstrap mechanism doesn't actually require a 404 response — it just needs the same HTML to be served for arbitrary `/apps/<uuid>/` paths. This means the technique could work with any localhost HTTP server on Android (e.g. Termux, KSWEB), turning a phone into a self-contained PWA authoring environment with no cloud infrastructure at all.

## License

[CC0 1.0](LICENSE) — public domain.