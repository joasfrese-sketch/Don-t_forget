# Don't forget – Erweiterungen (Farben, Einstellungen, Nachfassen, Sprechen)

Stand: 2026-11-16 · baut auf `2026-11-16-erinnerungs-app-design.md` auf (gleiche Ziele, Nicht-Ziele und Anti-Ziele gelten weiter).

## Worum es geht

Vier Wünsche des Nutzers an die laufende App (Web-App auf Vercel, Supabase im Hintergrund):

1. **Farben:** Dunkelblau und Grautöne statt Orange und Schwarz.
2. **Einstellungen:** weiter schlicht und dezent, aber mit Hell/Dunkel-Umschalter und Kontoansicht.
3. **Schlauere Erinnerungen („Nachfassen“):** Eine Erinnerung ist gekommen, wurde aber nicht erledigt. Kam sie abends, gibt es am nächsten Morgen einen Hinweis, in die App zu schauen. Kam sie tagsüber, gibt es nach 5 Stunden einen Hinweis. Mehrere offene Erinnerungen ergeben nur **einen** gemeinsamen Hinweis.
4. **Sprechen:** Mikrofon antippen, sprechen, Claude macht daraus den passenden Termin.

Warum: Der Nutzer will nichts vergessen. Eine einzelne Push-Nachricht kann überhört werden. Das Nachfassen schließt diese Lücke. Das Sprechen macht das Festhalten noch schneller, wenn Tippen unpraktisch ist.

## Ziele

- Alles bleibt **schlicht**. Das schnelle Tippen (Text, Enter) bleibt der Hauptweg und wird nicht langsamer.
- Einheitliche Farbwelt in Hell und Dunkel: Dunkelblau als Akzent, Grautöne für Flächen und Text. Kein Schwarz, kein Orange mehr (auch nicht in App-Symbol, Browser-Leiste und Manifest).
- Hell/Dunkel wählbar: *System* (Vorgabe), *Hell*, *Dunkel*.
- Kontoansicht: eigene E-Mail-Adresse, Passwort ändern, Abmelden.
- Nachfassen mit einstellbaren Werten. Höchstens **ein** Hinweis pro Notiz, kein Dauer-Erinnern.
- Sprechen: Aus gesprochenem Text entstehen ein oder mehrere Notizen mit Zeit. Der Nutzer sieht vorher, was gespeichert würde, und bestätigt mit einem Tipp.

## Nicht-Ziele

- Konto löschen, Profilbild, Name (*meine Entscheidung*: nicht nötig, Löschen wäre unumkehrbar).
- Wiederkehrende Nachfass-Hinweise oder „Eskalation“ (mehrere Hinweise pro Notiz).
- Eigene Spracherkennung auf dem Server (kostet ein weiteres Konto, siehe Ansätze).
- Claude entscheidet ohne Rückfrage und speichert direkt.
- Sprachausgabe oder Dialog mit Claude. Es geht nur ums Anlegen von Terminen.

## Anti-Ziele

- Das Nachfassen wird zum Spam: mehrere Hinweise hintereinander, oder Hinweise zu Notizen, die längst erledigt sind.
- Falsch verstandene Sprache landet unbemerkt als falscher Termin.
- Jemand Fremdes kann über die Claude-Funktion Kosten auf dem Konto des Nutzers verursachen.
- Der API-Schlüssel für Claude wandert in die App oder in den Chat.

## Rahmenbedingungen

- **Kein Live-Test von hier möglich.** Das Netz dieser Sitzung blockiert `supabase.co` und `anthropic.com`. Alles wird mit Tests (SQL in PGlite, reine Funktionen, Browser-Test mit nachgebautem Backend) abgesichert. Der erste Echttest passiert auf den Geräten des Nutzers.
- **Claude-Schlüssel:** Der Nutzer legt bei console.anthropic.com einen API-Schlüssel an (getrennt vom claude.ai-Abo, Abrechnung nach Verbrauch, für kurze Notizen Cent-Beträge). Er trägt ihn selbst im Supabase-Dashboard als Function-Secret `ANTHROPIC_API_KEY` ein (Werkzeug `create_edge_function_secret` öffnet dafür die Eingabe, der Wert läuft nie durch den Chat). Anders als die selbst erzeugten VAPID-Schlüssel kommt dieser Schlüssel also **nicht** in den Vault (`app_secret`), sondern wird mit `Deno.env.get('ANTHROPIC_API_KEY')` gelesen.
- **Spracherkennung im Browser** (Web Speech API): Chrome/Edge auf Android und PC funktionieren. In der installierten iPad-App ist sie unzuverlässig, geprüft ist das nicht. Dort: Mikrofon-Knopf ausblenden, wenn nicht unterstützt, und den ✨-Knopf mit Tastatur-Diktat anbieten.
- **Datenschutz:** Der gesprochene Text geht über Supabase an Anthropic. In der Nachfass-Nachricht stehen keine Notiztexte (Sperrbildschirm), nur die Anzahl.
- Alle Texte der Oberfläche auf Deutsch. Titel der Push-Nachrichten: `Don't forget`.
- Bestehende Regeln gelten weiter: Kein Offline-Erfassen, jede Notiz hat eine Erinnerung, „Später“ = 1 Stunde.

