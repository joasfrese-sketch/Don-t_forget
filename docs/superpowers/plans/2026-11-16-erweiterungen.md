# Don't forget – Erweiterungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Farbwelt in Dunkelblau/Grau, Einstellungen mit Hell/Dunkel und Konto, Nachfass-Hinweise für offene Erinnerungen und eine Sprach-/KI-Eingabe, die aus gesprochenem Text Termine macht.

**Architecture:** Bestehende Vite-Vanilla-JS-App und Supabase (Postgres, Edge Functions, pg_cron) werden erweitert. Farben kommen aus einer einzigen Quelle (`palette.js`), die Tailwind als CSS-Variablen ausgibt. Nachfassen speichert pro Notiz `followup_at`. Der minütliche Job `send-reminders` schickt zusätzlich einen gemeinsamen Hinweis pro Nutzer. Die neue Edge Function `parse-note` ruft Claude Haiku mit einem erzwungenen Werkzeugaufruf auf. Die App rechnet Datum und Uhrzeit selbst um und zeigt vor dem Speichern eine Vorschau.

**Tech Stack:** Vite 5, Tailwind 3, supabase-js 2, Vitest, PGlite (SQL-Tests), Deno Edge Functions, Anthropic Messages API (`fetch`, keine neue Bibliothek).

**Spec:** `docs/superpowers/specs/2026-11-16-erweiterungen-design.md` (Eltern-Spec: `docs/superpowers/specs/2026-11-16-erinnerungs-app-design.md`)

## Global Constraints

- Oberfläche auf Deutsch. Titel der Push-Nachrichten: `Don't forget`.
- Keine neue npm-Abhängigkeit. Der Anthropic-Aufruf geht per `fetch`.
- Kein Schwarz und kein Orange mehr (App, Manifest, `theme-color`, Symbole). Textkontrast mindestens WCAG AA (4,5:1), in Hell und Dunkel.
- Hell/Dunkel: `system` (Vorgabe) | `light` | `dark`, gespeichert **pro Gerät** in `localStorage` unter dem Schlüssel `theme`.
- Nachfassen-Vorgaben: `followup_enabled = true`, `followup_hours = 5`, `evening_from = '18:00'`, `morning_at = '08:00'`. Höchstens **ein** Nachfass-Hinweis pro Notiz. Die Nachricht nennt nur die Anzahl, keine Notiztexte.
- Claude-Modell: `claude-haiku-5-5`. Limit 50 Aufrufe pro Nutzer und Tag. Text höchstens 1000 Zeichen, höchstens 10 Notizen pro Antwort, Notiztext höchstens 200 Zeichen.
- Der Anthropic-Schlüssel steht nur als Function-Secret `ANTHROPIC_API_KEY` (nie im Code, im Chat oder im Vault).
- Es geht nichts live, bevor der Nutzer zustimmt (siehe Task 9). Arbeit auf dem Branch `claude/tender-cannon-r3cb03`, Repository `/home/user/don-t_forget`.
- Supabase-Projekt `Don't_forget`, ID `slejmuspmlqddefifsxw`. Live eingespielt sind `001_schema`, `002_app_secret`, `003_hardening` (dessen Inhalt steht schon in `001_schema.sql`). Neue Migrationen heißen `004_followup.sql` und `005_ai_usage.sql`.
- Von dieser Sitzung aus sind `supabase.co` und `anthropic.com` nicht erreichbar. Alles wird mit Tests und nachgebautem Backend abgesichert. Edge-Function-Dateien (`index.ts`) lassen sich nicht ausführen, ihre Logik liegt deshalb in testbaren `_shared`-Dateien.

## Review Focus

1. **Erinnerung in der Nacht (00:30, 03:00):** Nachfassen am selben Tag um 08:00, nicht um 05:30 oder 08:00 nach 5 Stunden. (Task 3)
2. **Zwei Notizen mit verschiedenen Zeiten:** Eine eben erst erinnerte Notiz verliert durch einen gemeinsamen Hinweis ihren eigenen Nachfass-Zeitpunkt nicht. (Task 3)
3. **Notiz wird nach dem Erinnern erledigt, verschoben („Später“) oder das Nachfassen wird ausgeschaltet:** Es kommt kein Hinweis. (Task 3)
4. **Claude liefert Unbrauchbares:** kaputtes Datum, mehr als 10 Einträge, leere Liste, Zeit ohne Datum, Zeitpunkt in der Vergangenheit. Nichts davon darf zu einem falschen oder abstürzenden Speichern führen. (Task 6 und 7)
5. **Sprache und KI fallen aus:** Mikrofon-Recht verweigert, Spracherkennung nicht vorhanden, Schlüssel nicht eingerichtet, Tageslimit, Netzfehler. Der erkannte Text bleibt im Eingabefeld, es erscheint eine deutsche Meldung, die App bleibt bedienbar. (Task 6 und 7)
6. **Ungültiger Wert in `localStorage` für `theme`:** fällt auf `system` zurück und wirft nicht. (Task 1)

---

## File Structure

