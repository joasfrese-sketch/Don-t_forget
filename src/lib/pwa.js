// Web-App (iPad/Browser): Service Worker anmelden. Nicht in der Android- und Windows-App.
import { Capacitor } from '@capacitor/core';

export function registerServiceWorker() {
  if (globalThis.dtfDesktop || Capacitor.isNativePlatform()) return Promise.resolve(null);
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return Promise.resolve(null);
  return navigator.serviceWorker.register('./sw.js').catch(() => null);
}
