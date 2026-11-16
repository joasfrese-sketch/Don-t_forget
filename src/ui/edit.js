// Bearbeiten einer Notiz (als Dialog).
import { updateNote, markDone, reopen, deleteNote } from '../lib/data.js';
import { defaultRemindAt, toLocalInputValue, zonedToUtc } from '../lib/time.js';
import { $, esc, toast } from './util.js';
import { openDialog } from './dialog.js';

export function openEdit(note, settings, onSaved) {
  const tz = settings.timezone;
  const done = note.status === 'done';
  const dlg = openDialog(`
    <form method="dialog" id="editForm" class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Notiz</h2>
      <textarea id="eText" rows="3" class="field resize-none">${esc(note.text)}</textarea>
      <label class="flex flex-col gap-1 text-sm text-stone-500">Erinnerung
        <input id="eWhen" type="datetime-local" required class="field" value="${toLocalInputValue(new Date(note.remind_at), tz)}" ${done ? 'disabled' : ''} />
      </label>
      <div class="mt-2 flex flex-wrap gap-2">
        <button value="save" class="btn-primary flex-1">Speichern</button>
        <button type="button" id="eToggle" class="btn-ghost">${done ? 'Wieder öffnen' : '✓ Erledigt'}</button>
        <button type="button" id="eDelete" class="btn-ghost text-red-600">Löschen</button>
      </div>
    </form>`);

  const run = async (fn, msg) => {
    try { await fn(); dlg.close(); toast(msg); onSaved(); } catch (e) { toast(e.message); }
  };

  $('#editForm', dlg).addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#eText', dlg).value.trim();
    if (!text) return toast('Text darf nicht leer sein');
    const patch = { text };
    if (!done) {
      const [d, t] = $('#eWhen', dlg).value.split('T');
      const at = zonedToUtc(d, t, tz);
      if (at.getTime() !== new Date(note.remind_at).getTime()) Object.assign(patch, { remind_at: at.toISOString(), custom_time: true });
    }
    run(() => updateNote(note.id, patch), 'Gespeichert');
  });

  $('#eToggle', dlg).addEventListener('click', () => {
    if (done) run(() => reopen(note.id, defaultRemindAt(new Date(), settings.default_time, tz)), 'Wieder offen');
    else run(() => markDone(note.id), 'Erledigt');
  });

  $('#eDelete', dlg).addEventListener('click', () => {
    if (confirm('Notiz wirklich löschen?')) run(() => deleteNote(note.id), 'Gelöscht');
  });
}