```
palette.js                          Farbwerte (Quelle für Tailwind, Test)
tailwind.config.js                  Theme-Farben + CSS-Variablen aus palette.js, darkMode: 'class'
src/style.css                       Komponentenklassen auf neue Farben
src/lib/theme.js                    Hell/Dunkel-Logik
src/lib/account.js                  validateNewPassword
src/lib/followup-settings.js        validateFollowup
src/lib/resolve-parsed.js           KI-Ergebnis → Notizen mit Zeit
src/lib/ai.js                       parseNotes + Fehlertexte
src/lib/speech.js                   Spracherkennung im Browser
src/lib/data.js                     (ändern) erweiterte Einstellungen
src/ui/settings.js                  (ändern) Abschnitte
src/ui/voice.js                     Mikrofon, ✨, Vorschau
src/ui/app.js                       (ändern) Knöpfe einbinden
supabase/migrations/004_followup.sql, 005_ai_usage.sql
supabase/functions/_shared/reminders.ts   (ändern) buildDigestPayload
supabase/functions/_shared/parse.ts       Prompt, Schema, Validierung
supabase/functions/send-reminders/index.ts (ändern)
supabase/functions/parse-note/index.ts
public/sw.js, index.html, manifest, Symbole
tests/: palette, theme, account, followup (SQL), followup-settings, reminders (ändern), parse, resolve-parsed, ai, sw (ändern), schema (ändern), e2e/smoke.mjs (ändern)
```

---

### Task 1: Farbwelt und Hell/Dunkel-Logik

**Files:**
- Create: `palette.js`, `src/lib/theme.js`, `tests/palette.test.js`, `tests/theme.test.js`
- Modify: `tailwind.config.js`, `src/style.css`, `index.html`, `public/manifest.webmanifest`, alle `src/**/*.js` mit `amber-*`/`stone-*`-Klassen, `public/icon-192.png`, `public/icon-512.png`, `public/badge-96.png`

**Interfaces:**
- Produces:
  - `palette.js`: `export const palette: { light: Roles, dark: Roles }` mit `Roles = { page, card, line, ink, muted, brand, brandHover, onBrand, danger }` (Hex-Strings).
  - Tailwind-Farben (Klassen `bg-page`, `bg-card`, `border-line`, `text-ink`, `text-muted`, `bg-brand`, `hover:bg-brand-hover`, `text-brand`, `text-on-brand`, `text-danger`), per CSS-Variablen `--c-<rolle>` (RGB-Kanäle), umgeschaltet über die Klasse `dark` am `<html>`.
  - `theme.js`: `resolveDark(mode: 'system'|'light'|'dark', systemPrefersDark: boolean): boolean`, `readTheme(storage: { getItem(k: string): string | null }): 'system'|'light'|'dark'` (fehlend, ungültig oder werfend → `'system'`), `saveTheme(mode, storage: { setItem(k, v): void }): void` (schluckt Fehler), `applyTheme(mode, root: { classList: { toggle(c: string, on: boolean): void } }, systemPrefersDark: boolean): void`, `initTheme(): void` (Browserkleber: liest `localStorage`, `matchMedia('(prefers-color-scheme: dark)')`, hört auf dessen `change`) und `setTheme(mode): void` (speichert und wendet an).

Farbwerte (Empfehlung aus dem Spec, bei rotem Kontrasttest nachjustieren):
Hell: page `#f1f4f8`, card `#ffffff`, line `#d9e0e9`, ink `#1f2a37`, muted `#64748b`, brand `#1e3a5f`, brandHover `#16304f`, onBrand `#ffffff`, danger `#b42318`.
Dunkel: page `#1b2430`, card `#243040`, line `#33425a`, ink `#e6ebf2`, muted `#9aa8bd`, brand `#6b9bd8`, brandHover `#84aee3`, onBrand `#0f1b2d`, danger `#f97066`.

- [ ] **Step 1: Failing tests schreiben**

`tests/palette.test.js`:
  - `it('Textpaare erreichen WCAG AA in Hell und Dunkel')`: Kontrastverhältnis (relative Luminanz nach WCAG) ≥ 4,5 für ink/page, ink/card, muted/page, muted/card, brand/page, brand/card, onBrand/brand, danger/page, danger/card, jeweils in `light` und `dark`.
  - `it('kein Schwarz und kein Orange in der Palette')`: keine Rolle ist `#000000` oder `#000`, und kein Wert hat Rot-Anteil > 200 bei Blau-Anteil < 80.
  - `it('src und index.html nutzen keine amber-/stone-Klassen mehr')`: liest alle `src/**/*.js` und `index.html` und prüft per Regex `/\b(amber|stone)-\d{2,3}\b/` auf keinen Treffer. (Liest auch `.css`.)

`tests/theme.test.js`:
  - `resolveDark`: `system`+true → true, `system`+false → false, `dark`+false → true, `light`+true → false.
  - `readTheme`: `'dark'` → `'dark'`; `null` → `'system'`; `'blau'` → `'system'`; Speicher wirft → `'system'`.
  - `saveTheme` ruft `setItem('theme', 'dark')`; wirft der Speicher, kommt keine Ausnahme heraus.
  - `applyTheme('dark', root, false)` schaltet `dark` ein; `applyTheme('system', root, true)` ebenfalls; `applyTheme('light', root, true)` schaltet aus.
  - `it('Inline-Skript im head setzt die Klasse vor dem ersten Zeichnen')`: liest das `<script id="theme-init">` aus `index.html`, führt es mit `new Function('localStorage','matchMedia','document', code)` und gefälschten Objekten aus (`theme='dark'` → `classList.toggle('dark', true)`; kein Wert und `matchMedia(...).matches = true` → `true`).

- [ ] **Step 2: `npx vitest run tests/palette.test.js tests/theme.test.js` → FAIL** (Module fehlen; die amber/stone-Prüfung schlägt an den bestehenden Klassen fehl).

- [ ] **Step 3: `palette.js` und `src/lib/theme.js` implementieren** (Signaturen oben). In `tailwind.config.js`: `darkMode: 'class'`, `theme.extend.colors` mit `rgb(var(--c-<rolle>) / <alpha-value>)` für alle Rollen (Klassenname `brand-hover`/`on-brand` entsprechend), und ein Plugin mit `addBase`, das aus `palette` die Blöcke `:root` und `.dark` mit den RGB-Kanälen erzeugt.

