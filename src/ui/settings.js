// Einstellungen: Standard-Uhrzeit, Abmelden. Push-Schalter folgt in Task 6.
import { saveSettings } from '../lib/data.js';
import { supabase } from '../lib/supabase.js';
import { $, toast } from './util.js';
import { openDialog } from './dialog.js';

export function openSettings(settings, onSaved) {
  const dlg = openDialog(`
    <div class="flex flex-col gap-4">
      <h2 class="text-lg font-semibold">Einstellungen</h2>
      <label class="flex items-center justify-between gap-3">
        <span>Standard-Erinnerung um</span>
        <input id="sTime" type="time" class="field w-32" value="${settings.default_time}" />
      </label>
      <p class="-mt-2 text-xs text-stone-500">Neue Notizen erinnern dich zu dieser Uhrzeit – heute, oder morgen, wenn sie schon vorbei ist.</p>
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
  $('#sLogout', dlg).addEventListener('click', async () => { dlg.close(); await supabase.auth.signOut(); });
  return dlg;
}
