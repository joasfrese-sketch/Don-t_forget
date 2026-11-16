// Speicher auf dem Gerät. Eine kleine, austauschbare Schicht, damit Tests ohne Gerät laufen.
import { Preferences } from '@capacitor/preferences';

// Für Tests: alles im Arbeitsspeicher.
export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get: async (key) => (m.has(key) ? m.get(key) : null),
    set: async (key, value) => { m.set(key, String(value)); },
    remove: async (key) => { m.delete(key); },
  };
}

// Echt: Capacitor Preferences (Android: SharedPreferences, Browser: localStorage). Fehler werden geschluckt,
// damit eine blockierte Speicherung die App nicht abstürzen lässt.
export function defaultStorage() {
  return {
    get: async (key) => {
      try { return (await Preferences.get({ key })).value ?? null; } catch { return null; }
    },
    set: async (key, value) => { await Preferences.set({ key, value: String(value) }); },
    remove: async (key) => { try { await Preferences.remove({ key }); } catch { /* nichts zu tun */ } },
  };
}