- [ ] **Step 4: Klassen ersetzen.** Abbildung: Seitenhintergrund (`stone-50`/`stone-950`) → `bg-page`; Karten und Felder (`white`/`stone-900`) → `bg-card`; Rahmen und Ringe (`stone-200/300/700/800`, `stone-100` bei `divide-`) → `border-line`/`ring-line`/`divide-line`; Haupttext (`stone-900`/`stone-100`) → `text-ink`; Nebentext (`stone-300/400/500/600`) → `text-muted`; Akzentknöpfe (`amber-500/600`) → `bg-brand hover:bg-brand-hover text-on-brand`; Akzenttext/Links (`amber-600`) → `text-brand`; Hinweisfläche (`amber-50/100/900/950`) → `bg-brand/10 text-ink`; Fehlertext (`red-600`) → `text-danger`. In `src/style.css` `.btn-primary`, `.btn-ghost`, `.field`, `.card` neu fassen (Fokusring `ring-brand/30`). `index.html`: `<body class="bg-page text-ink antialiased">`, `<meta name="theme-color" content="#1e3a5f">` und ein Inline-Skript `<script id="theme-init">` im `<head>` (liest `localStorage.getItem('theme')`, fällt bei Fehler/ungültig auf `system` zurück, setzt `document.documentElement.classList.toggle('dark', …)`). `src/main.js`: `initTheme()` beim Start aufrufen. Manifest: `theme_color` `#1e3a5f`, `background_color` `#f1f4f8`.

- [ ] **Step 5: Symbole neu erzeugen.** Mit dem vorinstallierten Playwright aus einem SVG (Glocke wie bisher, Grund `#1e3a5f`, Glocke weiß) `icon-192.png`, `icon-512.png`, `badge-96.png` (weiß auf transparent, unverändert in der Form) rendern. Das Skript wird nicht committet. Ergebnis ansehen.

- [ ] **Step 6: Tests und Ansicht prüfen.** `npx vitest run` → PASS. `node tests/e2e/smoke.mjs` → `SMOKE OK`. Zwei Screenshots der Hauptansicht (Hell: `emulateMedia({colorScheme:'light'})`, Dunkel: `'dark'`) ansehen: dunkelblauer Akzent, graue Flächen, nichts Schwarzes oder Oranges.

- [ ] **Step 7: Commit** `feat: Farbwelt Dunkelblau/Grau und Hell/Dunkel-Logik`

---

### Task 2: Einstellungen – Darstellung und Konto

**Files:**
- Create: `src/lib/account.js`, `tests/account.test.js`
- Modify: `src/ui/settings.js`, `tests/e2e/smoke.mjs`

**Interfaces:**
- Consumes: `readTheme`, `setTheme` aus Task 1.
- Produces: `validateNewPassword(pw: string): string | null` (`null` = gültig, sonst deutsche Meldung). Der Settings-Dialog zeigt die Abschnitte **Darstellung**, **Erinnerungen** (Standardzeit, Push wie bisher), **Konto**. Ein Platzhalter für Nachfassen kommt in Task 5.

- [ ] **Step 1: Failing test** `tests/account.test.js`: `validateNewPassword('12345')` → `'Mindestens 6 Zeichen.'`; `validateNewPassword('123456')` → `null`; `validateNewPassword('')` → `'Mindestens 6 Zeichen.'`.
- [ ] **Step 2: `npx vitest run tests/account.test.js` → FAIL.**
- [ ] **Step 3: `validateNewPassword` in `src/lib/account.js` implementieren.**
- [ ] **Step 4: Browser-Test erweitern (rot):** In `tests/e2e/smoke.mjs` nach dem Anlegen einer Notiz: `#openSettings` öffnet den Dialog; `#themeDark` anklicken → `document.documentElement.classList.contains('dark')` ist wahr; nach `page.reload()` weiterhin wahr; `#themeLight` → unwahr; `#accountEmail` zeigt `a@b.de` (der nachgebaute Auth-Aufruf liefert diese E-Mail); `#newPw` mit `123` und Klick auf `#changePw` zeigt `Mindestens 6 Zeichen.`; mit `geheim123` geht ein `PUT` an `**/auth/v1/user` mit `{ password: 'geheim123' }` raus (Aufruf mitprotokollieren). `node tests/e2e/smoke.mjs` → FAIL.
- [ ] **Step 5: `src/ui/settings.js` umbauen** (Layout laut Spec, Abschnitt „2. Einstellungen“): Segment-Schalter mit den IDs `themeSystem`, `themeLight`, `themeDark` (aktiver Zustand hervorgehoben, wirkt sofort über `setTheme`), Konto-Abschnitt mit `#accountEmail` (aus `supabase.auth.getUser()`), Passwortfeld `#newPw`, Knopf `#changePw` (nutzt `validateNewPassword`, dann `supabase.auth.updateUser({ password })`, Toast „Passwort geändert“), Abmelden wie bisher. Dialog bleibt schmal und schlicht.
- [ ] **Step 6: `npx vitest run` und `node tests/e2e/smoke.mjs` → PASS/`SMOKE OK`.** Screenshot des Dialogs in Hell und Dunkel ansehen.
- [ ] **Step 7: Commit** `feat: Einstellungen mit Darstellung und Konto`

---

### Task 3: Nachfassen in der Datenbank

