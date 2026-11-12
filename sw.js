/**
 * SmartFinance PWA - Service Worker v7.5
 * Estrategia: Cache-First para App Shell / Network-Only para APIs y Supabase
 */

const CACHE_NAME = 'smartfinance-cache-v7.5';

// Recursos estáticos locales y librerías CDN indispensables para arranque offline
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=7.5',
    './js/app.js?v=7.5',
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

// Dominios que NUNCA deben pasar por caché bajo ninguna circunstancia
const NETWORK_ONLY_PATTERNS = [
    'supabase.co',
    'dolarapi.com',
    'identitytoolkit.googleapis.com'
];

// Instalación: Precaching de componentes base
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activación: Purga inmediata de versiones anteriores de caché
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

// Interceptor de peticiones de red
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Omitir peticiones que no sean GET (POST/PUT/DELETE directos a Supabase o encolados)
    if (request.method !== 'GET') {
        return;
    }

    // 2. Bypass total para Supabase (Auth/PostgREST/Realtime) y API Macro en vivo
    const isNetworkOnly = NETWORK_ONLY_PATTERNS.some(domain => url.hostname.includes(domain));
    if (isNetworkOnly) {
        event.respondWith(fetch(request));
        return;
    }

    // 3. Navegación principal (HTML): Network-First con fallback a caché offline
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

    // 4. Recursos estáticos (JS, CSS, Fuentes, Iconos): Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Silencia errores en caso de falta de conexión si el recurso ya está en caché
            });

            return cachedResponse || fetchPromise;
        })
    );
});
