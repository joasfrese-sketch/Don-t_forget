// Einstellungen: Darstellung, Erinnerungen (inkl. Nachfassen), Benachrichtigungen, KI.
import { saveSettings, listNotes } from '../lib/data.js';
import { Capacitor } from '@capacitor/core';
import { $, esc, toast } from './util.js';
import { openDialog } from './dialog.js';
import { readTheme, setTheme } from '../lib/theme.js';
import { buildIcs } from '../lib/ics.js';
import { validateFollowup } from '../lib/followup-settings.js';

const THEMES = [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']];
const ids = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

const isWeb = () => !globalThis.dtfDesktop && !Capacitor.isNativePlatform();

export function openSettings(settings, onSaved, notifier, onNotificationsChanged = () => {}) {
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
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Benachrichtigungen</h3>
        <p id="notifStatus" class="text-sm"></p>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="notifAllow" class="btn-ghost hidden border border-line">Erlauben</button>
          <button type="button" id="exactBtn" class="btn-ghost hidden border border-line">Pünktliche Alarme erlauben</button>
        </div>
      </section>

      ${globalThis.dtfDesktop ? `
      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Windows</h3>
        <label class="flex items-center justify-between gap-3">
          <span>Mit Windows starten</span>
          <input id="autostart" type="checkbox" class="h-6 w-6 accent-brand" disabled />
        </label>
        <p class="text-xs text-muted">Die App läuft im Hintergrund (Symbol unten rechts neben der Uhr), damit Erinnerungen auch bei geschlossenem Fenster kommen. Beenden: Rechtsklick auf das Symbol.</p>
      </section>` : ''}

      ${isWeb() ? `
      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">iPad / Browser</h3>
        <p class="text-xs text-muted">Als Web-App kann ich nur erinnern, solange sie geöffnet ist. Damit der iPad auch bei geschlossener App erinnert, kannst du die offenen Erinnerungen in den Kalender übernehmen: Datei antippen und „Zum Kalender hinzufügen“ wählen. Spätere Änderungen musst du erneut exportieren.</p>
        <button type="button" id="icsExport" class="btn-ghost border border-line">Offene Erinnerungen in den Kalender (.ics)</button>
      </section>` : ''}

      <section class="flex flex-col gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">KI (Claude)</h3>
        <input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Claude-Schlüssel (sk-ant-…)" class="field" value="${esc(settings.ai_key ?? '')}" />
        <p class="text-xs text-muted">Für Sprechen 🎤 und ✨. Der Schlüssel bleibt nur auf diesem Gerät. Abgerechnet wird nach Nutzung bei Anthropic (für kurze Notizen Cent-Beträge).</p>
      </section>

      <div class="flex gap-2">
        <button id="sClose" class="btn-primary flex-1">Fertig</button>
      </div>
    </div>`);

  dlg.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    setTheme(b.dataset.theme);
    dlg.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

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
    save({ default_time: e.target.value });
  });
  $('#fuEnabled', dlg).addEventListener('change', (e) => save({ followup_enabled: e.target.checked }));
  $('#fuHours', dlg).addEventListener('change', (e) => save({ followup_hours: e.target.valueAsNumber }));
  $('#evening', dlg).addEventListener('change', (e) => save({ evening_from: e.target.value }));
  $('#morning', dlg).addEventListener('change', (e) => save({ morning_at: e.target.value }));
  showCurrent();
  $('#sClose', dlg).addEventListener('click', () => dlg.close());
  $('#aiKey', dlg).addEventListener('change', (e) => save({ ai_key: e.target.value.trim() }));
  renderNotifications(dlg, notifier, onNotificationsChanged);
  $('#icsExport', dlg)?.addEventListener('click', async () => {
    try {
      const ics = buildIcs(await listNotes());
      if (!ics.includes('BEGIN:VEVENT')) return toast('Keine offenen Erinnerungen in der Zukunft.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = 'dont-forget.ics';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err) { toast(err.message); }
  });
  if (globalThis.dtfDesktop) {
    const box = $('#autostart', dlg);
    globalThis.dtfDesktop.getAutostart().then((on) => { box.checked = !!on; box.disabled = false; }).catch(() => {});
    box.addEventListener('change', async () => {
      try { await globalThis.dtfDesktop.setAutostart(box.checked); toast(box.checked ? 'Startet mit Windows' : 'Startet nicht mehr mit Windows'); }
      catch (err) { box.checked = !box.checked; toast(err.message); }
    });
  }
  return dlg;
}

// Zeigt, ob Erinnerungen auf diesem Gerät auch wirklich ankommen können, und bietet die nötigen Schritte an.
async function renderNotifications(dlg, notifier, onChanged) {
  const text = $('#notifStatus', dlg);
  const allow = $('#notifAllow', dlg);
  const exact = $('#exactBtn', dlg);
  if (!notifier) { text.textContent = 'Nicht verfügbar.'; return; }
  const refresh = async () => {
    const { permission, exactAlarm } = await notifier.status();
    allow.classList.toggle('hidden', permission === 'granted' || permission === 'denied');
    exact.classList.toggle('hidden', permission !== 'granted' || exactAlarm);
    if (permission === 'granted') {
      text.textContent = exactAlarm ? 'Erinnerungen sind eingeschaltet.' : 'Erinnerungen sind eingeschaltet, kommen aber evtl. ungenau. Bitte „Pünktliche Alarme“ erlauben.';
    } else if (permission === 'denied') {
      text.textContent = 'Benachrichtigungen sind blockiert. Bitte in den Android-Einstellungen für diese App erlauben.';
    } else {
      text.textContent = 'Noch nicht erlaubt: ohne Erlaubnis kann die App dich nicht erinnern.';
    }
  };
  allow.addEventListener('click', async () => { try { await notifier.requestPermission(); } catch (e) { toast(e.message); } await refresh(); onChanged(); });
  exact.addEventListener('click', async () => { try { await notifier.platform.openExactAlarmSettings(); } catch (e) { toast(e.message); } });
  try { await refresh(); } catch { text.textContent = 'Status konnte nicht gelesen werden.'; }
}