## Ansätze

**Nachfassen**

- A) **Nachfass-Zeitpunkt pro Notiz speichern** (*gewählt*). Beim Erinnern wird `followup_at` berechnet. Der Minuten-Job holt fällige Nachfass-Zeitpunkte, fasst sie pro Nutzer zusammen und merkt sich, dass es gesendet wurde. Genau, höchstens einmal pro Notiz, gut testbar.
- B) Jede Minute neu aus dem Zustand berechnen, ohne zu speichern. Verworfen: Ohne Gedächtnis weiß die App nicht, was sie schon gemeldet hat. Das führt zu Dauer-Hinweisen oder braucht am Ende doch gespeicherten Zustand.

**Sprechen**

- A) **Browser wandelt Sprache in Text, Claude (Haiku) macht daraus Termine, Nutzer bestätigt** (*gewählt*). Schnell, günstig, nachvollziehbar. Dazu ein ✨-Knopf, der den Text im Eingabefeld an Claude schickt (iPad: Tastatur-Diktat).
- B) Audio aufnehmen und an einen Spracherkennungsdienst schicken. Funktioniert auch auf dem iPad. Verworfen: weiterer kostenpflichtiger Dienst und weiteres Konto, mehr Einrichtung.
- C) Claude speichert sofort ohne Bestätigung. Verworfen: Eine Falschhörung (falscher Tag, falsche Uhrzeit) fiele erst auf, wenn die Erinnerung ausbleibt.

**Farben, Einstellungen:** ein sinnvoller Weg. Zentrale Farbwerte als Tailwind-Theme-Farben (`brand` für das Dunkelblau, `surface` für Grautöne), alle verstreuten `amber-*` und `stone-*` werden ersetzt. Hell/Dunkel per Klasse am `<html>`-Element statt per Betriebssystem-Einstellung.

Der Nutzer hat die Umsetzung offen gelassen. Die Wahl liegt bei mir und ist hier als meine Entscheidung dokumentiert.

## Vom Nutzer entschieden

- Farben: Dunkelblau + Grautöne, ersetzt Orange und Schwarz.
- Einstellungen um Hell/Dunkel und Kontoansicht erweitern, weiter dezent.
- Nachfassen ist ein Hinweis auf bereits gekommene, nicht erledigte Erinnerungen. Vorgaben: **5 Stunden** nach dem Erinnern, bei Erinnerungen **ab 18:00** am nächsten Morgen **8:00**. Bei mehreren offenen Erinnerungen nur ein gemeinsamer Hinweis. Die drei Werte sind in den Einstellungen änderbar.
- Sprechen: Mikrofon, Claude interpretiert und erstellt den Termin.
- Reihenfolge: erst Farben und Einstellungen, dann Nachfassen, zuletzt Sprechen.

## Entwurf

### 1. Farben und Theme

- `tailwind.config.js`: `darkMode: 'class'`. Farbpaletten:
  - `brand` (Dunkelblau): Hell-Modus Akzent `#1e3a5f` (hover `#16304f`), Dunkel-Modus Akzent `#6b9bd8` (hell genug für Kontrast auf dunkelgrauem Grund).
  - `surface` (kühle Grautöne, leicht bläulich): Hell: Seitenhintergrund `#f1f4f8`, Karten weiß, Rahmen `#d9e0e9`, Text `#1f2a37`, Nebentext `#64748b`. Dunkel: Seitenhintergrund `#1b2430` (kein Schwarz), Karten `#243040`, Rahmen `#33425a`, Text `#e6ebf2`, Nebentext `#9aa8bd`.
  - Die genauen Werte sind eine Empfehlung. Der Umsetzer darf nachjustieren, solange Textkontrast mindestens WCAG AA erreicht.
