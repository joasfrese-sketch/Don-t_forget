// Einstellungen: Darstellung, Erinnerungen (inkl. Nachfassen), Konto.
import { saveSettings } from '../lib/data.js';
import { supabase } from '../lib/supabase.js';
import { $, toast } from './util.js';
import { pushSupported, pushActive, enablePush, disablePush, isIOS, isStandalone } from '../lib/push.js';
import { openDialog } from './dialog.js';
import { readTheme, setTheme } from '../lib/theme.js';
import { validateNewPassword } from '../lib/account.js';
import { validateFollowup } from '../lib/followup-settings.js';

const THEMES = [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']];
const ids = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

export function openSettings(settings, onSaved) {
  const activeTheme = readTheme(localStorage);
  const dlg = openDialog(`
    <div class="flex flex-col gap-5">
      <h2 class="text-lg font-semibold">Einstellungen</h2>

      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Darstellung</h3>
        <div class="grid grid-cols-3 gap-1 rounded-xl bg-page p-1" role="group" aria-label="Darstellung">
          ${THEMES.map(([m, label]) => `<button type="button" id="${ids[m]}" data-theme="${m}" aria-pressed="${m === activeTheme}"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition aria-pressed:bg-brand aria-pressed:text-on-brand text-muted">${label}</button>`).join('')}
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Erinnerungen</h3>
        <label class="flex items-center justify-between gap-3">
          <span>Standard-Erinnerung um</span>
          <input id="sTime" type="time" class="field w-36" value="${settings.default_time}" />
        </label>
        <p class="-mt-1 text-xs text-muted">Neue Notizen erinnern dich zu dieser Uhrzeit – heute, oder morgen, wenn sie schon vorbei ist.</p>
        <div id="pushArea"></div>
        <details id="followupBox" class="rounded-xl border border-line px-3 py-2">
          <summary id="followupToggle" class="cursor-pointer text-sm font-medium">Nachfassen</summary>
          <div class="mt-3 flex flex-col gap-3 text-sm">
            <label class="flex items-center justify-between gap-3"><span>Hinweis auf offene Erinnerungen</span>
              <input id="fuEnabled" type="checkbox" class="h-6 w-6 accent-brand" ${settings.followup_enabled ? 'checked' : ''} /></label>
            <label class="flex items-center justify-between gap-3"><span>Tagsüber nach (Stunden)</span>
              <input id="fuHours" type="number" min="1" max="24" step="1" class="field w-20 text-right" value="${settings.followup_hours}" /></label>
            <label class="flex items-center justify-between gap-3"><span>Abends ab</span>
              <input id="evening" type="time" class="field w-36" value="${settings.evening_from}" /></label>
            <label class="flex items-center justify-between gap-3"><span>… dann am nächsten Morgen um</span>
              <input id="morning" type="time" class="field w-36" value="${settings.morning_at}" /></label>
            <p id="fuHint" class="text-xs text-muted"></p>
          </div>
        </details>
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

  // Gesamter Stand dieses Dialogs; gespeichert wird nur, was sich ändert.
  let current = { ...settings };
  const fields = { followup_hours: '#fuHours', evening_from: '#evening', morning_at: '#morning', default_time: '#sTime' };
  const showCurrent = () => {
    for (const [key, sel] of Object.entries(fields)) $(sel, dlg).value = current[key];
    $('#fuEnabled', dlg).checked = current.followup_enabled;
    for (const sel of ['#fuHours', '#evening', '#morning']) $(sel, dlg).disabled = !current.followup_enabled;
    $('#fuHint', dlg).textContent = current.followup_enabled
      ? `Erinnerung unbeachtet? Tagsüber ${current.followup_hours} Std. später, ab ${current.evening_from} am nächsten Morgen um ${current.morning_at}. Mehrere offene ergeben einen gemeinsamen Hinweis.`
      : 'Aus: Es gibt keinen Hinweis auf unbeachtete Erinnerungen.';
  };
  const save = async (patch) => {
    const next = { ...current, ...patch };
    const problem = validateFollowup(next);
    if (problem) { toast(problem); return showCurrent(); }
    try {
      await saveSettings(patch);
      current = next;
      onSaved({ ...current });
      toast('Gespeichert');
    } catch (err) { toast(err.message); }
    showCurrent();
  };
  $('#sTime', dlg).addEventListener('change', (e) => {
    if (!e.target.value) return showCurrent();
    save({ default_time: e.target.value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || current.timezone });
  });
  $('#fuEnabled', dlg).addEventListener('change', (e) => save({ followup_enabled: e.target.checked }));
  $('#fuHours', dlg).addEventListener('change', (e) => save({ followup_hours: e.target.valueAsNumber }));
  $('#evening', dlg).addEventListener('change', (e) => save({ evening_from: e.target.value }));
  $('#morning', dlg).addEventListener('change', (e) => save({ morning_at: e.target.value }));
  showCurrent();
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
