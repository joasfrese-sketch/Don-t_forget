'use strict';
// Planer für den Windows-Hauptprozess: bekommt die Liste der Benachrichtigungen aus der App und zeigt fällige zur Zeit an.
// Reine Logik ohne Electron, damit sie getestet werden kann. `tick()` wird regelmäßig aufgerufen (auch nach dem Ruhezustand).

const SIX_HOURS = 6 * 3600e3;
const keyOf = (e) => `${e.id}@${e.atMs}`;
const isValid = (e) => !!e && typeof e === 'object' && Number.isFinite(e.id) && Number.isFinite(e.atMs) && typeof e.title === 'string' && typeof e.body === 'string';

function createScheduler({ now = () => Date.now(), show, loadShown, saveShown, catchUpMs = SIX_HOURS }) {
  let plan = [];
  const shown = new Set();
  try {
    const stored = loadShown();
    if (Array.isArray(stored)) for (const k of stored) if (typeof k === 'string') shown.add(k);
  } catch { /* kaputte oder fehlende Datei: leer anfangen */ }

  const persist = () => { try { saveShown([...shown]); } catch { /* Platte voll o. Ä.: weiterlaufen */ } };

  return {
    // Ersetzt den Plan. Was in der App erledigt, verschoben oder gelöscht wurde, ist danach nicht mehr dabei.
    set(list) {
      plan = (Array.isArray(list) ? list : []).filter(isValid).map((e) => ({ ...e }));
      // Gemerktes aufräumen: Schlüssel, die älter als die Nachhol-Grenze sind, werden nie wieder gebraucht.
      const limit = now() - catchUpMs;
      let changed = false;
      for (const key of [...shown]) {
        const at = Number(key.split('@')[1]);
        if (!Number.isFinite(at) || at < limit) { shown.delete(key); changed = true; }
      }
      if (changed) persist();
    },
    cancelAll() { plan = []; },

    // Zeigt alles Fällige genau einmal. Verpasstes (bis `catchUpMs` zurück) kommt nach, Älteres wird still verworfen.
    tick() {
      const t = now();
      const due = plan.filter((e) => e.atMs <= t).sort((a, b) => a.atMs - b.atMs || a.id - b.id);
      let added = false;
      for (const e of due) {
        const key = keyOf(e);
        if (shown.has(key) || t - e.atMs > catchUpMs) continue;
        shown.add(key); // vor dem Zeigen merken: ein Fehler beim Zeigen darf nicht bei jedem Takt wiederholt werden
        added = true;
        try { show(e); } catch { /* eine kaputte Nachricht verhindert die nächste nicht */ }
      }
      if (added) persist();
    },
  };
}

module.exports = { createScheduler, SIX_HOURS };
