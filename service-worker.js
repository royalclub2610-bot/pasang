// Service worker minimal agar browser menganggap halaman ini dapat dipasang. Tidak menyimpan cache apa pun.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});
