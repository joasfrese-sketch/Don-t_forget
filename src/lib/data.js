// Datenzugriff auf Supabase: Einstellungen, Notizen, Realtime.
import { supabase, unwrap } from './supabase.js';

export const DEFAULTS = {
  default_time: '17:00', timezone: 'Europe/Berlin',
  followup_enabled: true, followup_hours: 5, evening_from: '18:00', morning_at: '08:00',
};
const COLUMNS = Object.keys(DEFAULTS).join(', ');

async function uid() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Nicht angemeldet');
  return data.user.id;
}

const hhmm = (v, fallback) => (v ? String(v).slice(0, 5) : fallback);
// Fehlende Felder (z. B. ältere Zeile) kommen aus den Vorgaben; Zeiten werden auf HH:MM gekürzt.
const normSettings = (s) => ({
  default_time: hhmm(s.default_time, DEFAULTS.default_time),
  timezone: s.timezone || DEFAULTS.timezone,
  followup_enabled: s.followup_enabled ?? DEFAULTS.followup_enabled,
  followup_hours: s.followup_hours ?? DEFAULTS.followup_hours,
  evening_from: hhmm(s.evening_from, DEFAULTS.evening_from),
  morning_at: hhmm(s.morning_at, DEFAULTS.morning_at),
});

export async function getSettings() {
  const user_id = await uid();
  const row = unwrap(await supabase.from('user_settings').select(COLUMNS).eq('user_id', user_id).maybeSingle());
  if (row) return normSettings(row);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULTS.timezone;
  const created = unwrap(await supabase.from('user_settings')
    .upsert({ user_id, default_time: DEFAULTS.default_time, timezone }).select(COLUMNS).single());
  return normSettings(created);
}

// Schreibt nur die übergebenen Felder.
export async function saveSettings(patch) {
  const user_id = await uid();
  unwrap(await supabase.from('user_settings').upsert({ user_id, ...patch }));
}

export async function listNotes() {
  return unwrap(await supabase.from('notes').select('*').order('remind_at'));
}

export async function createNote(text, remindAt, customTime) {
  return unwrap(await supabase.from('notes')
    .insert({ text: text.trim(), remind_at: remindAt.toISOString(), custom_time: customTime }).select().single());
}

export async function updateNote(id, patch) {
  return unwrap(await supabase.from('notes').update(patch).eq('id', id).select().single());
}

export const markDone = (id) => updateNote(id, { status: 'done' });
export const reopen = (id, remindAt) => updateNote(id, { status: 'open', remind_at: remindAt.toISOString() });
export const snooze = (id) => updateNote(id, { remind_at: new Date(Date.now() + 3600e3).toISOString() });

export async function deleteNote(id) {
  unwrap(await supabase.from('notes').delete().eq('id', id));
}

export async function subscribeNotes(onChange) {
  const user_id = await uid();
  const ch = supabase.channel('notes-' + user_id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${user_id}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
