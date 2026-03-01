// PWA Factory — Shared Service Worker
// One sw.js registered with many scopes (one per /apps/<uuid>/).
// All registrations share the same IndexedDB.

const DB_NAME = 'pwa-factory';
const DB_VERSION = 1;

// ─── IndexedDB helpers ───────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('apps')) {
        db.createObjectStore('apps', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('content')) {
        db.createObjectStore('content', { keyPath: 'appId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Lifecycle events ────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ─── Fetch handler ───────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = self.registration.scope;
  const scopeURL = new URL(scope);
  const scopePath = scopeURL.pathname; // e.g. /repo/apps/<uuid>/

  // Extract app ID from scope
  const appIdMatch = scopePath.match(/\/apps\/([^/]+)/);
  if (!appIdMatch) return; // not our concern

  const appId = appIdMatch[1];

  // Route: manifest.json
  if (url.pathname.endsWith('/manifest.json')) {
    event.respondWith(serveManifest(appId, scopePath));
    return;
  }

  // Route: icons
  if (url.pathname.endsWith('/icon-192.png')) {
    event.respondWith(serveIcon(appId, 192));
    return;
  }
  if (url.pathname.endsWith('/icon-512.png')) {
    event.respondWith(serveIcon(appId, 512));
    return;
  }

  // Route: navigation requests → serve app HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(serveHTML(appId));
    return;
  }

  // Everything else: passthrough to network
});

// ─── Response generators ─────────────────────────────────────────────

async function serveHTML(appId) {
  try {
    const db = await openDB();
    const record = await dbGet(db, 'content', appId);
    db.close();
    if (!record) {
      return new Response('<h1>App not found</h1>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(record.html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    return new Response('<h1>Error loading app</h1><p>' + err.message + '</p>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

async function serveManifest(appId, scopePath) {
  try {
    const db = await openDB();
    const app = await dbGet(db, 'apps', appId);
    db.close();
    if (!app) {
      return new Response('{}', {
        status: 404,
        headers: { 'Content-Type': 'application/manifest+json' },
      });
    }
    const manifest = {
      id: scopePath,
      name: app.name,
      short_name: app.shortName,
      start_url: scopePath,
      scope: scopePath,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: app.themeColor,
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    };
    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { 'Content-Type': 'application/manifest+json' },
    });
  } catch (err) {
    return new Response('{}', {
      status: 500,
      headers: { 'Content-Type': 'application/manifest+json' },
    });
  }
}

async function serveIcon(appId, size) {
  try {
    const db = await openDB();
    const app = await dbGet(db, 'apps', appId);
    db.close();

    const color = (app && app.themeColor) || '#4285f4';
    const text = (app && app.iconText) || '?';

    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
    ctx.fillText(text, size / 2, size / 2);

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Response(blob, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  } catch (err) {
    // 1x1 transparent PNG fallback
    return new Response(new Uint8Array([
      0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,
      0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
      0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,0x00,0x00,0x00,
      0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x62,0x00,0x00,0x00,0x02,
      0x00,0x01,0xE5,0x27,0xDE,0xFC,0x00,0x00,0x00,0x00,0x49,0x45,
      0x4E,0x44,0xAE,0x42,0x60,0x82
    ]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  }
}
