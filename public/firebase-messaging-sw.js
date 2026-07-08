/* Service worker for Firebase Cloud Messaging (Angular app; assets from repo /public).
 * API sends data-only at message root for Web (no duplicate system notification); title/body are in payload.data. */
// Version: 2.1
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

self.addEventListener('install', function (event) {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(
    self.clients.claim().then(function () {
      return self.registration.update();
    })
  );
});

firebase.initializeApp({"apiKey":"AIzaSyB5_oJxsXsi7nuJiYhV1c3vJGQrIc05ZGw","authDomain":"moving-mate-24fc3.firebaseapp.com","projectId":"moving-mate-24fc3","storageBucket":"moving-mate-24fc3.appspot.com","messagingSenderId":"498646906372","appId":"1:498646906372:web:e0c27b35260dc5fc32e751"});
var fbMessaging = firebase.messaging();
fbMessaging.onBackgroundMessage(function () { /* handled by raw push listener */ });

self.addEventListener('push', function (event) {
  event.waitUntil(
    (function () {
      var data = {};
      try {
        if (event.data) {
          var payload = event.data.json();
          data = payload.data || payload;
        }
      } catch (e) {
        console.warn('[SW] push parse error:', e);
      }

      var title   = String(data.title || 'Moving Mate');
      // Stable tag replaces prior notification for same logical event (reduces duplicate banners).
      var typeKey = String(data.type || 'general');
      var orderKey = String(data.orderId || data.order_id || '').trim();
      var urlKey = String(data.url || '').trim().slice(0, 80);
      var notifTag =
        typeKey + (orderKey ? ':' + orderKey : '') + (urlKey ? ':' + urlKey : '') || 'moving-mate';
      var options = {
        body:    String(data.body || 'You have a new notification'),
        icon:    '/favicon.png',
        badge:   '/favicon.png',
        vibrate: [200, 100, 200],
        tag:     'mm-' + notifTag.slice(0, 120),
        data:    data,
        renotify: true,
      };

      return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function (clientList) {
          var focused = clientList.some(function (c) { return c.focused; });
          // Skip OS notification when a tab is focused; foreground onMessage shows in-app toast.
          if (focused) return;
          return self.registration.showNotification(title, options)
            .catch(function (err) {
              console.error('[SW] showNotification failed:', err);
              return self.registration.showNotification('Moving Mate', {
                body:  'You have a new notification',
                icon:  '/favicon.png',
                badge: '/favicon.png',
                tag:   'moving-mate-fallback-' + Date.now(),
              });
            });
        });
    })()
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url.indexOf(self.location.origin) !== -1 && 'focus' in c) {
          return ('navigate' in c ? c.navigate(targetUrl) : Promise.resolve(c))
            .then(function (focused) { return focused && focused.focus ? focused.focus() : null; });
        }
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : null;
    })
  );
});