**Files:**
- Create: `supabase/migrations/004_followup.sql`, `tests/followup.test.js`
- Modify: `tests/schema.test.js` (Migrationsliste um `'004_followup.sql'` erweitern)

**Interfaces:**
- Produces (Spalten und Funktionen wie im Spec, Abschnitt „3. Nachfassen“):
  - `user_settings` neu: `followup_enabled boolean not null default true`, `followup_hours int not null default 5 check (followup_hours between 1 and 24)`, `evening_from time not null default '18:00'`, `morning_at time not null default '08:00'`, `check (evening_from > morning_at)`.
  - `notes` neu: `followup_at timestamptz`, `followup_sent_at timestamptz`, Index `notes_followup_idx on notes (followup_at) where followup_sent_at is null and status = 'open'`.
  - `public.followup_time(p_now timestamptz, p_tz text, p_evening time, p_morning time, p_hours int) returns timestamptz`, `immutable`, `set search_path = ''`: Ortszeit ≥ `p_evening` → nächster Kalendertag um `p_morning`; Ortszeit < `p_morning` → selber Tag um `p_morning`; sonst `p_now + p_hours Stunden`. Ortsdatum plus Uhrzeit wird mit `timestamp … at time zone p_tz` zurückgerechnet (so stimmen Sommer-/Winterzeit).
  - `public.followup_for_user(p_user uuid, p_now timestamptz) returns timestamptz`, `security definer`, `set search_path = ''`: liest `user_settings` (fehlende Zeile → Vorgaben), liefert `null`, wenn `followup_enabled = false`, sonst `followup_time(...)`.
  - `claim_due_notes()` (ersetzen): wie bisher, setzt zusätzlich `followup_at = public.followup_for_user(user_id, now())`.
  - Trigger `notes_before_update` (ersetzen, `set search_path = ''` beibehalten): ändert sich `remind_at`, werden `sent_at`, `followup_at`, `followup_sent_at` auf `null` gesetzt und `action_token` neu erzeugt.
  - `public.claim_due_followups() returns table (user_id uuid, open_count int)`, `security definer`, `set search_path = ''`, nur `service_role`: laut Spec (nur Nutzer mit `followup_enabled`, setzt `followup_sent_at` nur an den fälligen Notizen, `open_count` = alle offenen Notizen mit `remind_at <= now()`).
  - Die Funktionen `followup_time`, `followup_for_user`, `claim_due_followups` sind für `public`, `anon`, `authenticated` entzogen und für `service_role` freigegeben.
  - Altbestand wird nicht nachgetragen (`followup_at` bleibt `null`).

- [ ] **Step 1: Failing tests** in `tests/followup.test.js` (PGlite wie in `schema.test.js`, gleiche Stubs; `user_settings` wird vom Test mit Zeilen gefüllt, `now()` wird über direkte `followup_time`-Aufrufe mit festen Zeitpunkten geprüft):
  - `it('followup_time: 14:00 Berlin → 19:00 Berlin')` (`2026-11-16T13:00:00Z` → `2026-11-16T18:00:00Z`).
  - `it('followup_time: 18:00 und 22:00 → nächster Tag 08:00')` (`17:00Z` und `21:00Z` am 2026-11-16 → `2026-11-17T07:00:00Z`).
  - `it('followup_time: 00:30 und 03:00 → selber Tag 08:00')` (`2026-11-16T23:30:00Z` ist 00:30 am 17.11. → `2026-11-17T07:00:00Z`; `02:00Z` am 17.11. → ebenfalls `07:00Z`).
  - `it('followup_time: Zeitumstellung')`: `2026-10-24T20:00:00Z` (22:00 Berlin, MESZ) → `2026-10-25T07:00:00Z` (08:00 MEZ).
  - `it('claim_due_notes setzt followup_at nach den Einstellungen des Nutzers')`: Nutzer mit `followup_hours = 3` bekommt `sent_at + 3 h`, falls die Ortszeit tagsüber liegt (Test legt `remind_at` so, dass die Ortszeit zum Claim-Zeitpunkt unkritisch ist, oder prüft das Verhältnis `followup_at` gegen `followup_time(...)` mit demselben `sent_at`).
  - `it('followup_enabled = false → followup_at bleibt leer')`.
  - `it('Nutzer ohne user_settings bekommt Vorgaben')`.
  - `it('claim_due_followups: eine Zeile pro Nutzer, open_count zählt alle erinnerten offenen Notizen')`: drei offene erinnerte Notizen (zwei mit fälligem, eine mit späterem `followup_at`) → eine Zeile, `open_count = 3`.
  - `it('claim_due_followups markiert nur fällige Notizen; die spätere behält ihren Zeitpunkt')` und bekommt beim nächsten Fälligwerden ihren eigenen Hinweis (`followup_at` per Update in die Vergangenheit setzen, zweiter Aufruf liefert wieder eine Zeile, `open_count` entsprechend).
  - `it('zweiter Aufruf ohne neue fällige Notizen liefert nichts')`.
  - `it('erledigte Notiz löst keinen Hinweis aus')`, `it('Später (remind_at ändern) setzt followup_at und followup_sent_at zurück')`, `it('Nachfassen ausschalten stoppt bereits geplante Hinweise')` (Einstellung auf `false` nach dem Claim der Notiz, `claim_due_followups` liefert nichts).
  - `it('authenticated darf die neuen Funktionen nicht aufrufen')` (`followup_time`, `followup_for_user`, `claim_due_followups`).
  - `it('RLS: Nutzer B sieht die Nachfass-Spalten von Nutzer A nicht')`.
