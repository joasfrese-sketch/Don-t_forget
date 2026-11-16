# Don't forget – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine installierbare Notizen-Web-App, die zu jeder Notiz per Web-Push an eine Standard- oder eigene Uhrzeit erinnert, synchron auf Android, iPad und PC.

**Architecture:** Statische Vite-App (Vanilla JS, Tailwind) auf Vercel. Supabase übernimmt Auth (Magic Link), Postgres mit RLS und Realtime. Jede Minute ruft pg_cron die Edge Function `send-reminders` auf. Sie beansprucht fällige Notizen atomar per SQL-Funktion und verschickt Web-Push. Die Knöpfe in der Nachricht rufen die Edge Function `note-action` mit einem Token pro Notiz auf.

**Tech Stack:** Vite 5, Tailwind 3, `@supabase/supabase-js` 2, Vitest, `@electric-sql/pglite` (SQL-Tests), Deno Edge Functions mit `npm:web-push@3.6.7`.

**Spec:** `docs/superpowers/specs/2026-11-16-erinnerungs-app-design.md`

**Vorlage:** Das Projekt `joasfrese-sketch/lagerverwaltung` desselben Nutzers nutzt denselben Aufbau. Vorbild für Push sind dort `src/lib/push.js`, `public/sw.js` und `supabase/functions/send-push/index.ts`, Vorbild für pg_cron ist `supabase/migrations/001_schema.sql` (am Dateiende).

## Global Constraints

- Sprache der Oberfläche: Deutsch. App-Name und Titel der Nachricht: `Don't forget`.
- Standard-Erinnerungszeit (Vorgabe): `17:00`. Standard-Zeitzone: `Europe/Berlin`. Beim Speichern der Einstellungen wird die Zone aus `Intl.DateTimeFormat().resolvedOptions().timeZone` übernommen.
- Regel für die Standardzeit: Liegt sie heute (in der Zone des Nutzers) nach dem aktuellen Zeitpunkt, wird für heute erinnert, sonst morgen zur selben Uhrzeit.
- „Später“ bedeutet `now() + 1 Stunde`.
- Wird die Standardzeit geändert, bleiben bestehende Notizen unverändert.
- Jede Notiz hat eine Erinnerung (`remind_at not null`).
- Kein Offline-Erfassen in v1.
- Keine Dependencies über den Tech Stack hinaus.
- Ein Supabase-Projekt anlegen und auf Vercel deployen nur nach ausdrücklicher Zustimmung des Nutzers. Der Plan endet mit einer README-Anleitung.
- Secrets (VAPID private key, Service-Role-Key, Webhook-Secret) nie committen. `.env` steht in `.gitignore`.

## Review Focus

1. **Notiz kurz vor der Standardzeit erfasst** (z. B. 16:59:30 bei 17:00): Die Erinnerung muss heute um 17:00 kommen, nicht morgen. Erfasst um genau 17:00:00 → morgen. Getestet in Task 1.
2. **Sommer- und Winterzeit:** Erfasst am Abend vor der Umstellung (z. B. 2026-10-24 20:00 Berlin) → Erinnerung am 2026-10-25 um 17:00 Ortszeit, also 16:00Z. Getestet in Task 1.
3. **Zwei Cron-Läufe überlappen** oder die Function läuft doppelt: Jede Notiz darf nur einmal beansprucht werden. Getestet in Task 2 (`claim_due_notes` zweimal aufrufen → zweiter Aufruf leer).
4. **Veraltetes Token:** „Erledigt“ wird auf einer alten Nachricht getippt, nachdem schon „Später“ gewählt wurde. Das Token hat sich geändert, also passiert nichts und es gibt keinen Fehler-Push. Getestet in Task 2.
5. **Fremde Notizen:** Ein Nutzer darf keine Notizen anderer sehen oder ändern. Getestet in Task 2 (RLS mit zwei Nutzern).

---

## File Structure