- `src/style.css`: `.btn-primary`, `.btn-ghost`, `.field`, `.card` auf `brand`/`surface` umstellen. Alle direkten `amber-*`/`stone-*`-Klassen in `src/` und `index.html` ersetzen (aktuell ca. 45 Stellen).
- Theme-Wahl `system | light | dark` in `localStorage` (Schlüssel `theme`, **pro Gerät**, *meine Entscheidung*: so gibt es kein Aufblitzen beim Laden und das iPad darf anders sein als der PC). Ein kleines Skript im `<head>` von `index.html` setzt die Klasse `dark` vor dem ersten Zeichnen. `src/lib/theme.js` stellt `getTheme()`, `setTheme(mode)` und `applyTheme()` bereit. Bei `system` folgt die Klasse `prefers-color-scheme` auch live.
- `index.html` und `public/manifest.webmanifest`: `theme-color` und `background_color` auf Dunkelblau/Grau.
- App-Symbole (`icon-192.png`, `icon-512.png`, `badge-96.png`) neu erzeugen: Dunkelblauer Grund `#1e3a5f` mit weißer Glocke (Badge weiß auf transparent wie bisher). Hinweis: Installierte Apps auf Android/iPad übernehmen neue Symbole nicht immer sofort, evtl. neu installieren.

### 2. Einstellungen

Der Dialog bleibt ein schmaler Dialog, jetzt in Abschnitten:

```
Einstellungen
─ Darstellung        ( System | Hell | Dunkel )
─ Erinnerungen       Standard-Erinnerung um [17:00]
                     Benachrichtigungen auf diesem Gerät [an/aus]
                     ▸ Nachfassen   (eingeklappt)
                         [an/aus]  nach [5] Std.
                         ab [18:00] → am nächsten Morgen um [08:00]
─ Konto              deine@email.de
                     Passwort ändern   Abmelden
```

- Darstellung: Segment-Schalter, wirkt sofort, nur auf diesem Gerät.
- Nachfassen: Neue Spalten in `user_settings` (siehe unten). Eingeklappt, damit der Dialog schlicht bleibt.
- Konto: E-Mail aus `supabase.auth.getUser()`. „Passwort ändern“ zeigt ein Feld für das neue Passwort (min. 6 Zeichen) und ruft `supabase.auth.updateUser({ password })`. Abmelden wie bisher (Push-Abo dieses Geräts wird vorher entfernt).

### 3. Nachfassen

**Datenbank (`supabase/migrations/004_followup.sql`)**

- `user_settings` neu: `followup_enabled boolean not null default true`, `followup_hours int not null default 5 check (followup_hours between 1 and 24)`, `evening_from time not null default '18:00'`, `morning_at time not null default '08:00'`.
- `notes` neu: `followup_at timestamptz`, `followup_sent_at timestamptz`, Index `(followup_at) where followup_sent_at is null and status = 'open'`.
- `claim_due_notes()` (bestehend): setzt zusätzlich `followup_at`. Regel, in der Zeitzone des Nutzers aus `user_settings` (`timezone`):
  - Ortszeit von `now()` ≥ `evening_from` → nächster Kalendertag um `morning_at`.
  - Ortszeit von `now()` < `morning_at` (Nacht, z. B. 00:30 oder 03:00) → **am selben Tag** um `morning_at`, damit kein Hinweis mitten in der Nacht kommt.
  - Sonst → `now() + followup_hours`.
  - Ergibt der Wert im Fall „tagsüber“ eine Zeit ≥ `evening_from`, bleibt er so (5 Stunden später ist 5 Stunden später).
  - Ist `followup_enabled = false`, bleibt `followup_at` leer.
  - Fehlt eine `user_settings`-Zeile, gelten die Vorgaben.
  - **Kein Nachtrag für Altbestand:** Notizen, die vor der Migration schon erinnert wurden, behalten `followup_at = null` und bekommen keinen Hinweis (sonst käme direkt nach dem Einspielen ein Schwung Hinweise).
