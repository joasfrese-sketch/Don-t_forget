// Anmeldung mit E-Mail und Passwort. Funktioniert auch in der installierten iPad-App,
// weil kein Link in der App geöffnet werden muss (Bestätigungs-Mail darf in jedem Browser geöffnet werden).
import { supabase } from '../lib/supabase.js';
import { $, esc } from './util.js';

export function renderLogin(root) {
  root.innerHTML = `
    <main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div class="text-center">
        <div class="text-5xl">🔔</div>
        <h1 class="mt-2 text-2xl font-semibold">Don't forget</h1>
        <p class="mt-1 text-sm text-muted">Melde dich an – du bleibst auf diesem Gerät angemeldet.</p>
      </div>
      <form id="loginForm" class="flex flex-col gap-3">
        <input id="email" type="email" required autocomplete="email" placeholder="deine@email.de" class="field" />
        <input id="password" type="password" required minlength="6" autocomplete="current-password" placeholder="Passwort" class="field" />
        <button id="signIn" class="btn-primary py-3">Anmelden</button>
        <div class="flex justify-between text-sm">
          <button type="button" id="signupBtn" class="text-brand hover:underline">Konto erstellen</button>
          <button type="button" id="resetBtn" class="text-muted hover:underline">Passwort vergessen?</button>
        </div>
      </form>
      <p id="msg" class="text-center text-sm"></p>
    </main>`;

  const msg = (text, ok = false) => {
    const el = $('#msg');
    el.className = 'text-center text-sm ' + (ok ? 'text-muted' : 'text-danger');
    el.innerHTML = text;
  };
  const creds = () => ({ email: $('#email').value.trim(), password: $('#password').value });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg('');
    const { error } = await supabase.auth.signInWithPassword(creds());
    if (!error) return;
    if (/confirm/i.test(error.message)) msg('Bitte zuerst den Link in der Bestätigungs-Mail öffnen.');
    else msg('E-Mail oder Passwort falsch.');
  });

  $('#signupBtn').addEventListener('click', async () => {
    const { email, password } = creds();
    if (!$('#loginForm').reportValidity()) return;
    msg('');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    if (error) return msg(esc(error.message));
    if (data.session) return; // Bestätigung abgeschaltet → direkt angemeldet
    msg(`Bestätigungs-Mail an <b>${esc(email)}</b> gesendet. Öffne den Link (egal in welchem Browser) und melde dich dann hier an.`, true);
  });

  $('#resetBtn').addEventListener('click', async () => {
    const email = $('#email').value.trim();
    if (!email) { $('#email').focus(); return msg('Bitte zuerst die E-Mail-Adresse eingeben.'); }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) return msg(esc(error.message));
    msg('E-Mail zum Zurücksetzen gesendet. Öffne den Link und vergib ein neues Passwort.', true);
  });
}

// Nach Klick auf den Link „Passwort zurücksetzen“: neues Passwort vergeben.
export function renderNewPassword(root, onDone) {
  root.innerHTML = `
    <main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 class="text-center text-xl font-semibold">Neues Passwort</h1>
      <form id="pwForm" class="flex flex-col gap-3">
        <input id="newPw" type="password" required minlength="6" autocomplete="new-password" placeholder="Neues Passwort" class="field" />
        <button class="btn-primary py-3">Speichern</button>
      </form>
      <p id="msg" class="text-center text-sm text-danger"></p>
    </main>`;
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: $('#newPw').value });
    if (error) $('#msg').textContent = error.message;
    else onDone();
  });
}