```
package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html, vercel.json, .env.example, .gitignore
src/main.js                 Start: Auth prüfen, Login oder App rendern
src/style.css               Tailwind
src/lib/time.js             reine Zeitlogik (Standard-remind_at, Anzeige)
src/lib/notes-view.js       reine Gruppierung der Notizen für die Liste
src/lib/supabase.js         Client + unwrap
src/lib/data.js             CRUD für notes/user_settings, Realtime
src/lib/push.js             Push-Abo verwalten (Vorlage Lagerverwaltung)
src/ui/login.js             Magic-Link-Formular
src/ui/app.js               Hauptansicht (Eingabe, Listen)
src/ui/edit.js              Bearbeiten-Dialog
src/ui/settings.js          Einstellungen
public/sw.js, public/manifest.webmanifest, public/icon-192.png, public/icon-512.png
supabase/migrations/001_schema.sql
supabase/functions/_shared/reminders.ts   reine Helfer (Payload, Aktion)
supabase/functions/send-reminders/index.ts
supabase/functions/note-action/index.ts
tests/time.test.js, tests/notes-view.test.js, tests/schema.test.js, tests/reminders.test.ts, tests/sw.test.js
README.md
```

---

### Task 1: Projektgerüst und Zeitlogik

**Files:**
- Create: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `.env.example`, `vercel.json`, `src/lib/time.js`
- Test: `tests/time.test.js`

**Interfaces:**
- Produces:
  - `defaultRemindAt(now: Date, defaultTime: string /* 'HH:MM' */, timeZone: string): Date`
  - `zonedToUtc(dateStr: string /* 'YYYY-MM-DD' */, timeStr: string /* 'HH:MM' */, timeZone: string): Date`
  - `toLocalInputValue(d: Date, timeZone: string): string` → `'YYYY-MM-DDTHH:MM'` (für `<input type="datetime-local">`)
  - `formatWhen(d: Date, now: Date, timeZone: string): string` → `'heute 17:00'`, `'morgen 17:00'`, sonst `'Fr 20.11. 09:00'` (Wochentag kurz, deutsch)
  - npm-Skripte: `dev`, `build`, `preview`, `test` (`vitest run`)

- [ ] **Step 1: Gerüst anlegen.** `package.json` wie in Lagerverwaltung (Name `dont-forget`, `"type": "module"`) plus devDependencies `vitest`, `@electric-sql/pglite`. `vercel.json`: `{ "framework": "vite", "buildCommand": "npm run build", "outputDirectory": "dist" }`. `.env.example` mit `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`, `VITE_VAPID_PUBLIC_KEY=`. `.gitignore`: `node_modules`, `dist`, `.env`. Danach `npm install`.

- [ ] **Step 2: Failing tests schreiben**

```js
// tests/time.test.js
import { describe, it, expect } from 'vitest';
import { defaultRemindAt, formatWhen, toLocalInputValue } from '../src/lib/time.js';
const B = 'Europe/Berlin';

describe('defaultRemindAt', () => {
  it('heute, wenn Standardzeit noch kommt', () => {
    expect(defaultRemindAt(new Date('2026-11-16T09:00:00Z'), '17:00', B).toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });
  it('heute auch 30 s vorher', () => {
    expect(defaultRemindAt(new Date('2026-11-16T15:59:30Z'), '17:00', B).toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });
  it('morgen, wenn genau erreicht', () => {
    expect(defaultRemindAt(new Date('2026-11-16T16:00:00Z'), '17:00', B).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
  it('morgen, wenn vorbei', () => {
    expect(defaultRemindAt(new Date('2026-11-16T17:30:00Z'), '17:00', B).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
  it('über Zeitumstellung (Ende Sommerzeit 25.10.2026)', () => {
    expect(defaultRemindAt(new Date('2026-10-24T18:00:00Z'), '17:00', B).toISOString()).toBe('2026-10-25T16:00:00.000Z');
  });
  it('Sommerzeit: 17:00 Berlin = 15:00Z', () => {
    expect(defaultRemindAt(new Date('2026-07-01T08:00:00Z'), '17:00', B).toISOString()).toBe('2026-07-01T15:00:00.000Z');
  });
  it('lokales Datum zählt, nicht UTC-Datum (00:30 Berlin)', () => {
    expect(defaultRemindAt(new Date('2026-11-16T23:30:00Z'), '17:00', B).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
});

describe('formatWhen', () => {
  const now = new Date('2026-11-16T09:00:00Z'); // Mo
  it('heute', () => expect(formatWhen(new Date('2026-11-16T16:00:00Z'), now, B)).toBe('heute 17:00'));
  it('morgen', () => expect(formatWhen(new Date('2026-11-17T16:00:00Z'), now, B)).toBe('morgen 17:00'));
  it('später', () => expect(formatWhen(new Date('2026-11-20T08:00:00Z'), now, B)).toBe('Fr 20.11. 09:00'));
});

it('toLocalInputValue', () => {
  expect(toLocalInputValue(new Date('2026-11-16T16:00:00Z'), B)).toBe('2026-11-16T17:00');
});
```

