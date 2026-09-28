// ── SERVICE WORKER · Web Push ──────────────────────────────────────────────
// Este archivo se copia tal cual a la raíz del build web (expo export), por eso
// no pasa por Babel. Debe ser JS plano ES5-compatible.
//
// Solo se activa en HTTPS o localhost: los navegadores rechazan registrar un
// service worker en http:// salvo en 127.0.0.1.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'UFT Eventos', body: event.data ? event.data.text() : '' };
  }

  const titulo = payload.title || 'UFT Eventos';
  const opciones = {
    body: payload.body || '',
    // El tag agrupa por conversación: si llegan varios mensajes seguidos del
    // mismo emisor, se reemplazan entre sí en lugar de apilarse.
    tag: payload.data && payload.data.roomId ? 'chat_' + payload.data.roomId : 'uft',
    renotify: true,
    icon: '/assets/images/favicon.png',
    badge: '/assets/images/favicon.png',
    data: payload.data || {},
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const urlDestino = data.roomId
    ? '/gestoreventos/admin/HomeAcademico?sala=' + encodeURIComponent(data.roomId)
    : '/gestoreventos/admin/HomeAcademico';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      // Si ya hay una pestaña abierta, se enfoca y se le avisa para que abra el
      // chat en vez de duplicar la ventana.
      for (const cliente of lista) {
        if ('focus' in cliente) {
          cliente.postMessage({ type: 'ABRIR_CHAT', roomId: data.roomId || null });
          return cliente.focus();
        }
      }
      return self.clients.openWindow(urlDestino);
    })
  );
});