- [ ] **Step 2: `npx vitest run tests/followup.test.js` → FAIL.**
- [ ] **Step 3: `004_followup.sql` schreiben** (Spalten, Funktionen, Trigger, Rechte wie oben; idempotent mit `if not exists`/`create or replace`).
- [ ] **Step 4: `npx vitest run` → alles PASS** (inklusive der bestehenden `schema.test.js`).
- [ ] **Step 5: Commit** `feat: Nachfassen in der Datenbank (followup_at, claim_due_followups)`

---

### Task 4: Nachfass-Hinweise versenden

**Files:**
- Modify: `supabase/functions/_shared/reminders.ts`, `supabase/functions/send-reminders/index.ts`, `public/sw.js`, `tests/reminders.test.ts`, `tests/sw.test.js`

**Interfaces:**
- Consumes: `claim_due_followups()` aus Task 3.
- Produces: `buildDigestPayload(count: number): string` → JSON `{ kind: 'digest', title: "Don't forget", body, url: '/#/' }`, `body` = `Du hast noch 1 offene Erinnerung. Schau in die App, was wann dran ist.` bzw. `Du hast noch N offene Erinnerungen. Schau in die App, was wann dran ist.` Im Service Worker liefert `notificationOptions(p)` für `kind: 'digest'` ein Objekt mit `tag: 'digest'`, `renotify: true`, ohne `actions`, mit `data: { url }`; für normale Erinnerungen unverändert, aber `tag`/`renotify` nur, wenn `noteId` vorhanden ist.

- [ ] **Step 1: Failing tests.** `tests/reminders.test.ts`: `buildDigestPayload(1)` enthält `1 offene Erinnerung.` (Einzahl) und `kind: 'digest'`; `buildDigestPayload(3)` enthält `3 offene Erinnerungen.`; `body` enthält keine Notiztexte (Test ruft mit der Zahl auf, die Funktion hat gar keinen Textparameter, geprüft über die Signatur: `buildDigestPayload.length === 1`). `tests/sw.test.js`: `notificationOptions({kind:'digest', title, body, url:'/#/'})` hat `tag === 'digest'`, `actions` ist `undefined`, `data.url === '/#/'`; `notificationOptions({title:'x', body:'y'})` (ohne `noteId`) wirft nicht und hat kein `tag`; der bestehende Test für Erinnerungen bleibt grün.
- [ ] **Step 2: `npx vitest run tests/reminders.test.ts tests/sw.test.js` → FAIL.**
- [ ] **Step 3: Implementieren.** `buildDigestPayload` in `_shared/reminders.ts`. `public/sw.js` nach den Signaturen oben. `send-reminders/index.ts`: nach dem Verschicken der normalen Erinnerungen `rpc('claim_due_followups')` aufrufen, Abos der betroffenen Nutzer laden und pro Nutzer `buildDigestPayload(open_count)` an alle Geräte senden (TTL 3600, `urgency: 'normal'`, abgelaufene Abos 404/410 löschen wie bisher). Antwort um `followups` (Anzahl verschickter Hinweise) erweitern. Der frühe Rückgabepfad „keine fälligen Erinnerungen“ darf die Nachfass-Hinweise nicht überspringen.
- [ ] **Step 4: `npx vitest run` → PASS.**
- [ ] **Step 5: Commit** `feat: Nachfass-Hinweise (gemeinsamer Digest) und Service Worker`

---

### Task 5: Nachfassen in den Einstellungen

**Files:**
- Create: `src/lib/followup-settings.js`, `tests/followup-settings.test.js`
- Modify: `src/lib/data.js`, `src/ui/settings.js`, `src/main.js`, `tests/e2e/smoke.mjs`

**Interfaces:**
- Consumes: neue Spalten aus Task 3.
- Produces:
  - `DEFAULTS` in `data.js` = `{ default_time: '17:00', timezone: 'Europe/Berlin', followup_enabled: true, followup_hours: 5, evening_from: '18:00', morning_at: '08:00' }`.
  - `getSettings(): Promise<Settings>` liest alle sechs Felder (Zeiten auf `HH:MM` gekürzt, fehlende Felder aus `DEFAULTS`). `saveSettings(patch: Partial<Settings>): Promise<void>` schreibt nur die übergebenen Felder (Upsert mit `user_id`).
  - `validateFollowup(v: { followup_hours: number, evening_from: string, morning_at: string }): string | null` → `'Stunden: 1 bis 24.'` bei `followup_hours` außerhalb 1–24 oder nicht ganzzahlig; `'Abend muss nach dem Morgen liegen.'`, wenn `evening_from <= morning_at`; sonst `null`.
  - Dialog `openSettings(settings, onSaved)`: `onSaved` bekommt immer das **vollständige, zusammengeführte** Einstellungsobjekt.

