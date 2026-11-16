# Don't forget – Design

Stand: 2026-11-16

## Worum es geht

Eine schlichte Notizen-App, die aufs Erinnern ausgerichtet ist. Wenn dem Nutzer
tagsüber etwas einfällt, hält er es in wenigen Sekunden fest. Zur passenden
Zeit kommt eine Push-Nachricht, die auf dem Sperrbildschirm sichtbar ist.
Er nutzt die App gleichzeitig auf einem **Android-Handy**, einem **iPad** und
einem **PC**, und alle Geräte zeigen denselben Stand.

Der wichtigste Maßstab ist Geschwindigkeit: App öffnen, tippen, speichern.
Mehr soll nicht nötig sein.

## Ziele

- **Schnell festhalten:** Beim Öffnen steht der Cursor direkt im Eingabefeld.
  Enter oder ein Knopf speichert die Notiz. Weitere Pflichtfelder gibt es nicht.
- **Standard-Erinnerungszeit:** Die Uhrzeit wird einmal in den Einstellungen
  festgelegt (Vorgabe 17:00). Jede neue Notiz wird automatisch für diese Zeit
  vorgemerkt.
  - Liegt die Standardzeit heute noch in der Zukunft, wird für heute erinnert.
  - Ist sie heute schon vorbei, wird am nächsten Tag zur Standardzeit erinnert.
- **Eigene Zeit pro Notiz:** Optional bekommt eine Notiz Datum und Uhrzeit,
  entweder beim Anlegen oder später beim Bearbeiten.
- **Push auf den Sperrbildschirm** auf allen Geräten, auf denen
  Benachrichtigungen aktiviert sind. Das funktioniert auch, wenn die App
  geschlossen ist.
- **Knöpfe in der Nachricht:** „Erledigt“ und „Später“ (+1 Stunde).
- **Synchron:** Änderungen auf einem Gerät erscheinen auf den anderen sofort,
  ohne neu zu laden.
- **Schlicht:** eine Hauptansicht und ein Einstellungsbereich.

## Nicht-Ziele (v1)

- Native Apps aus dem Play Store oder App Store
- Teilen mit anderen Personen, mehrere Nutzer pro Notiz
- Wiederkehrende Erinnerungen, Kategorien, Tags, Anhänge, Formatierung
- Offline-Erfassen ohne Netz (*meine Entscheidung*: v1 setzt eine Verbindung
  voraus; falls nötig, wird es später ergänzt)
- Notizen ganz ohne Erinnerung (*meine Entscheidung*: jede Notiz hat eine
  Erinnerung; „Erledigt“ räumt sie weg)

## Anti-Ziele

Die App ist gescheitert, wenn eins davon zutrifft, auch wenn sie technisch funktioniert:

- Das Festhalten dauert länger als ein paar Sekunden oder braucht mehrere Schritte.
- Erinnerungen kommen nicht, verspätet (mehr als ca. 1 Minute) oder doppelt.
- Die Oberfläche wird überladen.

## Rahmenbedingungen

- **iPad:** Web-Push funktioniert nur, wenn die App über „Zum Home-Bildschirm“
  installiert ist und das iPad iPadOS 16.4 oder neuer hat. Die Knöpfe in der
  Nachricht zeigt iPadOS nicht an. Ein Tipp auf die Nachricht öffnet dann
  die Notiz in der App, und dort gibt es „Erledigt“ und „Später“.
- **Android (Chrome) und PC (Chrome/Edge):** Push und Knöpfe in der Nachricht
  werden unterstützt.
- **Zeitzone:** Wird beim Speichern der Einstellungen aus dem Browser
  übernommen, Vorgabe Europe/Berlin. Die Standardzeit wird in dieser Zone
  ausgewertet, auch bei Sommer- und Winterzeit.
- **Kosten:** Supabase Free Tier und Vercel Hobby genügen.

## Ansätze

1. **Installierbare Web-App (PWA) mit Supabase und Vercel**, *gewählt*.
   Eine Codebasis für alle drei Geräte. Supabase übernimmt Datenbank,
   Anmeldung und Echtzeit-Sync. pg_cron prüft jede Minute, welche
   Erinnerungen fällig sind, und eine Edge Function verschickt den Web-Push.
   Der Aufbau ist derselbe wie im Projekt Lagerverwaltung des Nutzers, das
   ebenfalls Web-Push per Edge Function nutzt. Nachteil: Auf dem iPad sind
   Extraschritte nötig, und die Knöpfe in der Nachricht fehlen dort.
2. **Native Apps (Play Store und App Store):** Die Nachrichten wären robuster.
   Dafür sind ein Apple-Entwicklerkonto (99 €/Jahr) und eine eigene
   PC-Lösung nötig, und der Aufwand ist deutlich höher. Abgelehnt.
3. **Fertiger Dienst (z. B. Telegram-Bot):** Sehr schnell umgesetzt, aber
   keine eigene Notizen-App mit Einstellungen. Abgelehnt.

Der Nutzer hat Ansatz 1 gewählt, weil er mit dem wenigsten Aufwand alle
Anforderungen erfüllt und auf einem bekannten Aufbau basiert.

## Vom Nutzer entschieden

