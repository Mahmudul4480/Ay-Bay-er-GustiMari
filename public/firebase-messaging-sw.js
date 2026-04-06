/* eslint-disable no-undef */
// Keep versions in sync with `firebase` in package.json (mismatched SW/app SDK breaks FCM web).
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB0TpWdNba9OkLieali8mmvYvjTLw8qhYA',
  authDomain: 'ay-bay-er-gustimari.firebaseapp.com',
  projectId: 'ay-bay-er-gustimari',
  storageBucket: 'ay-bay-er-gustimari.firebasestorage.app',
  messagingSenderId: '527277956714',
  appId: '1:527277956714:web:c5cf790b15f8715262b413',
});

const messaging = firebase.messaging();

const APP_ICON = 'https://i.postimg.cc/K8yGqVdy/logo-png.png';

// Handle messages received while app is in background / closed
messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || 'Ay Bay Er GustiMari';
  const body  = notification.body  || '';
  const url   = data.url || '/';

  return self.registration.showNotification(title, {
    body,
    icon: APP_ICON,
    badge: APP_ICON,
    tag: data.blogId || 'gustimari-notification',
    renotify: true,
    data: { url },
    actions: [
      { action: 'open', title: 'হিসাব দেখুন' },
      { action: 'dismiss', title: 'বাদ দিন' },
    ],
  });
});

// Handle notification click — deep-link to the blog URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if already open
        for (const client of clientList) {
          if ('focus' in client) {
            void client.focus();
            if ('navigate' in client) void client.navigate(targetUrl);
            return;
          }
        }
        // Open new window/tab
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