- Trigger `notes_before_update` (bestehend): Ändert sich `remind_at` (Später, neue Zeit, Wieder öffnen), werden zusätzlich `followup_at` und `followup_sent_at` auf `null` gesetzt. Status `done` verhindert jedes Nachfassen (die Abfrage prüft `status = 'open'`).
- Neue Funktion `claim_due_followups() returns table (user_id uuid, open_count int)`, nur `service_role`, `security definer`, `set search_path = ''`:
  - Findet Nutzer mit mindestens einer offenen Notiz, deren `followup_at <= now()` und `followup_sent_at is null` ist, und deren `user_settings.followup_enabled` an ist (fehlt die Zeile: an). **Ausschalten stoppt damit auch schon geplante Nachfass-Hinweise.** Geänderte Stunden oder Uhrzeiten wirken erst auf Erinnerungen, die danach kommen.
  - `open_count` = Zahl aller offenen Notizen dieses Nutzers mit `remind_at <= now()` (also genau das, was die App unter „Fällig“ zeigt), auch solche, deren eigener Nachfass-Zeitpunkt noch nicht erreicht ist.
  - Setzt `followup_sent_at = now()` **nur** für die Notizen, deren Nachfass-Zeitpunkt fällig war (atomar, `for update skip locked`). Mehrere gleichzeitig fällige Notizen ergeben so genau einen gemeinsamen Hinweis. Eine erst kürzlich erinnerte Notiz behält ihren eigenen Nachfass-Zeitpunkt und wird später noch einmal berücksichtigt. Jede Notiz löst weiterhin höchstens einen Hinweis aus.

**Edge Function `send-reminders` (bestehend)**

Nach den normalen Erinnerungen ruft sie `claim_due_followups()` auf und schickt pro Nutzer eine Nachricht an alle Geräte:
`{ kind: 'digest', title: "Don't forget", body: 'Du hast noch N offene Erinnerung(en). Schau in die App, was wann dran ist.', url: '/#/' }` (Einzahl bei 1). Keine Notiztexte. Gleiche Behandlung abgelaufener Abos wie bisher. Reine Helfer (`buildDigestPayload(count)`) kommen nach `_shared/reminders.ts`.

**Service Worker**

Nachrichten mit `kind: 'digest'` bekommen `tag: 'digest'`, **ohne** die Aktionsknöpfe Erledigt/Später. Ein Tipp öffnet die App auf der Hauptansicht. (Das behebt nebenbei den früheren Reviewer-Hinweis zu fehlendem `tag`: `tag`/`renotify` werden nur gesetzt, wenn ein Wert da ist.)

### 4. Sprechen

**Edge Function `parse-note`** (neu, `verify_jwt = true`)

- Eingabe (JSON): `{ text: string, now: ISO-Zeit, timezone: string, defaultTime: 'HH:MM' }`. Text maximal 1000 Zeichen.
- Prüft Anmeldung (Supabase prüft das JWT). Begrenzung: höchstens **50 Aufrufe pro Nutzer und Tag** (Tabelle `ai_usage(user_id uuid, day date, count int, primary key (user_id, day))`, atomar hochgezählt über eine kleine `security definer`-Funktion nur für `service_role`). *Meine Entscheidung*, schützt vor Kosten bei Missbrauch. Bei Überschreitung Antwort 429 mit deutscher Meldung.
- Ruft die Anthropic Messages API mit dem Modell `claude-haiku-5-5` und **einem** Werkzeug `create_notes` auf (erzwungener Werkzeugaufruf, damit die Antwort strukturiert ist). Der System-Prompt enthält aktuelles Datum, Wochentag und Zeitzone und erklärt: Texte kurz und im Wortlaut des Nutzers halten, relative Angaben („morgen“, „Freitag“, „in zwei Stunden“) in konkrete Ortszeit umrechnen, ohne genannte Uhrzeit **keine** Uhrzeit raten.
- Werkzeug-Schema: `notes: [{ text: string, date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null }]`, 1 bis 10 Einträge.
- Antwort an die App: `{ notes: [...] }` nach Validierung (reine Funktion `validateParsed(raw)` in `_shared`, verwirft ungültiges Datum/Format, kürzt Texte auf 200 Zeichen). Der Anthropic-Schlüssel kommt aus `Deno.env.get('ANTHROPIC_API_KEY')`.
- Fehlerfälle: Schlüssel fehlt oder API-Fehler → 502 mit klarer deutscher Meldung („Claude ist gerade nicht erreichbar, bitte tippen“). Es wird nie etwas ungefragt gespeichert.

