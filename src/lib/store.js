// Notizen und Einstellungen auf dem Gerät (ersetzt die frühere Cloud-Datenbank).
export const DEFAULTS = {
  default_time: '17:00',
  followup_enabled: true,
  followup_hours: 5,
  evening_from: '18:00',
  morning_at: '08:00',
  ai_key: '',
};
const KEYS = { notes: 'dtf.notes', settings: 'dtf.settings', counter: 'dtf.counter' };
const HHMM = /^\d{2}:\d{2}/;
const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'; } catch { return 'Europe/Berlin'; } };

const time = (v, fallback) => (typeof v === 'string' && HHMM.test(v) ? v.slice(0, 5) : fallback);

// Macht aus beliebigen (auch kaputten) Daten gültige Einstellungen; fehlende oder falsche Felder bekommen Vorgaben.
export function normalizeSettings(raw, zone = deviceZone()) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    default_time: time(r.default_time, DEFAULTS.default_time),
    timezone: zone, // immer die Zone des Geräts (auch nach einer Reise), nie eine gespeicherte
    followup_enabled: typeof r.followup_enabled === 'boolean' ? r.followup_enabled : DEFAULTS.followup_enabled,
    followup_hours: Number.isInteger(r.followup_hours) && r.followup_hours >= 1 && r.followup_hours <= 24 ? r.followup_hours : DEFAULTS.followup_hours,
    evening_from: time(r.evening_from, DEFAULTS.evening_from),
    morning_at: time(r.morning_at, DEFAULTS.morning_at),
    ai_key: typeof r.ai_key === 'string' ? r.ai_key : '',
  };
}

const validIso = (s) => typeof s === 'string' && !Number.isNaN(new Date(s).getTime());
function normalizeNotes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n) => n && typeof n === 'object' && typeof n.id === 'string' && Number.isInteger(n.nid) && typeof n.text === 'string' && n.text.trim() && validIso(n.remind_at))
    .map((n) => ({
      id: n.id, nid: n.nid, text: n.text, remind_at: new Date(n.remind_at).toISOString(),
      custom_time: n.custom_time === true, status: n.status === 'done' ? 'done' : 'open',
      created_at: validIso(n.created_at) ? n.created_at : new Date(n.remind_at).toISOString(),
      updated_at: validIso(n.updated_at) ? n.updated_at : new Date(n.remind_at).toISOString(),
    }));
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const cleanText = (t) => {
  const s = String(t ?? '').trim();
  if (!s) throw new Error('Text darf nicht leer sein');
  return s;
};

export function createStore(storage, { now = () => new Date(), tz } = {}) {
  const zone = tz || deviceZone();
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) { try { fn(); } catch { /* ein Zuhörer darf nichts blockieren */ } } };

  // Schreibzugriffe nacheinander, damit gleichzeitige Änderungen nichts überschreiben.
  let chain = Promise.resolve();
  const exclusive = (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };

  async function readJson(key) {
    try { const s = await storage.get(key); return s == null ? null : JSON.parse(s); } catch { return null; }
  }
  const readNotes = async () => normalizeNotes(await readJson(KEYS.notes));
  const writeNotes = (notes) => storage.set(KEYS.notes, JSON.stringify(notes));
  const readSettings = async () => normalizeSettings(await readJson(KEYS.settings), zone);
  const sorted = (notes) => [...notes].sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));

  async function change(id, patch) {
    return exclusive(async () => {
      const notes = await readNotes();
      const i = notes.findIndex((n) => n.id === id);
      if (i < 0) return undefined;
      const next = { ...notes[i], ...patch, updated_at: now().toISOString() };
      notes[i] = next;
      await writeNotes(notes);
      emit();
      return next;
    });
  }

  return {
    getSettings: readSettings,

    saveSettings: (patch) => exclusive(async () => {
      const current = await readSettings();
      const allowed = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => k in DEFAULTS));
      const next = normalizeSettings({ ...current, ...allowed }, zone);
      const { timezone: _zone, ...persist } = next; // die Zone wird nicht gespeichert
      await storage.set(KEYS.settings, JSON.stringify(persist));
      emit();
      return next;
    }),

    listNotes: async () => sorted(await readNotes()),

    createNote: (text, remindAt, custom) => exclusive(async () => {
      const clean = cleanText(text);
      const notes = await readNotes();
      const counter = Number.parseInt((await storage.get(KEYS.counter)) ?? '0', 10);
      const nid = Math.max(Number.isInteger(counter) ? counter : 0, ...notes.map((n) => n.nid)) + 1;
      const stamp = now().toISOString();
      const note = { id: newId(), nid, text: clean, remind_at: new Date(remindAt).toISOString(), custom_time: !!custom, status: 'open', created_at: stamp, updated_at: stamp };
      await storage.set(KEYS.counter, String(nid));
      await writeNotes([...notes, note]);
      emit();
      return note;
    }),

    updateNote: async (id, patch) => {
      const p = {};
      if ('text' in patch) p.text = cleanText(patch.text);
      if ('remind_at' in patch) p.remind_at = new Date(patch.remind_at).toISOString();
      if ('custom_time' in patch) p.custom_time = !!patch.custom_time;
      if ('status' in patch) p.status = patch.status === 'done' ? 'done' : 'open';
      return change(id, p);
    },

    markDone: async (id) => { await change(id, { status: 'done' }); },
    reopen: async (id, remindAt) => { await change(id, { status: 'open', remind_at: new Date(remindAt).toISOString() }); },
    snooze: async (id) => { await change(id, { remind_at: new Date(now().getTime() + 3600e3).toISOString() }); },

    deleteNote: (id) => exclusive(async () => {
      const notes = await readNotes();
      const rest = notes.filter((n) => n.id !== id);
      if (rest.length === notes.length) return;
      await writeNotes(rest);
      emit();
    }),

    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