- [ ] **Step 1: Failing tests** `tests/followup-settings.test.js`: `validateFollowup({followup_hours: 5, evening_from: '18:00', morning_at: '08:00'})` → `null`; Stunden `0`, `25`, `2.5` → `'Stunden: 1 bis 24.'`; `evening_from: '08:00', morning_at: '08:00'` und `evening_from: '07:00', morning_at: '08:00'` → `'Abend muss nach dem Morgen liegen.'`.
- [ ] **Step 2: `npx vitest run tests/followup-settings.test.js` → FAIL.**
- [ ] **Step 3: `validateFollowup` und die Änderungen in `data.js` implementieren.** `src/main.js`: der `onSaved`-Rückruf ersetzt `settings` durch das übergebene Objekt (unverändert, funktioniert mit dem vollständigen Objekt).
- [ ] **Step 4: Browser-Test erweitern (rot→grün):** Im Dialog `▸ Nachfassen` (`#followupToggle`) aufklappen; `#fuHours` auf `3` setzen, `change` auslösen → es geht ein `POST`/`PATCH` an `**/rest/v1/user_settings` mit `followup_hours: 3`; ungültig (`#fuHours` = `0`) → Meldung `Stunden: 1 bis 24.` und **kein** Schreibaufruf; `#fuEnabled` ausschalten → Schreibaufruf mit `followup_enabled: false`.
- [ ] **Step 5: `src/ui/settings.js` ergänzen:** eingeklappter Abschnitt „Nachfassen“ im Block „Erinnerungen“ mit `#fuEnabled` (Schalter), `#fuHours` (Zahl), `#evening` (`time`), `#morning` (`time`) und einem Satz „Nach X Std.; ab 18:00 am nächsten Morgen um 08:00“. Vor dem Speichern `validateFollowup` ausführen.
- [ ] **Step 6: `npx vitest run` und `node tests/e2e/smoke.mjs` → PASS/`SMOKE OK`.**
- [ ] **Step 7: Commit** `feat: Nachfass-Einstellungen`

---

### Task 6: Claude-Funktion `parse-note`

**Files:**
- Create: `supabase/migrations/005_ai_usage.sql`, `supabase/functions/_shared/parse.ts`, `supabase/functions/parse-note/index.ts`, `tests/parse.test.ts`
- Modify: `tests/schema.test.js` (Migrationsliste um `'005_ai_usage.sql'`; Test für das Limit)

**Interfaces:**
- Produces:
  - SQL: Tabelle `public.ai_usage(user_id uuid references auth.users on delete cascade, day date, count int not null default 0, primary key (user_id, day))` mit RLS an und ohne Policies (nur Server). `public.ai_usage_hit(p_user uuid, p_limit int, p_day date default current_date) returns boolean`, `security definer`, `set search_path = ''`, nur `service_role`: zählt atomar hoch (`insert … on conflict do update set count = count + 1 returning count`) und liefert `count <= p_limit`.
  - `_shared/parse.ts`:
    - `export type ParsedNote = { text: string; date: string | null; time: string | null }`
    - `export const TOOL: { name: 'create_notes'; description: string; input_schema: object }` (Schema: `notes: [{ text: string, date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null }]`, 1 bis 10 Einträge)
    - `describeNow(nowIso: string, timezone: string): string` → z. B. `Montag, 16.11.2026, 18:43 Uhr (Europe/Berlin)`
    - `buildSystemPrompt(nowDescription: string, defaultTime: string): string` (enthält `nowDescription`, die Regeln aus dem Spec: kurz und im Wortlaut halten, relative Angaben in Ortszeit umrechnen, ohne genannte Uhrzeit keine raten, `defaultTime` zur Orientierung)
    - `extractToolInput(apiResponse: unknown): unknown` (der `input` des ersten Blocks mit `type: 'tool_use'` und `name: 'create_notes'`, sonst `null`)
    - `validateParsed(raw: unknown): ParsedNote[]` (nur Einträge mit nicht-leerem `text` (getrimmt, auf 200 Zeichen gekürzt), `date` passend `^\d{4}-\d{2}-\d{2}$` **und** ein echtes Kalenderdatum, sonst `null`, `time` passend `^([01]\d|2[0-3]):[0-5]\d$`, sonst `null`; höchstens 10 Einträge; keine gültige Liste → `[]`)
    - `validateRequest(body: unknown): { text: string; now: string; timezone: string; defaultTime: string } | null` (Text getrimmt 1–1000 Zeichen, `now` parsebares Datum, `timezone` von `Intl.DateTimeFormat` akzeptiert, `defaultTime` passend `HH:MM`)
  - Function `parse-note` (`verify_jwt = true`): Ablauf laut Spec. Antworten: `200 { notes }`, Fehler als `{ error: 'invalid' | 'limit' | 'not_configured' | 'unavailable' }` mit Status 400 / 429 / 503 / 502. Anthropic-Aufruf: `POST https://api.anthropic.com/v1/messages`, Header `x-api-key`, `anthropic-version: 2023-06-01`, Body `{ model: 'claude-haiku-5-5', max_tokens: 1024, system, messages: [{ role: 'user', content: text }], tools: [TOOL], tool_choice: { type: 'tool', name: 'create_notes' } }`. Fehlendes `ANTHROPIC_API_KEY` → `not_configured`. Nutzer wird aus dem JWT per `admin.auth.getUser(jwt)` bestimmt.

- [ ] **Step 1: Failing tests.** `tests/parse.test.ts`: `describeNow('2026-11-16T17:43:00Z','Europe/Berlin')` → `Montag, 16.11.2026, 18:43 Uhr (Europe/Berlin)`; `buildSystemPrompt(...)` enthält die Beschreibung und die Standardzeit; `extractToolInput` findet den Block zwischen anderen Blöcken und liefert `null` ohne passenden; `validateParsed`: gültiger Eintrag bleibt; `date: '2026-02-30'` → `date: null`; `time: '25:00'` → `time: null`; Text mit 300 Zeichen → 200; leerer Text verworfen; 11 Einträge → 10; `null`, `{}`, `{notes: 'x'}` → `[]`; `validateRequest`: gültig; Text mit 1001 Zeichen → `null`; leerer Text → `null`; `timezone: 'Mars/Base'` → `null`; `defaultTime: '5pm'` → `null`. `tests/schema.test.js`: `ai_usage_hit` liefert 50-mal `true`, beim 51. Aufruf `false`; mit anderem `p_day` zählt neu; für `authenticated` nicht aufrufbar; `ai_usage` per RLS für `authenticated` nicht lesbar.
- [ ] **Step 2: `npx vitest run tests/parse.test.ts tests/schema.test.js` → FAIL.**
- [ ] **Step 3: `005_ai_usage.sql` und `_shared/parse.ts` implementieren.** (`describeNow` über `Intl.DateTimeFormat('de-DE', { timeZone, weekday: 'long', … })`.)
- [ ] **Step 4: `parse-note/index.ts` schreiben** (CORS wie `note-action`, nur `POST`; Reihenfolge: Anfrage prüfen → Nutzer aus JWT → Limit → Schlüssel prüfen → API → Antwort validieren). Ist `validateParsed(...)` leer, Antwort `200 { notes: [] }`.
- [ ] **Step 5: `npx vitest run` → PASS.**
- [ ] **Step 6: Commit** `feat: Edge Function parse-note (Claude Haiku) mit Tageslimit`

