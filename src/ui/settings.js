// Einstellungen: Darstellung, Erinnerungen, Konto.
import { saveSettings } from '../lib/data.js';
import { supabase } from '../lib/supabase.js';
import { $, toast } from './util.js';
import { pushSupported, pushActive, enablePush, disablePush, isIOS, isStandalone } from '../lib/push.js';
import { openDialog } from './dialog.js';
import { readTheme, setTheme } from '../lib/theme.js';
import { validateNewPassword } from '../lib/account.js';

const THEMES = [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']];
const ids = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

export function openSettings(settings, onSaved) {
  const current = readTheme(localStorage);
  const dlg = openDialog(`
    <div class="flex flex-col gap-5">
      <h2 class="text-lg font-semibold">Einstellungen</h2>

      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Darstellung</h3>
        <div class="grid grid-cols-3 gap-1 rounded-xl bg-page p-1" role="group" aria-label="Darstellung">
          ${THEMES.map(([m, label]) => `<button type="button" id="${ids[m]}" data-theme="${m}" aria-pressed="${m === current}"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition aria-pressed:bg-brand aria-pressed:text-on-brand text-muted">${label}</button>`).join('')}
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Erinnerungen</h3>
        <label class="flex items-center justify-between gap-3">
          <span>Standard-Erinnerung um</span>
          <input id="sTime" type="time" class="field w-32" value="${settings.default_time}" />
        </label>
        <p class="-mt-1 text-xs text-muted">Neue Notizen erinnern dich zu dieser Uhrzeit – heute, oder morgen, wenn sie schon vorbei ist.</p>
        <div id="pushArea"></div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Konto</h3>
        <p id="accountEmail" class="truncate text-sm"></p>
        <div class="flex gap-2">
          <input id="newPw" type="password" autocomplete="new-password" placeholder="Neues Passwort" class="field" />
          <button type="button" id="changePw" class="btn-ghost shrink-0 border border-line">Ändern</button>
        </div>
      </section>

      <div class="flex gap-2">
        <button id="sClose" class="btn-primary flex-1">Fertig</button>
        <button id="sLogout" class="btn-ghost">Abmelden</button>
      </div>
    </div>`);

  dlg.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    setTheme(b.dataset.theme);
    dlg.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  supabase.auth.getUser().then(({ data }) => { $('#accountEmail', dlg).textContent = data.user?.email ?? ''; });

  $('#changePw', dlg).addEventListener('click', async () => {
    const pw = $('#newPw', dlg).value;
    const problem = validateNewPassword(pw);
    if (problem) return toast(problem);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast(error.message);
    $('#newPw', dlg).value = '';
    toast('Passwort geändert');
  });

  $('#sTime', dlg).addEventListener('change', async (e) => {
    if (!e.target.value) return;
    const next = { default_time: e.target.value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || settings.timezone };
    try { await saveSettings(next); onSaved(next); toast('Gespeichert'); } catch (err) { toast(err.message); }
  });
  $('#sClose', dlg).addEventListener('click', () => dlg.close());
  $('#sLogout', dlg).addEventListener('click', async () => {
    dlg.close();
    try { await disablePush(); } catch { /* Gerät hatte kein Abo */ }
    await supabase.auth.signOut();
  });
  renderPush($('#pushArea', dlg));
  return dlg;
}

async function renderPush(el) {
  if (isIOS() && !isStandalone()) {
    el.innerHTML = `<div class="rounded-xl bg-brand/10 p-3 text-sm text-ink">
      Für Erinnerungen auf dem iPad: Tippe auf <b>Teilen</b> → <b>„Zum Home-Bildschirm“</b> und öffne die App von dort.</div>`;
    return;
  }
  if (!pushSupported()) {
    el.innerHTML = '<p class="text-sm text-muted">Dieser Browser unterstützt keine Benachrichtigungen.</p>';
    return;
  }
  const on = await pushActive();
  el.innerHTML = `
    <label class="flex items-center justify-between gap-3">
      <span>Benachrichtigungen auf diesem Gerät</span>
      <input id="sPush" type="checkbox" class="h-6 w-6 accent-brand" ${on ? 'checked' : ''} />
    </label>
    ${Notification.permission === 'denied' ? '<p class="mt-1 text-xs text-danger">Im Browser blockiert – bitte in den Website-Einstellungen erlauben.</p>' : ''}`;
  $('#sPush', el).addEventListener('change', async (e) => {
    e.target.disabled = true;
    try {
      if (e.target.checked) { await enablePush(); toast('Benachrichtigungen an'); }
      else { await disablePush(); toast('Benachrichtigungen aus'); }
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
    e.target.disabled = false;
  });
}
