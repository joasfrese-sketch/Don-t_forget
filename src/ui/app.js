// Hauptansicht: schnelles Festhalten und Liste der Erinnerungen.
import { listNotes, createNote, markDone, snooze } from '../lib/data.js';
import { groupNotes } from '../lib/notes-view.js';
import { defaultRemindAt, formatWhen, toLocalInputValue, zonedToUtc } from '../lib/time.js';
import { $, esc, toast } from './util.js';
import { mountVoice } from './voice.js';

export function createApp(root, settings, { onOpenNote, onOpenSettings }) {
  let notes = [];
  let customAt = null; // Date | null – eigene Zeit für die nächste Notiz
  let doneOpen = false;
  const tz = () => settings.timezone;

  root.innerHTML = `
    <main class="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-16 pt-4">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">🔔 Don't forget</h1>
        <a href="#/einstellungen" id="openSettings" class="btn-ghost text-lg" aria-label="Einstellungen">⚙︎</a>
      </header>
      <div id="notice" class="hidden items-center justify-between gap-3 rounded-xl border border-line bg-brand/10 px-3 py-2 text-sm" role="status">
        <span id="noticeText"></span>
        <button type="button" id="noticeBtn" class="btn-ghost shrink-0 border border-line">Einstellungen</button>
      </div>
      <form id="add" class="card flex flex-col gap-2 p-3">
        <div class="flex gap-2">
          <input id="text" autocomplete="off" enterkeyhint="done" placeholder="Was fällt dir ein?" class="field" autofocus />
          <button class="btn-primary px-4" aria-label="Speichern">↵</button>
        </div>
        <div class="flex flex-wrap items-center gap-2 px-1 text-sm text-muted">
          <span id="whenLabel"></span>
          <button type="button" id="changeWhen" class="text-brand hover:underline">ändern</button>
          <input id="whenInput" type="datetime-local" class="field hidden w-auto py-1 text-sm" />
          <button type="button" id="resetWhen" class="hidden text-muted hover:underline">Standard</button>
        </div>
      </form>
      <section id="lists" class="flex flex-col gap-5"></section>
    </main>`;

  const input = $('#text', root);
  const whenInput = $('#whenInput', root);
  mountVoice(root, { input, getSettings: () => settings, onSaved: () => reload() });

  function nextAt() {
    return customAt || defaultRemindAt(new Date(), settings.default_time, tz());
  }

  function renderWhen() {
    $('#whenLabel', root).textContent = `🔔 ${formatWhen(nextAt(), new Date(), tz())}`;
    $('#resetWhen', root).classList.toggle('hidden', !customAt);
  }

  function row(n, kind) {
    const when = formatWhen(new Date(n.remind_at), new Date(), tz());
    const actions = kind === 'due' ? `
      <button data-done="${n.id}" class="btn-ghost" title="Erledigt" aria-label="Erledigt">✓</button>
      <button data-snooze="${n.id}" class="btn-ghost" title="Später (+1 Std.)" aria-label="Später">⏰</button>` : '';
    return `
      <li class="flex items-center gap-2 px-3 py-2">
        <button data-open="${n.id}" class="min-w-0 flex-1 text-left">
          <div class="truncate ${kind === 'done' ? 'text-muted line-through' : ''}">${esc(n.text)}</div>
          <div class="text-xs text-muted">${kind === 'done' ? 'erledigt' : esc(when)}</div>
        </button>${actions}
      </li>`;
  }

  function section(title, items, kind) {
    if (!items.length) return '';
    return `
      <div>
        <h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${kind === 'due' ? 'text-brand' : 'text-muted'}">${title}</h2>
        <ul class="card divide-y divide-line">${items.map((n) => row(n, kind)).join('')}</ul>
      </div>`;
  }

  function renderLists() {
    const g = groupNotes(notes, new Date());
    const empty = !g.due.length && !g.upcoming.length;
    $('#lists', root).innerHTML = `
      ${section('Fällig', g.due, 'due')}
      ${section('Anstehend', g.upcoming, 'upcoming')}
      ${empty ? '<p class="py-8 text-center text-sm text-muted">Nichts offen. Schreib oben auf, was dir einfällt.</p>' : ''}
      ${g.done.length ? `
        <div>
          <button id="toggleDone" class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">${doneOpen ? '▾' : '▸'} Erledigt (${g.done.length})</button>
          ${doneOpen ? `<ul class="card mt-2 divide-y divide-line">${g.done.map((n) => row(n, 'done')).join('')}</ul>` : ''}
        </div>` : ''}`;
  }

  function render() { renderWhen(); renderLists(); }

  async function reload() {
    try { notes = await listNotes(); render(); } catch (e) { toast(e.message); }
  }

  $('#add', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return input.focus();
    const at = nextAt();
    const custom = !!customAt;
    input.value = '';
    customAt = null;
    whenInput.classList.add('hidden');
    renderWhen();
    input.focus();
    try {
      const note = await createNote(text, at, custom);
      if (!notes.some((n) => n.id === note.id)) notes.push(note);
      renderLists();
      toast(`Gemerkt – ${formatWhen(at, new Date(), tz())}`);
    } catch (err) {
      input.value = text;
      toast('Speichern fehlgeschlagen: ' + err.message);
    }
  });

  $('#changeWhen', root).addEventListener('click', () => {
    whenInput.value = toLocalInputValue(nextAt(), tz());
    whenInput.classList.remove('hidden');
    whenInput.focus();
    whenInput.showPicker?.();
  });
  whenInput.addEventListener('change', () => {
    if (!whenInput.value) return;
    const [d, t] = whenInput.value.split('T');
    customAt = zonedToUtc(d, t, tz());
    renderWhen();
    input.focus();
  });
  $('#resetWhen', root).addEventListener('click', () => {
    customAt = null;
    whenInput.classList.add('hidden');
    renderWhen();
    input.focus();
  });

  $('#lists', root).addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'toggleDone') { doneOpen = !doneOpen; return renderLists(); }
    if (b.dataset.open) return onOpenNote(b.dataset.open);
    try {
      if (b.dataset.done) { await markDone(b.dataset.done); toast('Erledigt'); }
      if (b.dataset.snooze) { await snooze(b.dataset.snooze); toast('In 1 Stunde wieder'); }
      await reload();
    } catch (err) { toast(err.message); }
  });

  $('#openSettings', root).addEventListener('click', (e) => { e.preventDefault(); onOpenSettings(); });
  $('#noticeBtn', root).addEventListener('click', () => onOpenSettings());

  return {
    reload,
    tick: render,
    setSettings(s) { settings = s; renderWhen(); },
    getNote: (id) => notes.find((n) => n.id === id),
    focus: () => input.focus(),
    // Hinweis über der Eingabe, z. B. „Erinnerungen sind aus“; null blendet ihn aus
    setNotice(text) {
      const box = $('#notice', root);
      $('#noticeText', root).textContent = text ?? '';
      box.classList.toggle('hidden', !text);
      box.classList.toggle('flex', !!text);
    },
  };
}
