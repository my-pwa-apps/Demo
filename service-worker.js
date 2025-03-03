const CACHE_NAME = 'garfield-comics-cache-v2';
const COMIC_CACHE = 'garfield-comics-images-v1';

const urlsToCache = [
    '/',
    '/index.html',
    '/main.css',
    '/main.js',
    '/api.js',
    'https://upload.wikimedia.org/wikipedia/en/thumb/b/bc/Garfield_the_Cat.svg/1200px-Garfield_the_Cat.svg.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-database-compat.js',
    'https://www.gstatic.com/firebasejs/9.17.1/firebase-functions-compat.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME)
                .then(cache => cache.addAll(urlsToCache))
                .catch(error => console.error('Failed to cache resources:', error)),
            caches.open(COMIC_CACHE)
        ])
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Special handling for comic images
    if (url.href.includes('gocomics.com') || 
        url.href.includes('assets.amuniversal.com') || 
        url.href.includes('allorigins.win')) {
        
        event.respondWith(
            // Try the cache first
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        // Return cached version and update cache in background
                        const fetchPromise = fetch(event.request)
                            .then(networkResponse => {
                                if (networkResponse && networkResponse.ok) {
                                    const clonedResponse = networkResponse.clone();
                                    caches.open(COMIC_CACHE).then(cache => {
                                        cache.put(event.request, clonedResponse);
                                    });
                                }
                                return networkResponse;
                            })
                            .catch(() => {});
                            
                        // Return cached version immediately
                        return response;
                    }
                    
                    // If not in cache, get from network
                    return fetch(event.request)
                        .then(networkResponse => {
                            // Don't cache if response is not ok or if request method is not GET
                            if (!networkResponse || !networkResponse.ok || event.request.method !== 'GET') {
                                return networkResponse;
                            }
                            
                            // Clone the response before using it
                            const responseToCache = networkResponse.clone();
                            
                            caches.open(COMIC_CACHE)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                                
                            return networkResponse;
                        });
                })
        );
    } else {
        // Standard caching strategy for other resources
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request)
                        .then(response => {
                            // Cache successful responses except for API calls and non-GET requests
                            if (response && response.ok && !url.href.includes('api.') && event.request.method === 'GET') {
                                const responseToCache = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => {
                                        cache.put(event.request, responseToCache);
                                    });
                            }
                            return response;
                        });
                })
        );
    }
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('push', event => {
    const data = event.data.json();
    const title = data.title;
    const options = {
        body: data.body,
        icon: data.icon,
        tag: data.tag
    };
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
