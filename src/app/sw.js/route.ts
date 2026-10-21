/**
 * The service worker for the installed app. It caches nothing: every page and
 * API call goes to the server, so the app always shows live history. It only
 * replaces the browser's error page with a friendly one when offline.
 */

export const dynamic = 'force-static';

const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · IT Desk</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
         background: #fff; color: #18181b; }
  @media (prefers-color-scheme: dark) { body { background: #09090b; color: #f4f4f5; } p { color: #a1a1aa; } }
  main { text-align: center; padding: 24px; max-width: 360px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #71717a; margin: 0 0 20px; }
  button { font: inherit; padding: 8px 18px; border-radius: 999px; border: 0; background: #18181b; color: #fff; cursor: pointer; }
  @media (prefers-color-scheme: dark) { button { background: #fff; color: #18181b; } }
</style></head>
<body><main>
  <h1>Can't reach IT Desk</h1>
  <p>Check your internet connection. Your history is safe on the server.</p>
  <button onclick="location.reload()">Try again</button>
</main></body></html>`;

const WORKER = `
const OFFLINE_PAGE = ${JSON.stringify(OFFLINE_PAGE)};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // Only page loads get a fallback; everything else goes straight to the network.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
`;

export function GET() {
  return new Response(WORKER, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Always re-checked, so a new version takes effect on the next launch.
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
