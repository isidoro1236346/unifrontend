// ── WEB PUSH (service worker + VAPID) ──────────────────────────────────────
// Solo navegador. En móvil Expo el canal sigue siendo el socket, así que todo
// este módulo sale temprano cuando la plataforma no es web.
//
// El service worker vive en /sw.js y se sirve desde la raíz del build. Ojo:
// los service workers solo se registran bajo HTTPS o en localhost.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://unibackend-production-9618.up.railway.app';
const PUBLIC_VAPID_KEY = process.env.EXPO_PUBLIC_WEB_PUSH_PUBLIC_KEY || '';
const TOKEN_KEY = 'adminAuthToken';

const soportado = () =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'PushSubscription' in window;

const urlBase64AToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const getToken = async () => {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
};

const registrarServiceWorker = async () => {
  if (!soportado()) return null;
  // El baseUrl del build web es /gestoreventos, pero el service worker debe
  // registrarse desde la raíz del origen o no alcanza a controlar la app.
  const url = `${window.location.origin}/sw.js`;
  try {
    const registro = await navigator.serviceWorker.register(url, { scope: '/' });
    await navigator.serviceWorker.ready;
    return registro;
  } catch (e) {
    console.warn('[PUSH] No se pudo registrar el service worker:', e && e.message);
    return null;
  }
};

const pedirPermiso = async () => {
  if (!soportado()) return NotificationState.NO_SOPORTADO;
  if (typeof Notification === 'undefined') return NotificationState.NO_SOPORTADO;
  if (Notification.permission === 'denied') return NotificationState.DENEGADO;
  if (Notification.permission === 'granted') return NotificationState.PERMISO;

  try {
    // El navegador exige un gesto del usuario: llamar a requestPermission()
    // sin uno (por ejemplo al montar) se rechaza o se ignora.
    const permiso = await Notification.requestPermission();
    return permiso === 'granted' ? NotificationState.PERMISO : NotificationState.DENEGADO;
  } catch (e) {
    return NotificationState.DENEGADO;
  }
};

const suscripciónActual = async () => {
  if (!soportado()) return null;
  const registro = await navigator.serviceWorker.ready;
  return registro.pushManager.getSubscription();
};

const registrarSuscripcionEnBackend = async (subscription) => {
  const token = await getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/notificaciones/push/subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[PUSH] No se pudo registrar la suscripción:', e && e.message);
    return false;
  }
};

const eliminarSuscripcionEnBackend = async (endpoint) => {
  const token = await getToken();
  if (!token || !endpoint) return false;
  try {
    await fetch(`${API_BASE_URL}/notificaciones/push/subscription`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    });
    return true;
  } catch (e) {
    return false;
  }
};

export const NotificationState = {
  NO_SOPORTADO: 'no_soportado',
  DENEGADO: 'denegado',
  PERMISO: 'permitido',
  SIN_CONFIGURAR: 'sin_configurar',
  ERROR: 'error',
};

const urlABase64 = (url) => {
  const base64id = url.slice(url.lastIndexOf('/') + 1);
  return base64id.replace(/-/g, '+').replace(/_/g, '/');
};

/**
 * Activa las notificaciones. Se debe llamar desde un Pressable: sin un gesto
 * del usuario el navegador no concede el permiso.
 */
export const activarNotificaciones = async () => {
  if (!soportado()) {
    return { estado: NotificationState.NO_SOPORTADO };
  }
  if (!PUBLIC_VAPID_KEY) {
    console.warn('[PUSH] Falta EXPO_PUBLIC_WEB_PUSH_PUBLIC_KEY');
    return { estado: NotificationState.SIN_CONFIGURAR };
  }
  // En http:// (salvo localhost) el navegador no permite service workers.
  const segura =
    window.location.protocol === 'https:' ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!segura) {
    console.warn('[PUSH] Se necesita HTTPS para registrar el service worker');
    return { estado: NotificationState.NO_SOPORTADO };
  }

  const permiso = await pedirPermiso();
  if (permiso !== NotificationState.PERMISO) {
    return { estado: permiso };
  }

  const registro = await registrarServiceWorker();
  if (!registro) return { estado: NotificationState.ERROR };

  try {
    let subscription = await suscripciónActual();
    if (!subscription) {
      subscription = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64AToUint8Array(PUBLIC_VAPID_KEY),
      });
    }
    const ok = await registrarSuscripcionEnBackend(subscription);
    if (!ok) return { estado: NotificationState.ERROR };
    return { estado: NotificationState.PERMISO, subscription };
  } catch (e) {
    console.warn('[PUSH] Error al suscribir:', e && e.message);
    return { estado: NotificationState.ERROR };
  }
};

export const desactivarNotificaciones = async () => {
  if (!soportado()) return false;
  const subscription = await suscripciónActual();
  if (!subscription) return false;
  const endpoint = subscription.endpoint;
  await eliminarSuscripcionEnBackend(endpoint);
  await subscription.unsubscribe();
  return true;
};

/** Consulta el estado sin pedir permiso, para pintar el botón correctamente. */
export const estadoNotificaciones = async () => {
  if (!soportado()) return NotificationState.NO_SOPORTADO;
  if (typeof Notification === 'undefined') return NotificationState.NO_SOPORTADO;
  if (Notification.permission === 'denied') return NotificationState.DENEGADO;
  if (Notification.permission !== 'granted') return NotificationState.DENEGADO;
  const subscription = await suscripciónActual();
  return subscription ? NotificationState.PERMISO : NotificationState.DENEGADO;
};

/**
 * Escucha los mensajes del service worker. Cuando el usuario toca la
 * notificación con la app ya abierta, el SW avisa por aquí en vez de abrir una
 * pestaña nueva.
 */
export const escucharMensajesDelServiceWorker = (handler) => {
  if (!soportado()) return () => {};
  const listener = (event) => {
    const datos = event.data;
    if (!datos || datos.type !== 'ABRIR_CHAT') return;
    try {
      handler(datos);
    } catch (e) {
      // no romper el listener
    }
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
};

/** Igual que activarNotificaciones pero no vuelve a pedir permiso. */
export const sincronizarSuscripcion = async () => {
  if (!soportado()) return NotificationState.NO_SOPORTADO;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return NotificationState.DENEGADO;
  }
  const subscription = await suscripciónActual();
  if (!subscription) return NotificationState.DENEGADO;
  const ok = await registrarSuscripcionEnBackend(subscription);
  return ok ? NotificationState.PERMISO : NotificationState.ERROR;
};
