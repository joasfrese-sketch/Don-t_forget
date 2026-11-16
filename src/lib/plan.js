// Berechnet aus Notizen und Einstellungen, welche Benachrichtigungen das Gerät planen soll.
// Reine Funktion: nach jeder Änderung wird der ganze Plan neu berechnet (kein Merken, nichts veraltet).
import { followupTime } from './time.js';

const TITLE = "Don't forget";
const MAX_ENTRIES = 60;          // Android verträgt nur begrenzt viele geplante Alarme
const MAX_BODY = 180;
const DIGEST_BASE = 1_000_000_000; // Hinweis-IDs liegen über allen Notiz-IDs

const clip = (t) => (t.length > MAX_BODY ? t.slice(0, MAX_BODY - 1) + '…' : t);

export function planNotifications(notes, settings, now) {
  const open = notes
    .filter((n) => n.status === 'open')
    .map((n) => ({ n, t: new Date(n.remind_at).getTime() }))
    .filter(({ t }) => Number.isFinite(t));

  const out = [];
  for (const { n, t } of open) {
    if (t > now.getTime()) out.push({ id: n.nid, at: new Date(t), kind: 'reminder', title: TITLE, body: clip(n.text), noteId: n.id });
  }

  if (settings.followup_enabled) {
    const minutes = new Set();
    for (const { t } of open) {
      const f = followupTime(new Date(t), settings.timezone, settings.evening_from, settings.morning_at, settings.followup_hours);
      if (f.getTime() > now.getTime()) minutes.add(Math.floor(f.getTime() / 60000));
    }
    for (const minute of minutes) {
      const at = new Date(minute * 60000);
      const count = open.filter(({ t }) => t <= at.getTime()).length; // alles, was bis dahin fällig und noch offen ist
      const what = count === 1 ? '1 offene Erinnerung' : `${count} offene Erinnerungen`;
      out.push({ id: DIGEST_BASE + minute, at, kind: 'digest', title: TITLE, body: `Du hast noch ${what}. Schau in die App, was wann dran ist.` });
    }
  }

  return out.sort((a, b) => a.at - b.at || a.id - b.id).slice(0, MAX_ENTRIES);
}
