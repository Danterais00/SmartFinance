/**
 * SmartFinance PWA - Service Worker v7.8
 * Estrategia: Cache-First para App Shell / Network-Only para APIs y Supabase
 */

const CACHE_NAME = 'smartfinance-cache-v7.8';

const STATIC_ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=7.8',
    './js/app.js?v=7.8',
    './js/state.js',
    './js/financeEngine.js',
    './js/charts.js',
    './js/statementImporter.js',
    './js/pdfReport.js',
    './js/changelog.js',
    './js/supabaseClient.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/hammerjs@2.0.8',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

const NETWORK_ONLY_PATTERNS = [
    'supabase.co',
    'dolarapi.com',
    'identitytoolkit.googleapis.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            const localAssets = STATIC_ASSETS.filter(url => url.startsWith('./'));
            const cdnAssets = STATIC_ASSETS.filter(url => url.startsWith('http'));
            
            const localPromise = cache.addAll(localAssets);
            
            const cdnPromises = cdnAssets.map(url => 
                fetch(url).then(res => {
                    if (res.ok) cache.put(url, res);
                }).catch(err => console.warn('CDN offline during install:', url))
            );
            
            return Promise.all([localPromise, ...cdnPromises]);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return;
    }

    const isNetworkOnly = NETWORK_ONLY_PATTERNS.some(domain => url.hostname.includes(domain));
    if (isNetworkOnly) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {});

            return cachedResponse || fetchPromise;
        })
    );
});
