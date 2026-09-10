// ==========================================
// 📱 QUIZWIZZ SERVICE WORKER (Online-Only PWA)
// Caches UI shell ONLY. Quiz content always fetched live.
// ==========================================

const CACHE_NAME = 'quizwizz-shell-v1';
const API_DOMAINS = ['script.google.com', 'macros.google.com'];

// ✅ ONLY cache the UI shell (HTML/CSS/JS framework, NOT quiz data)
const SHELL_ASSETS = [
  '/',
  '/p/dnq-home.html',
  '/p/offer-zone.html',
  '/p/puzzle-hub-2.html',
  '/p/manifest.json'
];

// ─── INSTALL: Cache only the UI shell ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching UI shell only...');
        return cache.addAll(SHELL_ASSETS);
      })
      .catch(err => console.warn('Shell cache failed (non-fatal):', err))
  );
  self.skipWaiting();
});

// ─── ACTIVATE: Clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ─── FETCH: Smart routing ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 🚫 NEVER cache API calls (quiz questions, answers, submissions)
  if (API_DOMAINS.some(domain => url.hostname.includes(domain))) {
    // Network-only for all Apps Script calls
    return event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({
          success: false,
          error: 'OFFLINE',
          message: 'Please connect to internet to play quizzes.'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  }
  
  // 🚫 NEVER cache quiz content pages (they contain dynamic data)
  if (url.pathname.includes('sponsor-quest') || 
      url.pathname.includes('fake-vs-real') ||
      url.searchParams.has('testId') ||
      url.searchParams.has('campaignId')) {
    return event.respondWith(fetch(event.request));
  }
  
  // ✅ Cache-first ONLY for static UI shell pages
  if (SHELL_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          // Update cache in background
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
  
  // Default: Network only
  event.respondWith(fetch(event.request));
});

// ─── PUSH NOTIFICATIONS (For Prime Time reminders) ───────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '🎯 QuizWizz';
  const options = {
    body: data.body || 'Time to play!',
    icon: data.icon || '/p/icon-192.png',
    badge: '/p/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: data.actions || []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});