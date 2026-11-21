/* global self */
// Minimal service worker: it makes the app installable. Pages and API calls
// always go to the network, so a deploy is never masked by a stale cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