- [ ] **Step 3: `npm test` → FAIL (Modul fehlt)**

- [ ] **Step 4: `src/lib/time.js` implementieren.** Ortszeit-Bestandteile per `Intl.DateTimeFormat(…, { timeZone, hourCycle: 'h23', … }).formatToParts`. `zonedToUtc` rechnet so: UTC-Guess bauen, den Offset der Zone zu diesem Zeitpunkt ermitteln, abziehen und einmal nachkorrigieren (für die Umstellung). Keine Bibliothek.

- [ ] **Step 5: `npm test` → PASS**

- [ ] **Step 6: Commit** `feat: Projektgerüst und Zeitlogik`

---

### Task 2: Datenbankschema, RLS und SQL-Funktionen

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Test: `tests/schema.test.js`

**Interfaces:**
- Produces (Tabellen wie im Spec, Abschnitt Datenmodell):
  - `public.user_settings(user_id uuid pk references auth.users on delete cascade, default_time time not null default '17:00', timezone text not null default 'Europe/Berlin')`
  - `public.notes(id uuid pk default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, text text not null check (length(trim(text)) > 0), remind_at timestamptz not null, custom_time boolean not null default false, status text not null default 'open' check (status in ('open','done')), sent_at timestamptz, action_token text not null default encode(gen_random_bytes(16),'hex'), created_at timestamptz default now(), updated_at timestamptz default now())`, Index auf `(status, remind_at) where sent_at is null`
  - `public.push_subscriptions(id uuid pk, user_id uuid not null default auth.uid() …, endpoint text unique not null, p256dh text not null, auth text not null, created_at timestamptz default now())`
  - RLS auf allen drei Tabellen: `user_id = auth.uid()` für select/insert/update/delete.
  - Trigger `before update on notes`: setzt `updated_at = now()`. Ändert sich `remind_at`, gilt zusätzlich `sent_at = null` und `action_token` wird neu erzeugt.
  - `public.claim_due_notes() returns setof notes`, `security definer`, nur für `service_role` ausführbar (`revoke … from public, anon, authenticated`): `update notes set sent_at = now() where id in (select id from notes where status='open' and sent_at is null and remind_at <= now() for update skip locked) returning *`
  - `public.note_action(p_id uuid, p_token text, p_action text) returns boolean`, `security definer`, nur `service_role`: bei passendem Token und `status='open'` führt `'done'` zu `status='done'` und `'snooze'` zu `remind_at = now() + interval '1 hour'` (der Trigger setzt `sent_at` und das Token zurück). Rückgabe: ob eine Zeile geändert wurde.
  - Publication `supabase_realtime` um `notes` erweitern (in `do $$ … exception when others`-Block).
  - pg_cron + pg_net: `cron.schedule('dont-forget-reminders', '* * * * *', $$ select net.http_post(url := <functions-url>/send-reminders, headers := jsonb_build_object('x-cron-secret', <secret>)) $$)`. URL und Secret kommen aus Supabase Vault (`vault.decrypted_secrets`, Namen `project_url` und `cron_secret`). Alles im `do $$ … exception when others then raise notice …`-Block wie in Lagerverwaltung.

- [ ] **Step 1: Failing test schreiben.** PGlite starten und vorab Stubs für Supabase anlegen: Schema `auth` mit `auth.users(id uuid pk)`, `auth.uid()` liest `current_setting('test.uid', true)::uuid`, Rollen `anon`, `authenticated`, `service_role`, Extension `pgcrypto`. Danach die Migration laden.