**App**

- `src/lib/resolve-parsed.js`: `resolveParsed(notes, now, settings) → [{ text, remindAt: Date, custom: boolean }]`. Die Zeitumrechnung macht die App mit den bereits getesteten Funktionen `zonedToUtc`/`defaultRemindAt`, nicht das Modell:
  - `date` und `time` vorhanden → `zonedToUtc(date, time, tz)`, `custom = true`.
  - Nur `date` → Standardzeit des Nutzers an diesem Tag, `custom = true`.
  - Nur `time` → heute, liegt die Zeit schon hinter uns, morgen.
  - Beides leer → `defaultRemindAt(...)`, `custom = false`.
  - Liegt das Ergebnis in der Vergangenheit, wird es auf die nächste Standardzeit gesetzt und in der Vorschau markiert.
- `src/lib/speech.js`: kapselt `SpeechRecognition`/`webkitSpeechRecognition` (`lang: 'de-DE'`, `interimResults: true`), `speechSupported()`, `startListening({ onText, onEnd, onError })`, `stop()`.
- `src/lib/ai.js`: `parseNotes(text)` ruft die Funktion `parse-note` mit der Sitzung des Nutzers auf.
- `src/ui/voice.js`: Bedienung:
  - Hauptansicht: Neben dem Eingabefeld ein Mikrofon-Knopf (nur wenn `speechSupported()`) und ein ✨-Knopf (aktiv, sobald im Feld Text steht).
  - Mikrofon: Tippen startet, Live-Text erscheint im Feld, erneutes Tippen oder Sprechpause beendet. Danach automatisch „Claude versteht …“.
  - ✨ schickt den Feldtext an `parse-note`.
  - Vorschau als Dialog: pro erkannter Notiz eine Zeile mit Text und Zeit (`formatWhen`), jede einzeln antippbar zum Ändern (Text, Zeit) oder Entfernen. Knöpfe: **Speichern** (legt alle an, leert das Feld) und **Abbrechen** (Text bleibt im Feld erhalten, damit man ihn normal speichern kann).
  - Fehler (kein Mikrofon-Recht, nicht erreichbar, Limit): kurze Meldung, der erkannte Text bleibt im Feld.

## Tests (Test zuerst, wie bisher)

- `tests/followup.test.js` (PGlite): Erinnerung um 14:00 → `followup_at` 19:00 Ortszeit; Erinnerung um 18:00 und um 22:00 → nächster Tag 08:00; Erinnerung um 00:30 und 03:00 → derselbe Tag 08:00; Sommer-/Winterzeit; Nachfassen aus → leer; `claim_due_followups` zählt alle offenen erinnerten Notizen, liefert pro Nutzer eine Zeile, markiert nur die fälligen (eine eben erst erinnerte Notiz behält ihren Nachfass-Zeitpunkt und bekommt später ihren eigenen Hinweis), zweiter Aufruf leer; Ausschalten in `user_settings` stoppt bereits geplante Hinweise; erledigte Notiz löst nichts aus; „Später“/neue Zeit setzt zurück; nicht aufrufbar für `authenticated`; Nutzer ohne `user_settings`-Zeile bekommt die Vorgaben; RLS-Prüfung der neuen Spalten.
- `tests/reminders.test.ts`: `buildDigestPayload` (Einzahl/Mehrzahl, keine Notiztexte), `validateParsed` (gültig, kaputtes Datum, zu lange Texte, leere Liste, mehr als 10).
- `tests/resolve-parsed.test.js`: alle Fälle der Zeitregeln oben, inkl. Vergangenheit und Zeitumstellung.
- `tests/theme.test.js`: `getTheme`/`setTheme`/`applyTheme` mit `system`, `light`, `dark`.
- `tests/sw.test.js` (erweitern): Digest ohne Aktionsknöpfe, mit `tag: 'digest'`; normale Nachricht unverändert; Nachricht ohne `noteId` wirft nicht.
- Browser-Test (`tests/e2e/smoke.mjs` erweitern, Backend nachgebaut): Theme-Umschalter ändert die Klasse und bleibt nach Neuladen; Konto zeigt E-Mail; Nachfass-Einstellungen werden gespeichert; ✨ mit nachgebauter `parse-note`-Antwort zeigt Vorschau und speichert die erwarteten `remind_at`-Werte; Mikrofon-Knopf fehlt, wenn die Spracherkennung nicht da ist.

