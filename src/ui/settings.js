// Einstellungen: Standard-Uhrzeit, Benachrichtigungen auf diesem Gerät, Abmelden.
import { saveSettings } from '../lib/data.js';
import { supabase } from '../lib/supabase.js';
import { $, toast } from './util.js';
import { pushSupported, pushActive, enablePush, disablePush, isIOS, isStandalone } from '../lib/push.js';
import { openDialog } from './dialog.js';

export function openSettings(settings, onSaved) {
  const dlg = openDialog(`
    <div class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">Einstellungen</h2>
      <label class="flex items-center justify-between gap-3">
        <span>Standard-Erinnerung um</span>
        <input id="sTime" type="time" class="field w-32" value="${settings.default_time}" />
      </label>
      <p class="-mt-2 text-xs text-muted">Neue Notizen erinnern dich zu dieser Uhrzeit – heute, oder morgen, wenn sie schon vorbei ist.</p>
      <div id="pushArea"></div>
      <div class="mt-2 flex gap-2">
        <button id="sClose" class="btn-primary flex-1">Fertig</button>
        <button id="sLogout" class="btn-ghost">Abmelden</button>
      </div>
    </div>`);

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