```js
// tests/schema.test.js – Fälle (je ein it):
// 'claim_due_notes liefert fällige Notiz genau einmal'
//    Notiz mit remind_at = now() - 1 min → erster Aufruf 1 Zeile, zweiter Aufruf 0 Zeilen
// 'claim_due_notes ignoriert zukünftige und erledigte'
//    remind_at = now() + 1h → 0; status='done' und fällig → 0
// 'note_action done mit richtigem Token' → true, status = 'done'
// 'note_action snooze' → true, remind_at ≈ now()+1h (±5 s), sent_at null, action_token geändert
// 'note_action mit altem Token nach snooze' → false, status bleibt 'open'
// 'remind_at ändern setzt sent_at zurück'
// 'RLS: Nutzer B sieht Notiz von A nicht'
//    set role authenticated; set test.uid = B; select count(*) from notes → 0
// 'leerer Text wird abgelehnt' → insert text '   ' wirft Fehler
```

- [ ] **Step 2: `npm test tests/schema.test.js` → FAIL**
- [ ] **Step 3: `001_schema.sql` schreiben** (Inhalt laut Interfaces)
- [ ] **Step 4: `npm test tests/schema.test.js` → PASS.** Lässt sich `for update skip locked` oder der pg_cron-Block in PGlite nicht ausführen: der Cron-Block muss über seinen `exception`-Zweig weiterlaufen. Der Test darf dafür nicht abgeschwächt werden.
- [ ] **Step 5: Commit** `feat: Datenbankschema mit RLS, claim_due_notes, note_action, Cron`

---

### Task 3: Edge Functions für Versand und Aktionen

**Files:**
- Create: `supabase/functions/_shared/reminders.ts`, `supabase/functions/send-reminders/index.ts`, `supabase/functions/note-action/index.ts`
- Test: `tests/reminders.test.ts`

**Interfaces:**
- Consumes: `claim_due_notes()`, `note_action(p_id, p_token, p_action)` aus Task 2
- Produces:
  - `buildPayload(note: { id, text, action_token }): string`, JSON `{ title: "Don't forget", body: text, noteId: id, token: action_token, url: '/#/n/' + id }`, `body` auf 180 Zeichen gekürzt (mit `…`)
  - `parseAction(body: unknown): { id: string, token: string, action: 'done' | 'snooze' } | null`, `null` bei fehlenden Feldern oder unbekannter Aktion
  - `send-reminders`: `POST`, Header `x-cron-secret` muss `Deno.env.get('CRON_SECRET')` entsprechen, sonst 403. Ruft `rpc('claim_due_notes')` auf, schickt pro Notiz an alle `push_subscriptions` des `user_id` und löscht Abos bei 404/410. Antwort `{ claimed, sent }`. Env: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
  - `note-action`: `POST` mit JSON `{ id, token, action }`, CORS für `*`, `--no-verify-jwt`. Ruft `rpc('note_action', …)` auf. Antwort `{ ok: boolean }`, bei ungültigem Body 400.

- [ ] **Step 1: Failing tests** für `buildPayload` (Felder, Kürzung auf 180 Zeichen) und `parseAction` (gültig, fehlendes Token → null, `action: 'delete'` → null).
- [ ] **Step 2: `npm test tests/reminders.test.ts` → FAIL**
- [ ] **Step 3: `_shared/reminders.ts` implementieren** (keine Deno- oder npm-Imports, damit Vitest es laden kann), dann die beiden `index.ts` nach dem Vorbild `send-push/index.ts` der Lagerverwaltung.
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** `feat: Edge Functions send-reminders und note-action`

---

### Task 4: Datenzugriff und Listenlogik im Client

**Files:**
- Create: `src/lib/supabase.js`, `src/lib/data.js`, `src/lib/notes-view.js`
- Test: `tests/notes-view.test.js`

**Interfaces:**
- Consumes: `defaultRemindAt` aus Task 1
- Produces:
  - `groupNotes(notes: Note[], now: Date): { due: Note[], upcoming: Note[], done: Note[] }`. `due` sind offene Notizen mit `remind_at <= now`, aufsteigend sortiert. `upcoming` sind offene Notizen mit `remind_at > now`, aufsteigend sortiert. `done` sind erledigte Notizen, neueste `updated_at` zuerst.
  - `supabase.js`: `supabase`, `unwrap(res)` (wie Lagerverwaltung)
  - `data.js`:
    - `getSettings(): Promise<{ default_time: 'HH:MM', timezone }>`: legt bei Bedarf eine Zeile mit den Vorgaben an. `time` wird auf `HH:MM` gekürzt.
    - `saveSettings({ default_time, timezone })`
    - `listNotes(): Promise<Note[]>`
    - `createNote(text: string, remindAt: Date, customTime: boolean): Promise<Note>`
    - `updateNote(id, patch)`, `markDone(id)`, `reopen(id, remindAt: Date)`, `snooze(id)` (remind_at = jetzt + 1 h), `deleteNote(id)`
    - `subscribeNotes(onChange: () => void): () => void`: Realtime-Kanal auf `notes` mit Filter `user_id=eq.<uid>`. Rückgabe ist eine Funktion zum Abmelden.