## Auslieferung

**Es geht nichts live, bevor der Nutzer es freigibt.** Die Umsetzung endet mit „fertig zur Abnahme“ (Tests grün, Prüfung des gesamten Codes). Erst nach seiner Zusage folgt die Auslieferung, und zwar **alle drei Teile zusammen** in dieser Reihenfolge, weil die neue `send-reminders` die neue Datenbankfunktion braucht:

- Migrationen auf das Supabase-Projekt `Don't_forget` (Projekt-ID `<projekt-id>`) per `apply_migration`, anschließend Sicherheits-Advisor prüfen. Auf dem Projekt sind bisher `001_schema`, `002_app_secret` und `003_hardening` eingespielt. Die Änderungen aus `003_hardening` (fester `search_path` am Trigger, `pg_net` im Schema `extensions`) stehen schon in `001_schema.sql` des Repositorys, deshalb gibt es dort keine eigene Datei. Die neuen Dateien heißen `004_followup.sql` und `005_ai_usage.sql`.
- Edge Functions neu hochladen (`send-reminders` ersetzt, `parse-note` neu).
- `ANTHROPIC_API_KEY` trägt der Nutzer selbst ein. Bis dahin zeigt die App bei ✨/Mikrofon die Meldung „Claude ist noch nicht eingerichtet“. Alles andere läuft schon.
- App auf Vercel neu veröffentlichen (Projekt `dont-forget`).
- Arbeit auf dem Branch `claude/tender-cannon-r3cb03` (Repository `/home/user/don-t_forget`). Das Zusammenführen in `main` macht der Nutzer per Zusage. Ein Veröffentlichen aus dem Branch ist bei Vercel nur eine Vorschau-Version, die Live-Version folgt erst mit `main`.
- README: Abschnitt zum Claude-Schlüssel, neue Einstellungen, Hinweis zum iPad.

## Dem Umsetzer überlassen

- Genaue Farbwerte (innerhalb der Kontrastvorgabe), Abstände, Icons, Segment-Schalter-Gestaltung.
- Dateiaufteilung im Rahmen der oben genannten Dateien.
- Wortlaut der Fehlermeldungen (deutsch, kurz).
- Wie der Mikrofon-Knopf Aufnahmezustand zeigt (z. B. Farbe/Puls).

## Meine Entscheidungen (zur Kontrolle)

1. Hell/Dunkel gilt **pro Gerät**, Vorgabe „System“.
2. Konto löschen ist kein Teil dieser Runde.
3. **Höchstens ein** Nachfass-Hinweis pro Notiz; kein Wiederholen.
4. Nachricht nennt nur die **Anzahl**, keine Notiztexte (Sperrbildschirm).
5. Beim Nachfassen zählt „offen“ = alles, was die App unter „Fällig“ zeigt.
6. Claude Haiku (`claude-haiku-5-5`), Limit **50 Aufrufe pro Tag** und Nutzer.
7. Vorschau mit Bestätigung statt automatisch speichern. Mehrere Termine pro Satz sind erlaubt (bis 10).
8. Die App rechnet Datum und Uhrzeit um, nicht das Modell.
9. ✨-Knopf als Weg für Tastatur-Diktat auf dem iPad, weil die Browser-Spracherkennung dort unsicher ist.
10. Neue App-Symbole in Dunkelblau; installierte Apps brauchen evtl. eine Neuinstallation, um sie zu zeigen.
11. Ein gemeinsamer Nachfass-Hinweis markiert nur die Notizen, deren Nachfass-Zeitpunkt fällig ist. Eine eben erst erinnerte Notiz bekommt später ihren eigenen Hinweis (so geht keine verloren).
12. Erinnerungen in der Nacht (vor 08:00) werden am selben Morgen um 08:00 nachgefasst, nicht mitten in der Nacht.
13. Ausschalten des Nachfassens stoppt auch schon geplante Hinweise. Geänderte Zeiten gelten erst für spätere Erinnerungen.
14. Notizen, die vor der Einführung schon erinnert wurden, bekommen keinen Nachfass-Hinweis.
15. Nichts geht live, bevor der Nutzer zustimmt. Alle drei Teile werden gemeinsam ausgeliefert.
