# 🔔 Don't forget

Schlichte Notizen-App zum Erinnern: Gedanken in Sekunden festhalten, zur Standardzeit
(z. B. 17:00) oder zu einer eigenen Uhrzeit per Push-Nachricht erinnert werden – auf
Android-Handy, iPad und PC gleichzeitig, immer synchron.

**Technik:** Vite + Vanilla JS + Tailwind (installierbare Web-App), Supabase (Anmeldung,
Datenbank, Realtime, Edge Functions, pg_cron), Hosting auf Vercel.

---

## Einrichten (einmalig, ca. 20 Minuten)

Du brauchst: ein kostenloses Konto bei [Supabase](https://supabase.com) und bei
[Vercel](https://vercel.com), außerdem Node.js auf deinem PC für zwei Befehle.

> **Für dieses Repository bereits erledigt:** Das Supabase-Projekt `Don't_forget` ist eingerichtet
> (Schema, Cron, Vault-Schlüssel, beide Edge Functions). Weiter bei Schritt 2 und 8.

### 1. Supabase-Projekt anlegen

1. Auf supabase.com ein **neues Projekt** anlegen (Region z. B. Frankfurt).
2. **Database → Extensions:** `pg_cron` und `pg_net` aktivieren.
3. **SQL Editor:** nacheinander den Inhalt von `supabase/migrations/001_schema.sql`, `002_app_secret.sql`, `004_followup.sql` und `005_ai_usage.sql` einfügen und ausführen (die Nummer 003 gibt es nicht, ihr Inhalt steckt schon in 001).
   Eine Meldung zu pg_cron am Ende ist in Ordnung – das erledigen wir in Schritt 5.

### 2. Anmeldung einstellen

1. **Authentication → URL Configuration:** als *Site URL* die Adresse deiner App eintragen
   (für dieses Projekt: `https://dont-forget-sepia.vercel.app`) und
   dieselbe Adresse unter *Redirect URLs* hinzufügen.

### 3. Schlüssel für Push-Nachrichten erzeugen

Auf deinem PC im Terminal:

```bash
npx web-push generate-vapid-keys
```

Notiere dir *Public Key* und *Private Key*. Denk dir außerdem ein langes zufälliges
Passwort aus – das ist dein **CRON_SECRET**.

### 4. Edge Functions hochladen

```bash
npx supabase login
```

```bash
npx supabase link --project-ref DEIN_PROJEKT_REF
```

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

```bash
npx supabase functions deploy note-action --no-verify-jwt
```

```bash
npx supabase functions deploy parse-note
```

(`parse-note` bleibt **mit** JWT-Prüfung, nur angemeldete Nutzer dürfen sie aufrufen.)

(`DEIN_PROJEKT_REF` ist der Teil vor `.supabase.co` in deiner Projekt-URL.)

### 5. Schlüssel im Vault ablegen und minütliche Prüfung einschalten

`supabase/migrations/002_app_secret.sql` im SQL Editor ausführen, dann (Werte ersetzen):

```sql
select vault.create_secret('https://DEIN_PROJEKT_REF.supabase.co', 'project_url');
select vault.create_secret('DEIN_CRON_SECRET', 'cron_secret');
select vault.create_secret('https://DEIN_PROJEKT_REF.supabase.co', 'vapid_subject');
select vault.create_secret('PUBLIC_KEY_AUS_SCHRITT_3', 'vapid_public_key');
select vault.create_secret('PRIVATE_KEY_AUS_SCHRITT_3', 'vapid_private_key');
```

Die Edge Functions lesen diese Werte selbst aus dem Vault – Function-Secrets sind nicht nötig.
Danach den letzten Block aus `001_schema.sql` (ab `-- ---------- Jede Minute …`) noch einmal ausführen.
Prüfen: `select * from cron.job;` zeigt `dont-forget-reminders`.

### 6. Werte für die App notieren

**Project Settings → API:** *Project URL* und *anon/publishable key*.

### 7. Auf Vercel veröffentlichen

1. Auf vercel.com **Add New → Project** und dieses GitHub-Repository importieren.
2. Unter *Environment Variables* eintragen:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon/publishable key
   - `VITE_VAPID_PUBLIC_KEY` = Public Key aus Schritt 3
3. **Deploy.** Die Adresse dann in Schritt 2 bei Supabase eintragen.

### 8. Auf deinen Geräten installieren

| Gerät | Installieren | Danach |
|---|---|---|
| **Android (Chrome)** | Seite öffnen → Menü ⋮ → *App installieren* | anmelden, ⚙ → *Benachrichtigungen* an |
| **iPad (Safari, iPadOS 16.4+)** | Seite öffnen → Teilen → *Zum Home-Bildschirm* → App **vom Home-Bildschirm** öffnen | anmelden, ⚙ → *Benachrichtigungen* an |
| **PC (Chrome/Edge)** | Seite öffnen → Installieren-Symbol rechts in der Adressleiste | anmelden, ⚙ → *Benachrichtigungen* an |

Android: Damit Erinnerungen auf dem Sperrbildschirm erscheinen, in den Android-Einstellungen
für die App *Benachrichtigungen auf dem Sperrbildschirm* erlauben.

Wenn alle deine Geräte angemeldet sind: **Authentication → Sign In / Providers →
„Allow new users to sign up“ ausschalten.** Sonst könnte sich jeder, der die Adresse kennt,
ein Konto anlegen.

**Anmeldung:** Beim ersten Mal *Konto erstellen* (E-Mail + Passwort) und den Link in der
Bestätigungs-Mail öffnen – egal in welchem Browser. Danach auf jedem Gerät mit E-Mail und
Passwort anmelden; die App bleibt angemeldet.

### 9. Claude einrichten (für Sprechen und ✨)

Ohne diesen Schritt läuft alles andere schon. Mikrofon und ✨ melden dann „Claude ist noch nicht eingerichtet.“

1. Auf [console.anthropic.com](https://console.anthropic.com) einen **API-Schlüssel** anlegen. Er ist unabhängig von deinem claude.ai-Abo und wird nach Verbrauch abgerechnet. Für kurze Notizen sind das Cent-Beträge. Lege dort bei Bedarf ein kleines Guthaben an.
2. Im Supabase-Dashboard unter **Edge Functions → Secrets** ein Secret `ANTHROPIC_API_KEY` mit diesem Schlüssel anlegen. Er gehört nur dorthin, nie in die App, in den Code oder in einen Chat.
3. Pro Nutzer sind **50 Aufrufe pro Tag** erlaubt (Schutz vor unerwarteten Kosten).

Der gesprochene Text geht über Supabase an Anthropic und wird dort zu Terminen verarbeitet.

### 10. Testen

Eine Notiz anlegen, bei „ändern“ eine Zeit in 2 Minuten wählen, Gerät sperren und warten.

---

## Entwickeln

```bash
cp .env.example .env   # Werte eintragen
npm install
npm run dev
```

```bash
npm test         # Unit-Tests inkl. Datenbank-Tests (PGlite)
npm run smoke    # Oberfläche im Browser gegen gemocktes Backend
```

`npm test` prüft u. a. die Zeitregeln, die Nachfass-Logik in der Datenbank, die Farbkontraste und die Auswertung der Claude-Antworten.
Die Edge Functions selbst (`index.ts`) lassen sich lokal nicht ausführen, ihre Logik liegt in `supabase/functions/_shared/` und ist dort getestet.

## Wie es funktioniert

- Neue Notiz → Erinnerung zur Standardzeit (heute, oder morgen, wenn schon vorbei) oder zur eigenen Zeit.
- pg_cron ruft jede Minute `send-reminders` auf; die Funktion beansprucht fällige Notizen atomar
  (`claim_due_notes`) und schickt Web-Push an alle Geräte – jede Erinnerung genau einmal.
- „Erledigt“/„Später“ in der Nachricht rufen `note-action` mit einem Token pro Notiz auf
  („Später“ = in 1 Stunde). Auf dem iPad gibt es diese Knöpfe nicht – Tipp öffnet die Notiz in der App.
- Alle Geräte bleiben per Supabase Realtime synchron.

## Einstellungen (⚙)

- **Darstellung:** System, Hell oder Dunkel. Gilt nur für das jeweilige Gerät.
- **Erinnerungen:** Standardzeit, Benachrichtigungen auf diesem Gerät.
- **Nachfassen:** Eine Erinnerung ist gekommen, du hast sie aber nicht erledigt? Dann gibt es einen Hinweis, in die App zu schauen:
  tagsüber nach 5 Stunden, bei Erinnerungen ab 18:00 am nächsten Morgen um 8:00, bei Erinnerungen in der Nacht um 8:00 am selben Morgen.
  Mehrere offene ergeben einen gemeinsamen Hinweis (nur die Anzahl, keine Texte). Pro Notiz gibt es höchstens einen Hinweis. Alle Werte sind einstellbar.
- **Konto:** deine E-Mail, Passwort ändern, Abmelden.

## Sprechen und ✨

- 🎤 (nur wo der Browser Spracherkennung kann: Chrome/Edge auf Android und PC): tippen, sprechen, nochmal tippen oder kurz warten.
- ✨ schickt den Text im Eingabefeld an Claude. Auf dem **iPad**: das Mikrofon der Tastatur zum Diktieren benutzen, danach ✨ tippen.
- Claude macht aus „Reifen am Freitag um 9 wechseln und morgen den Zahnarzt anrufen“ zwei Erinnerungen. Du siehst vorher eine Vorschau, kannst Text und Zeit ändern oder Einträge entfernen und bestätigst mit **Speichern**.
- Ohne genannte Uhrzeit gilt deine Standardzeit.

## Hinweis zu den App-Symbolen

Die Symbole sind dunkelblau. Bereits installierte Apps zeigen sie evtl. erst nach einer Neuinstallation.
