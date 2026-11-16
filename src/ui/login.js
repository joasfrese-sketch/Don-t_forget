// Anmeldung per E-Mail: Link oder 6-stelliger Code (Code nötig für die installierte iPad-App,
// weil der Link dort in Safari statt in der App öffnet).
import { supabase } from '../lib/supabase.js';
import { $, esc } from './util.js';

export function renderLogin(root) {
  root.innerHTML = `
    <main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div class="text-center">
        <div class="text-5xl">🔔</div>
        <h1 class="mt-2 text-2xl font-semibold">Don't forget</h1>
        <p class="mt-1 text-sm text-stone-500">Melde dich mit deiner E-Mail-Adresse an.</p>
      </div>
      <form id="emailForm" class="flex flex-col gap-3">
        <input id="email" type="email" required autocomplete="email" placeholder="deine@email.de" class="field" />
        <button class="btn-primary py-3">Link senden</button>
      </form>
      <form id="codeForm" class="hidden flex-col gap-3">
        <p id="sentMsg" class="text-sm text-stone-600 dark:text-stone-300"></p>
        <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code aus der E-Mail" class="field text-center tracking-widest" />
        <button class="btn-primary py-3">Anmelden</button>
        <button type="button" id="back" class="btn-ghost">Andere E-Mail</button>
      </form>
      <p id="err" class="text-center text-sm text-red-600"></p>
    </main>`;

  let email = '';
  const err = (m) => { $('#err').textContent = m || ''; };

  $('#emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    err();
    email = $('#email').value.trim();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) return err(error.message);
    $('#emailForm').classList.add('hidden');
    $('#codeForm').classList.replace('hidden', 'flex');
    $('#sentMsg').innerHTML = `E-Mail an <b>${esc(email)}</b> gesendet. Öffne den Link auf diesem Gerät oder gib den Code ein.`;
    $('#code').focus();
  });

  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    err();
    const { error } = await supabase.auth.verifyOtp({ email, token: $('#code').value.trim(), type: 'email' });
    if (error) err('Code ungültig oder abgelaufen.');
  });

  $('#back').addEventListener('click', () => renderLogin(root));
}