- [ ] **Step 1: Failing tests** für `groupNotes`: Notiz genau `now` → `due`. Reihenfolge in `due` und `upcoming` aufsteigend. `done` nach `updated_at` absteigend.
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: `notes-view.js`, `supabase.js` und `data.js` implementieren**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** `feat: Datenzugriff und Listen-Gruppierung`

---

### Task 5: Oberfläche (Login, Hauptansicht, Bearbeiten, Einstellungen)

**Files:**
- Create: `index.html`, `src/main.js`, `src/style.css`, `src/ui/login.js`, `src/ui/app.js`, `src/ui/edit.js`, `src/ui/settings.js`

**Interfaces:**
- Consumes: alles aus `data.js` (Task 4), `time.js` (Task 1), `notes-view.js` (Task 4). Push-Schalter und iPad-Hinweis kommen erst in Task 6 dazu.
- Produces: Routen per Hash: `#/` Hauptansicht, `#/n/<id>` öffnet Bearbeiten-Dialog zur Notiz, `#/einstellungen`

Verhalten (aus Spec, Abschnitt Oberfläche):
- **Login:** E-Mail-Feld, Knopf „Link senden“, `signInWithOtp({ email, options: { emailRedirectTo: location.origin } })`, danach Hinweis „Link wurde gesendet – öffne ihn auf diesem Gerät“.
- **Hauptansicht:** Eingabefeld mit `autofocus` und Platzhalter „Was fällt dir ein?“. Enter speichert. Darunter „🔔 {formatWhen} (ändern)“. „ändern“ blendet ein `datetime-local` ein. Wird es gesetzt, gilt `customTime = true`, sonst `defaultRemindAt(new Date(), settings.default_time, settings.timezone)`. Nach dem Speichern: Feld leeren, Fokus bleibt, Zeitwahl zurück auf Standard. Abschnitte „Fällig“ (mit ✓ und ⏰), „Anstehend“ (mit `formatWhen`) und „Erledigt (n)“ eingeklappt.
- **Bearbeiten:** Text, `datetime-local`, Knöpfe Speichern, Erledigt bzw. Wieder öffnen (mit `defaultRemindAt`), Löschen (mit `confirm`).
- **Einstellungen:** Standard-Uhrzeit (`<input type="time">`), Push-Schalter (Task 6), iPad-Hinweis (Task 6), Abmelden.
- **Sync:** `subscribeNotes` → neu laden. `visibilitychange` (sichtbar) → neu laden. Einmal pro Minute neu rendern, damit Notizen von „Anstehend“ nach „Fällig“ wandern.
- Dunkelmodus über Tailwind `dark:`-Klassen (Medienabfrage).

- [ ] **Step 1: Implementieren**
- [ ] **Step 2: `npm run build` → erfolgreich, keine Warnungen über fehlende Module**
- [ ] **Step 3: Smoke-Test mit Playwright** gegen `npm run preview`, mit gemocktem Backend (per `page.route` Antworten auf `**/rest/v1/**` und `**/auth/v1/**` simulieren, Session in `localStorage` vorbelegen). Erwartet: Eingabefeld fokussiert. Nach „Test“ + Enter geht ein POST an `/rest/v1/notes` mit `remind_at` gleich der nächsten Standardzeit. Screenshot zur Kontrolle.
- [ ] **Step 4: Commit** `feat: Oberfläche`

---

