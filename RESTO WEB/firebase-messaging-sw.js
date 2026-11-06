importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBzoxfzK08tG7at5XLn31PbHfJDEBMxteU",
  authDomain: "resto-95dfd.firebaseapp.com",
  projectId: "resto-95dfd",
  storageBucket: "resto-95dfd.firebasestorage.app",
  messagingSenderId: "793927799498",
  appId: "1:793927799498:web:a89bb52c9cd39fc96b5a33",
});

const messaging = firebase.messaging();
const defaultNotificationUrl = new URL("/#infos", self.location.origin).href;

function safeNotificationUrl(value) {
  try {
    const url = new URL(value || defaultNotificationUrl, self.location.origin);
    return url.origin === self.location.origin ? url.href : defaultNotificationUrl;
  } catch {
    return defaultNotificationUrl;
  }
}

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "LAUR&DOR";
  const body = notification.body || data.body || "Une nouvelle actualité vous attend.";

  return self.registration.showNotification(title, {
    body,
    icon: "/assets/resto-icon-192.png",
    badge: "/assets/resto-icon-192.png",
    data: { url: safeNotificationUrl(data.url) },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data && event.notification.data.url;
  if (!requestedUrl) return;

  const destination = safeNotificationUrl(requestedUrl);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const client = windows.find((windowClient) =>
      new URL(windowClient.url).origin === self.location.origin,
    );
    if (client) {
      if (client.url !== destination && "navigate" in client) {
        await client.navigate(destination);
      }
      return client.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