---

### Task 7: Sprechen und ✨ in der App

**Files:**
- Create: `src/lib/resolve-parsed.js`, `src/lib/ai.js`, `src/lib/speech.js`, `src/ui/voice.js`, `tests/resolve-parsed.test.js`, `tests/ai.test.js`
- Modify: `src/ui/app.js`, `tests/e2e/smoke.mjs`

**Interfaces:**
- Consumes: `zonedToUtc`, `defaultRemindAt`, `formatWhen`, `toLocalInputValue` (bestehend in `src/lib/time.js`), `createNote` (`src/lib/data.js`), Antwortformat von `parse-note` aus Task 6.
- Produces:
  - `resolveParsed(notes: ParsedNote[], now: Date, settings: { default_time: string, timezone: string }): { text: string; remindAt: Date; custom: boolean; adjusted: boolean }[]`:
    - `date` und `time` → `zonedToUtc(date, time, tz)`, `custom = true`.
    - nur `date` → Standardzeit des Nutzers an diesem Tag, `custom = true`.
    - nur `time` → heute zu dieser Zeit, liegt sie nicht in der Zukunft, morgen; `custom = true`.
    - beides leer → `defaultRemindAt(now, default_time, tz)`, `custom = false`.
    - Liegt das Ergebnis nicht in der Zukunft → `remindAt = defaultRemindAt(...)`, `custom = false`, `adjusted = true`; sonst `adjusted = false`.
  - `ai.js`: `parseNotes(text: string, settings): Promise<ParsedNote[]>` (ruft `supabase.functions.invoke('parse-note', { body: { text, now: new Date().toISOString(), timezone, defaultTime } })`), wirft `Error` mit der deutschen Meldung aus `aiErrorMessage(code)`. `aiErrorMessage(code: string): string`: `'not_configured'` → `Claude ist noch nicht eingerichtet.`, `'limit'` → `Tageslimit für die KI erreicht. Bitte tippen.`, `'invalid'` → `Das konnte ich nicht verarbeiten.`, sonst → `Claude ist gerade nicht erreichbar. Bitte tippen.`
  - `speech.js`: `speechSupported(): boolean`, `startListening(handlers: { onText(text: string): void; onEnd(): void; onError(code: string): void }): { stop(): void }` (`lang: 'de-DE'`, `interimResults: true`, `continuous: false`).
  - `voice.js`: `mountVoice(root: HTMLElement, ctx: { input: HTMLInputElement, getSettings(): Settings, onSaved(): void | Promise<void> }): void`. Fügt neben dem Eingabefeld den Mikrofon-Knopf `#micBtn` (nur wenn `speechSupported()`) und `#aiBtn` ✨ (aktiv nur bei nicht leerem Feld) ein. Die Vorschau ist ein Dialog (`openDialog`) mit je Zeile Text-Eingabe, `datetime-local` (`toLocalInputValue`), Entfernen-Knopf, Hinweis „Zeit angepasst“ bei `adjusted`; Knöpfe `#previewSave` und `#previewCancel`. Speichern legt jede verbleibende Zeile per `createNote(text, remindAt, custom)` an, leert das Feld und ruft `onSaved`. Abbrechen oder Fehler lassen den Text im Feld.

- [ ] **Step 1: Failing tests.** `tests/resolve-parsed.test.js` (feste `now = 2026-11-16T09:00:00Z`, Zone `Europe/Berlin`, Standardzeit `17:00`):
  - `date: '2026-11-20', time: '09:00'` → `2026-11-20T08:00:00.000Z`, `custom: true`.
  - nur `date: '2026-11-20'` → `2026-11-20T16:00:00.000Z`, `custom: true`.
  - nur `time: '18:30'` → `2026-11-16T17:30:00.000Z`, `custom: true`.
  - nur `time: '08:00'` (schon vorbei) → `2026-11-17T07:00:00.000Z`, `custom: true`.
  - beides `null` → `2026-11-16T16:00:00.000Z`, `custom: false`.
  - vergangenes Datum `2026-11-10`/`09:00` → `remindAt` `2026-11-16T16:00:00.000Z`, `custom: false`, `adjusted: true`.
  - nur `date` = heute bei `now = 2026-11-16T17:30:00Z` (Standardzeit schon vorbei) → `adjusted: true`, `remindAt` `2026-11-17T16:00:00.000Z`.
  - Reihenfolge der Notizen bleibt erhalten, leere Liste → `[]`.
  `tests/ai.test.js`: `aiErrorMessage` für alle vier Fälle und für `undefined`; `parseNotes` wirft bei `{ error: 'limit' }` die Limit-Meldung (mit gefälschtem `supabase`-Client über Abhängigkeitsübergabe oder Modul-Mock).