### Task 6: PWA, Service Worker und Push-Abo

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`, `src/lib/push.js`
- Modify: `src/ui/settings.js` (Push-Schalter, iPad-Hinweis), `index.html` (Manifest-Link, `apple-touch-icon`, `theme-color`), `src/main.js` (Service Worker registrieren)
- Test: `tests/sw.test.js`

**Interfaces:**
- Consumes: Payload aus `buildPayload` (Task 3). `VITE_SUPABASE_URL` für die URL von `note-action`.
- Produces:
  - `push.js`: `pushSupported()`, `pushActive()`, `enablePush()`, `disablePush()`, wie in Lagerverwaltung. `state.user.id` wird durch die User-ID aus `supabase.auth.getUser()` ersetzt. Fehlertext für iPad: „Auf dem iPad zuerst über Teilen → „Zum Home-Bildschirm“ installieren.“
  - `isStandalone(): boolean` (`matchMedia('(display-mode: standalone)')` oder `navigator.standalone`)
  - `sw.js`: Die Funktionen `notificationOptions(payload)` und `actionRequest(action, data, functionsUrl)` werden zusätzlich über `self.__test` zugänglich gemacht, damit Tests sie prüfen können.
    - `push` zeigt `showNotification("Don't forget", { body, tag: noteId, data: { noteId, token, url }, actions: [{action:'done', title:'Erledigt'}, {action:'snooze', title:'Später'}] })`
    - `notificationclick` mit `action` `done` oder `snooze` → `fetch(functionsUrl + '/note-action', { method:'POST', body: JSON.stringify({ id, token, action }) })`, ohne ein Fenster zu öffnen. Ohne `action` → App unter `url` fokussieren oder öffnen.
    - `functionsUrl` bekommt der Service Worker über Query-Parameter bei der Registrierung: `navigator.serviceWorker.register('/sw.js?fn=' + encodeURIComponent(VITE_SUPABASE_URL + '/functions/v1'))`.
  - Manifest: `name`/`short_name` `Don't forget`, `display: standalone`, `start_url: '/'`, Icons 192/512.

- [ ] **Step 1: Failing test** `tests/sw.test.js`: `sw.js` in einem Fake-`self` laden (`new Function`). Geprüft wird: `notificationOptions` liefert beide Actions und `tag = noteId`. `actionRequest('snooze', {noteId:'n1', token:'t'}, 'https://x/functions/v1')` liefert `{ url: 'https://x/functions/v1/note-action', body: '{"id":"n1","token":"t","action":"snooze"}' }`.
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: Implementieren.** Icons einfarbig mit Glocke, per Node-Skript einmalig erzeugt (Skript nicht committen). Einstellungen: Schalter „Benachrichtigungen auf diesem Gerät“. Bei iOS/iPadOS ohne `isStandalone()` erscheint stattdessen der Installationshinweis.
- [ ] **Step 4: `npm test` und `npm run build` → PASS**
- [ ] **Step 5: Commit** `feat: PWA, Service Worker mit Aktionen, Push-Abo`

---

### Task 7: README mit Einrichtungsanleitung

**Files:**
- Create: `README.md`

Inhalt in dieser Reihenfolge, auf Deutsch, Schritt für Schritt für einen Laien:
1. Supabase-Projekt anlegen und `001_schema.sql` im SQL-Editor ausführen. Extensions `pg_cron` und `pg_net` aktivieren.
2. Bei Authentication → URL Configuration die Vercel-URL als Site URL und Redirect URL eintragen.
3. VAPID-Schlüssel erzeugen mit `npx web-push generate-vapid-keys`.
4. Secrets setzen: `supabase secrets set VAPID_SUBJECT=mailto:… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… CRON_SECRET=…`
5. Im Vault `project_url` und `cron_secret` anlegen (SQL `select vault.create_secret(…)`) und den Cron-Block der Migration erneut ausführen.
6. Functions deployen mit `supabase functions deploy send-reminders --no-verify-jwt` und `supabase functions deploy note-action --no-verify-jwt`.
7. Vercel: Repository importieren und die Env-Variablen aus `.env.example` setzen.
8. Pro Gerät: Seite öffnen, installieren (Android: „App installieren“, iPad: Teilen → Zum Home-Bildschirm, PC: Installieren-Symbol in der Adressleiste), anmelden, Benachrichtigungen einschalten.
9. Test: Eine Notiz mit eigener Zeit in 2 Minuten anlegen und Gerät sperren.

- [ ] **Step 1: README schreiben**
- [ ] **Step 2: `npm test && npm run build` → alles grün**
- [ ] **Step 3: Commit und Push** `docs: Einrichtungsanleitung`
