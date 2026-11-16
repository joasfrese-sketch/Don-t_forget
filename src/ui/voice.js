// Mikrofon (🎤) und ✨ neben dem Eingabefeld, dazu die Vorschau, bevor etwas gespeichert wird.
import { createNote } from '../lib/data.js';
import { parseNotes } from '../lib/ai.js';
import { resolveParsed } from '../lib/resolve-parsed.js';
import { speechSupported, startListening, speechErrorMessage } from '../lib/speech.js';
import { formatWhen, toLocalInputValue, zonedToUtc } from '../lib/time.js';
import { $, esc, toast } from './util.js';
import { openDialog } from './dialog.js';

export function mountVoice(root, { input, getSettings, onSaved }) {
  const row = input.parentElement;
  const submit = row.querySelector('button:not([type="button"])');
  const aiBtn = document.createElement('button');
  aiBtn.type = 'button'; aiBtn.id = 'aiBtn'; aiBtn.className = 'btn-ghost px-3 disabled:opacity-40';
  aiBtn.title = 'Claude macht daraus einen Termin'; aiBtn.setAttribute('aria-label', 'Mit Claude verstehen'); aiBtn.textContent = '✨';
  submit.before(aiBtn);

  let micBtn = null;
  if (speechSupported()) {
    micBtn = document.createElement('button');
    micBtn.type = 'button'; micBtn.id = 'micBtn';
    micBtn.className = 'btn-ghost px-3 aria-pressed:bg-brand aria-pressed:text-on-brand';
    micBtn.title = 'Sprechen'; micBtn.setAttribute('aria-label', 'Sprechen'); micBtn.setAttribute('aria-pressed', 'false'); micBtn.textContent = '🎤';
    aiBtn.before(micBtn);
  }

  let busy = false;
  const updateAi = () => { aiBtn.disabled = busy || !input.value.trim(); };
  input.addEventListener('input', updateAi);
  updateAi();

  async function understand(text) {
    busy = true; updateAi(); toast('Claude versteht …');
    try {
      const settings = getSettings();
      const notes = await parseNotes(text, settings);
      if (!notes.length) return toast('Daraus konnte ich keinen Termin machen. Bitte tippen.');
      openPreview(resolveParsed(notes, new Date(), settings));
    } catch (e) {
      toast(e.message);
    } finally { busy = false; updateAi(); }
  }

  aiBtn.addEventListener('click', () => { const t = input.value.trim(); if (t) understand(t); });

  if (micBtn) {
    let handle = null;
    micBtn.addEventListener('click', () => {
      if (handle) return handle.stop(); // zweiter Tipp beendet das Zuhören
      let failed = false;
      micBtn.setAttribute('aria-pressed', 'true');
      handle = startListening({
        onText: (t) => { input.value = t; updateAi(); },
        onError: (code) => { failed = true; const m = speechErrorMessage(code); if (m) toast(m); },
        onEnd: () => {
          handle = null;
          micBtn.setAttribute('aria-pressed', 'false');
          const t = input.value.trim();
          if (!failed && t) understand(t); // bei Fehlern bleibt der Text einfach im Feld
        },
      });
    });
  }

  function openPreview(items) {
    const settings = getSettings();
    const tz = settings.timezone;
    const dlg = openDialog(`
      <div class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Das würde ich speichern</h2>
        <ul id="previewList" class="flex flex-col gap-3"></ul>
        <div class="flex gap-2">
          <button id="previewSave" class="btn-primary flex-1">Speichern</button>
          <button id="previewCancel" class="btn-ghost">Abbrechen</button>
        </div>
      </div>`);
    const list = $('#previewList', dlg);

    const render = () => {
      const now = new Date();
      list.innerHTML = items.map((it, i) => `
        <li data-row="${i}" class="flex flex-col gap-2 rounded-xl border border-line p-3">
          <div class="flex gap-2">
            <input data-field="text" data-i="${i}" class="field" maxlength="200" value="${esc(it.text)}" />
            <button type="button" data-remove="${i}" class="btn-ghost shrink-0" aria-label="Entfernen">✕</button>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>🔔 ${esc(formatWhen(it.remindAt, now, tz))}</span>
            <input data-field="when" data-i="${i}" type="datetime-local" class="field w-auto py-1 text-sm" value="${toLocalInputValue(it.remindAt, tz)}" />
          </div>
          ${it.adjusted ? '<p class="text-xs text-danger">Die Zeit lag in der Vergangenheit und wurde auf die nächste Standardzeit gesetzt.</p>' : ''}
        </li>`).join('');
      $('#previewSave', dlg).disabled = items.length === 0;
    };
    render();

    list.addEventListener('input', (e) => {
      if (e.target.dataset.field === 'text') items[+e.target.dataset.i].text = e.target.value; // kein Neuzeichnen: Fokus bleibt
    });
    list.addEventListener('change', (e) => {
      if (e.target.dataset.field !== 'when' || !e.target.value) return;
      const [d, t] = e.target.value.split('T');
      Object.assign(items[+e.target.dataset.i], { remindAt: zonedToUtc(d, t, tz), custom: true, adjusted: false });
      render();
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (b) { items.splice(+b.dataset.remove, 1); render(); }
    });

    $('#previewCancel', dlg).addEventListener('click', () => dlg.close()); // Text bleibt im Feld
    $('#previewSave', dlg).addEventListener('click', async (e) => {
      if (items.some((it) => !it.text.trim())) return toast('Text darf nicht leer sein');
      e.target.disabled = true;
      let saved = 0;
      try {
        while (items.length) {
          const it = items[0];
          await createNote(it.text.trim(), it.remindAt, it.custom);
          items.shift(); saved++;
        }
      } catch (err) {
        toast('Speichern fehlgeschlagen: ' + err.message);
        render(); // gespeicherte sind weg, der Rest kann erneut versucht werden
        return;
      }
      dlg.close();
      input.value = ''; updateAi();
      toast(saved === 1 ? 'Gemerkt' : `${saved} Erinnerungen gemerkt`);
      await onSaved();
      input.focus();
    });
  }
}