- [ ] **Step 2: `npx vitest run tests/resolve-parsed.test.js tests/ai.test.js` → FAIL.**
- [ ] **Step 3: `resolve-parsed.js`, `ai.js`, `speech.js` implementieren.**
- [ ] **Step 4: Browser-Tests erweitern (rot):** `tests/e2e/smoke.mjs`: (a) Ohne `SpeechRecognition` (Standard in Chromium headless) fehlt `#micBtn`, `#aiBtn` ist deaktiviert bei leerem Feld und aktiv bei Text. (b) Nachgebaute Antwort auf `**/functions/v1/parse-note` mit `{ notes: [{ text: 'Reifen wechseln', date: '2026-11-20', time: '09:00' }, { text: 'Zahnarzt anrufen', date: null, time: null }] }`: Text eintippen, `#aiBtn` → Vorschau mit zwei Zeilen und `heute 17:00` bzw. `Fr 20.11. 09:00`; `#previewSave` → zwei `POST` an `/rest/v1/notes` mit `remind_at` `2026-11-20T08:00:00.000Z` und `2026-11-16T16:00:00.000Z`; Feld leer. (c) Vorschau → Eintrag entfernen → nur ein `POST`. (d) `{ error: 'not_configured' }` (Status 503) → Meldung `Claude ist noch nicht eingerichtet.`, Text bleibt im Feld, kein `POST`. (e) Mit per `addInitScript` eingeschleuster Fake-`SpeechRecognition` (`start()` löst `onresult` mit „morgen Zahnarzt anrufen“ und danach `onend` aus): `#micBtn` sichtbar, Klick füllt das Feld und startet die Anfrage an `parse-note`. (f) Fake-`SpeechRecognition` mit `onerror('not-allowed')` → Meldung, App weiter bedienbar. Test läuft → FAIL.
- [ ] **Step 5: `voice.js` implementieren und in `src/ui/app.js` einbinden** (`mountVoice` nach dem Aufbau des Eingabeformulars; Platz für die Knöpfe neben dem Speichern-Knopf, gleiche Höhe, schlicht, Farben aus Task 1; Mikrofon zeigt beim Zuhören einen deutlichen Zustand, z. B. Farbwechsel und `aria-pressed`).
- [ ] **Step 6: `npx vitest run` und `node tests/e2e/smoke.mjs` → PASS/`SMOKE OK`.** Screenshots (Hell/Dunkel) von Hauptansicht mit Knöpfen und von der Vorschau ansehen.
- [ ] **Step 7: Commit** `feat: Sprechen und ✨ mit Vorschau`

---

### Task 8: README und Gesamtprüfung

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README ergänzen:** Abschnitt „Claude-Schlüssel“ (console.anthropic.com, Schlüssel anlegen, im Supabase-Dashboard unter Edge Functions → Secrets als `ANTHROPIC_API_KEY` eintragen, Hinweis auf Kosten pro Nutzung und das Tageslimit 50), Abschnitt „Neue Einstellungen“ (Darstellung, Nachfassen mit den drei Werten, Konto), Hinweis „Sprechen: Chrome/Edge funktionieren; auf dem iPad das Tastatur-Mikrofon benutzen und dann ✨ tippen“, Hinweis „neue Symbole evtl. App neu installieren“, Entwicklerteil: neue Tests.
- [ ] **Step 2: Gesamtlauf:** `npx vitest run` (alle grün), `node tests/e2e/smoke.mjs` (`SMOKE OK`), `npx vite build` (erfolgreich).
- [ ] **Step 3: Commit und Push auf den Branch** `docs: README für Erweiterungen` (nur `claude/tender-cannon-r3cb03`, nicht `main`).

---

### Task 9 (nur nach ausdrücklicher Freigabe des Nutzers): Auslieferung

Dieser Task läuft **erst, wenn der Nutzer nach Abschluss und Prüfung der Tasks 1–8 zugestimmt hat**. Vorher anhalten und fragen.

- [ ] **Step 1: Migrationen einspielen** auf `slejmuspmlqddefifsxw` mit `apply_migration` (`004_followup`, `005_ai_usage`). Danach `get_advisors` (security) → keine neuen Warnungen; `list_tables` zeigt neue Spalten und `ai_usage`.
- [ ] **Step 2: Edge Functions hochladen:** `send-reminders` (ersetzt, `verify_jwt: false`) mit `_shared/reminders.ts`, `parse-note` (neu, `verify_jwt: true`) mit `_shared/parse.ts`. Die minütlichen Aufrufe des Cron-Jobs prüfen (`net._http_response`: Status 200 und `{"claimed":0,"sent":0,"followups":0}`).
- [ ] **Step 3: Schlüssel:** `create_edge_function_secret` für `ANTHROPIC_API_KEY` auslösen. Der Nutzer trägt den Wert selbst im Dashboard ein.
- [ ] **Step 4: App veröffentlichen:** Vercel-Projekt `dont-forget` (`prj_k38Be9cTdr24GAx0VzAXs3dWKY22`, Team `team_lfqTBcq6Q6u0ZvSXSwGgfkn4`) per `create_deployment` aus dem Branch-Stand. Hinweis: Aus dem Branch ist das nur eine Vorschau-Version; die Live-Adresse folgt erst mit `main`. Dem Nutzer das sagen und die Zusammenführung in `main` vorschlagen.
- [ ] **Step 5: Abnahme auf den Geräten** gemeinsam mit dem Nutzer: Farben, Umschalter, Nachfass-Hinweis (Testwerte kurz stellen), Sprechen.
