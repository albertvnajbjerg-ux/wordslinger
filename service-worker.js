const CACHE_NAME = 'wordslinger-v6';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Install: cache all core files. Each file is cached individually so that
// one failed request does not stop the rest from being saved.
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(
                ASSETS.map(url => cache.add(url).catch(() => {}))
            ))
            .then(() => self.skipWaiting())
    );
});

// Activate: remove old caches and take control of open pages.
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Fetch: try the network first so updates always show right away.
// When offline, fall back to the cached copy so the app still works.
self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;

    e.respondWith(
        fetch(req).then(res => {
            if (res && res.ok && req.url.startsWith(self.location.origin)) {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
            }
            return res;
        }).catch(() =>
            caches.match(req).then(c => c || caches.match('./index.html'))
        )
    );
});
