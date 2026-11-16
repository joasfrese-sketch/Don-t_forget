// Push-Abo dieses Geräts verwalten (Vorlage: Lagerverwaltung).
import { supabase, unwrap } from './supabase.js';

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const SW_URL = '/sw.js?fn=' + encodeURIComponent(import.meta.env.VITE_SUPABASE_URL + '/functions/v1');

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushConfigured = () => !!KEY;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const toBytes = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try { await navigator.serviceWorker.register(SW_URL); } catch (e) { console.warn('SW:', e); }
  }
}

export async function pushActive() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && (await reg.pushManager.getSubscription()));
}

export async function enablePush() {
  if (isIOS() && !isStandalone()) throw new Error('Auf dem iPad zuerst über Teilen → „Zum Home-Bildschirm“ installieren.');
  if (!pushSupported()) throw new Error('Benachrichtigungen werden in diesem Browser nicht unterstützt.');
  if (!KEY) throw new Error('VAPID-Schlüssel fehlt (VITE_VAPID_PUBLIC_KEY).');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) }));
  const j = sub.toJSON();
  const { data } = await supabase.auth.getUser();
  // evtl. altes Abo desselben Geräts entfernen, dann neu speichern
  await supabase.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  unwrap(await supabase.from('push_subscriptions').insert({ user_id: data.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }));
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