- Android-Handy, iPad und PC sollen synchron sein.
- Pauschale Erinnerungszeit in den Einstellungen, z. B. 17:00.
- Jede Notiz kann eine eigene Zeit bekommen.
- Notiz nach der Standardzeit erfasst → Erinnerung am nächsten Tag zur Standardzeit.
- Knöpfe „Erledigt“ und „Später“ (+1 Stunde) in der Nachricht.
- Anmeldung per E-Mail-Link (Magic Link), ohne Passwort.
- Ansatz 1.

## Entwurf

### Technik

- Vite und Vanilla JavaScript mit Tailwind, wie in der Lagerverwaltung.
  Kein Framework nötig, das hält die App klein und schnell.
- Supabase: Auth (Magic Link), Postgres mit Row Level Security, Realtime,
  Edge Functions, pg_cron und pg_net.
- Hosting auf Vercel als statische Seite.
- PWA: `manifest.webmanifest`, Icons, `sw.js` für Push und App-Hülle.
- *Meine Entscheidung:* ein **eigenes Supabase-Projekt**, getrennt von der
  Lagerverwaltung.

### Datenmodell

```
user_settings
  user_id        uuid PK → auth.users
  default_time   time        default '17:00'
  timezone       text        default 'Europe/Berlin'

notes
  id             uuid PK
  user_id        uuid → auth.users
  text           text not null
  remind_at      timestamptz not null
  custom_time    boolean default false   -- true = eigene Zeit gesetzt
  status         text  'open' | 'done'
  sent_at        timestamptz null        -- wann der Push für remind_at rausging
  action_token   text                    -- zufällig, für Knöpfe im Service Worker
  created_at, updated_at

push_subscriptions
  id, user_id, endpoint unique, p256dh, auth, created_at
```

RLS: Jeder Nutzer sieht und ändert nur seine eigenen Zeilen.

`remind_at` wird beim Anlegen im Client berechnet, aus der Standardzeit und
der Zeitzone (Regel siehe Ziele). Wird die Standardzeit geändert, bleiben
bestehende Notizen unverändert (*meine Entscheidung*).

### Verschicken der Erinnerungen

- pg_cron ruft jede Minute über pg_net die Edge Function `send-reminders` auf,
  abgesichert mit einem Secret-Header.
- Die Function holt alle Notizen mit `status = 'open'`, `remind_at <= now()`
  und `sent_at is null`. Sie setzt **zuerst** `sent_at` (atomar per
  `update … returning`), damit es keine Doppel-Pushes gibt, und schickt dann
  an alle Push-Abos des Nutzers.
- Payload: Titel „Don't forget“, Text der Notiz, Notiz-ID, `action_token`.
- Abgelaufene Abos (404/410) werden gelöscht.

### Knöpfe in der Nachricht

- Der Service Worker zeigt die Nachricht mit den Aktionen „Erledigt“ und
  „Später“ an.
- Bei einem Tipp auf einen Knopf ruft der Service Worker die Edge Function
  `note-action` auf, mit Notiz-ID, `action_token` und der gewählten Aktion.
  Der Service Worker hat keine Anmeldesitzung, deshalb dient das Token als
  Berechtigung.
  - `done` → `status = 'done'`
  - `snooze` → `remind_at = now() + 1h`, `sent_at = null`, neues `action_token`
- Ein Tipp auf die Nachricht selbst öffnet die App und springt zur Notiz.

### Oberfläche

```
┌──────────────────────────────┐
│ Don't forget            ⚙    │
├──────────────────────────────┤
│ [ Was fällt dir ein?      ] ⏎│
│   🔔 heute 17:00  (ändern)    │
├──────────────────────────────┤
│ Fällig                        │
│ • Mama zurückrufen      ✓  ⏰ │
├──────────────────────────────┤
│ Anstehend                     │
│ • Reifen wechseln  morgen 17:00│
│ • Rechnung zahlen  Fr 09:00   │
├──────────────────────────────┤
│ ▸ Erledigt (12)               │
└──────────────────────────────┘
```

- Unter dem Eingabefeld steht, wann erinnert wird. Mit „ändern“ öffnet sich
  eine Datums- und Zeitauswahl.
- Ein Tipp auf eine Notiz öffnet die Bearbeitung: Text, Zeit, Erledigt,
  Löschen.
- „Fällig“ enthält offene Notizen, deren Zeit erreicht ist, mit den Knöpfen
  ✓ Erledigt und ⏰ Später.
- „Erledigt“ ist eingeklappt. Erledigte Notizen kann man wieder öffnen
  oder löschen.
- Einstellungen (⚙): Standard-Uhrzeit, Benachrichtigungen auf diesem Gerät
  an/aus, Abmelden. Auf dem iPad gibt es einen Hinweis zur Installation
  über den Home-Bildschirm, solange die App nicht installiert ist.
- Dunkelmodus folgt dem System.

### Sync

Supabase Realtime auf `notes` (gefiltert nach `user_id`) hält die Liste auf
allen offenen Geräten aktuell. Beim Zurückkehren in die App
(`visibilitychange`) wird zusätzlich neu geladen.

## Dem Umsetzer überlassen

- Genaue Gestaltung (Farben, Abstände, Icons), solange es schlicht bleibt
- Aufteilung in Dateien und Module
- Wie die Datums- und Zeitauswahl umgesetzt wird (natives `<input type="datetime-local">` reicht)
- Anleitung zum Einrichten (Supabase-Projekt, VAPID-Schlüssel, Secrets,
  Vercel) als README

Das Anlegen des Supabase-Projekts und das Deployment auf Vercel erfolgen erst
nach Rückfrage beim Nutzer.
