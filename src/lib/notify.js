// Benachrichtigungen auf dem Gerät: der Plan (plan.js) wird beim Betriebssystem als Alarme angemeldet.
// Nach jeder Änderung wird alles neu geplant: erst alte Alarme entfernen, dann den neuen Plan setzen.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { planNotifications } from './plan.js';

const CHANNEL = 'reminders';
const ACTION_TYPE = 'reminder';

export function createNotifier(platform) {
  // Aufrufe laufen nacheinander, damit sich Entfernen und Planen nie überschneiden.
  let chain = Promise.resolve();
  const exclusive = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

  return {
    platform,
    init: () => (platform.init ? platform.init() : Promise.resolve()),

    sync: (notes, settings, now = new Date()) => exclusive(async () => {
      try {
        const permission = await platform.checkPermission();
        if (permission !== 'granted') return { scheduled: 0, reason: 'no-permission', permission };
        const plan = planNotifications(notes, settings, now);
        await platform.cancelAll();
        if (plan.length) await platform.schedule(plan);
        return { scheduled: plan.length };
      } catch (error) {
        return { scheduled: 0, reason: 'error', error };
      }
    }),

    status: async () => ({ permission: await platform.checkPermission(), exactAlarm: await platform.exactAlarmAllowed() }),
    requestPermission: () => platform.requestPermission(),
  };
}

// Hält die Alarme aktuell: bei jeder Änderung im Speicher wird neu geplant.
// Das Ergebnis jedes Planens geht an die Zuhörer (onResult), damit die Oberfläche „Erinnerungen sind aus“ zeigen kann.
export function attachSync(store, notifier, { now = () => new Date() } = {}) {
  let pending = Promise.resolve();
  let last = null;
  const listeners = new Set();
  const syncNow = () => {
    pending = pending
      .then(async () => {
        const result = await notifier.sync(await store.listNotes(), await store.getSettings(), now());
        last = result;
        for (const fn of listeners) { try { fn(result); } catch { /* ein Zuhörer darf nichts blockieren */ } }
        return result;
      })
      .catch(() => {});
    return pending;
  };
  const off = store.onChange(() => { syncNow(); });
  return {
    off, syncNow,
    idle: () => pending,
    lastResult: () => last,
    onResult: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// Hinweistext für die Hauptansicht, wenn Erinnerungen nicht ankommen können (sonst null).
export function noticeFor(result) {
  if (!result) return null;
  if (result.reason === 'no-permission') {
    return result.permission === 'denied' ? 'Erinnerungen sind aus: Benachrichtigungen sind blockiert.' : 'Erinnerungen sind noch nicht erlaubt.';
  }
  if (result.reason === 'error') return 'Erinnerungen konnten nicht geplant werden.';
  return null;
}

// Aktion aus einer Benachrichtigung: „Erledigt“, „Später“ oder Antippen.
export async function routeAction(actionId, extra, { store, navigate }) {
  try {
    const noteId = extra?.noteId;
    if (actionId === 'done' && noteId) await store.markDone(noteId);
    else if (actionId === 'snooze' && noteId) await store.snooze(noteId);
    else if (actionId === 'tap') navigate(extra?.kind === 'reminder' && noteId ? `#/n/${noteId}` : '#/');
  } catch { /* eine kaputte Benachrichtigung darf die App nicht stören */ }
}

// ---------- Plattformen ----------

// Android (und iOS): echte geplante Alarme, die auch bei geschlossener App kommen.
export function capacitorPlatform(LN = LocalNotifications) {
  return {
    isNative: true,
    async init() {
      await LN.createChannel({
        id: CHANNEL, name: 'Erinnerungen', description: 'Deine Erinnerungen und Hinweise auf offene Erinnerungen',
        importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#6b9bd8', // sichtbar auf dem Sperrbildschirm
      });
      await LN.registerActionTypes({ types: [{ id: ACTION_TYPE, actions: [{ id: 'done', title: 'Erledigt' }, { id: 'snooze', title: 'Später' }] }] });
    },
    checkPermission: async () => (await LN.checkPermissions()).display,
    requestPermission: async () => (await LN.requestPermissions()).display,
    async schedule(list) {
      // Ohne Erlaubnis für exakte Alarme (Android 12/12L) ungenau planen. Sonst öffnet das Plugin bei JEDEM Planen
      // die Einstellungsseite – und wir planen bei jeder Änderung und jedem Zurückkehren in die App.
      let exact = true;
      try { exact = (await LN.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch { exact = true; } // z. B. iOS
      await LN.schedule({
        notifications: list.map((n) => ({
          id: n.id, title: n.title, body: n.body, channelId: CHANNEL, isExactNotification: exact,
          schedule: { at: n.at, allowWhileIdle: true },
          actionTypeId: n.kind === 'reminder' ? ACTION_TYPE : undefined,
          extra: { noteId: n.noteId ?? null, kind: n.kind },
        })),
      });
    },
    async cancelAll() {
      const { notifications } = await LN.getPending();
      if (notifications.length) await LN.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
    },
    onAction(handler) {
      LN.addListener('localNotificationActionPerformed', (e) => handler(e.actionId, e.notification?.extra));
    },
    exactAlarmAllowed: async () => (await LN.checkExactNotificationSetting()).exact_alarm === 'granted',
    openExactAlarmSettings: () => LN.changeExactNotificationSetting(),
  };
}

// Browser (nur Entwicklung und Tests): Meldungen der nächsten 24 Stunden, solange die Seite offen ist.
export function browserPlatform() {
  let timers = [];
  const supported = () => typeof Notification !== 'undefined';
  const mapPermission = (p) => (p === 'default' ? 'prompt' : p);
  return {
    isNative: false,
    async init() {},
    checkPermission: async () => (supported() ? mapPermission(Notification.permission) : 'denied'),
    requestPermission: async () => (supported() ? mapPermission(await Notification.requestPermission()) : 'denied'),
    async schedule(list) {
      if (!supported()) return;
      const now = Date.now();
      for (const n of list) {
        const delay = n.at.getTime() - now;
        if (delay > 0 && delay <= 24 * 3600e3) {
          timers.push(setTimeout(() => { try { new Notification(n.title, { body: n.body }); } catch { /* ignorieren */ } }, delay));
        }
      }
    },
    async cancelAll() { timers.forEach(clearTimeout); timers = []; },
    onAction() {},
    exactAlarmAllowed: async () => true,
    openExactAlarmSettings: async () => {},
  };
}

export const defaultPlatform = () => (Capacitor.isNativePlatform() ? capacitorPlatform() : browserPlatform());
