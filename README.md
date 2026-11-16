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

### 1. Supabase-Projekt anlegen

1. Auf supabase.com ein **neues Projekt** anlegen (Region z. B. Frankfurt).
2. **Database → Extensions:** `pg_cron` und `pg_net` aktivieren.
3. **SQL Editor:** den kompletten Inhalt von `supabase/migrations/001_schema.sql` einfügen und ausführen.
   Eine Meldung zu pg_cron am Ende ist in Ordnung – das erledigen wir in Schritt 5.

### 2. Anmeldung einstellen

1. **Authentication → URL Configuration:** als *Site URL* die Adresse deiner App eintragen
   (die bekommst du in Schritt 7 von Vercel, z. B. `https://dont-forget-xyz.vercel.app`) und
   dieselbe Adresse unter *Redirect URLs* hinzufügen.
2. **Authentication → Email Templates → Magic Link:** Ergänze im Text die Zeile
   `Dein Code: {{ .Token }}`.
   Wichtig fürs iPad: Dort öffnet der Link in Safari statt in der installierten App –
   mit dem Code meldest du dich direkt in der App an.

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
npx supabase secrets set VAPID_SUBJECT=mailto:deine@email.de VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... CRON_SECRET=...
```

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

```bash
npx supabase functions deploy note-action --no-verify-jwt
```

(`DEIN_PROJEKT_REF` ist der Teil vor `.supabase.co` in deiner Projekt-URL.)

### 5. Minütliche Prüfung einschalten

Im **SQL Editor** ausführen (Werte ersetzen):

```sql
select vault.create_secret('https://DEIN_PROJEKT_REF.supabase.co', 'project_url');
select vault.create_secret('DEIN_CRON_SECRET', 'cron_secret');
```

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
| **iPad (Safari, iPadOS 16.4+)** | Seite öffnen → Teilen → *Zum Home-Bildschirm* → App **vom Home-Bildschirm** öffnen | mit **Code** aus der E-Mail anmelden, ⚙ → *Benachrichtigungen* an |
| **PC (Chrome/Edge)** | Seite öffnen → Installieren-Symbol rechts in der Adressleiste | anmelden, ⚙ → *Benachrichtigungen* an |

Android: Damit Erinnerungen auf dem Sperrbildschirm erscheinen, in den Android-Einstellungen
für die App *Benachrichtigungen auf dem Sperrbildschirm* erlauben.

### 9. Testen

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

## Wie es funktioniert

- Neue Notiz → Erinnerung zur Standardzeit (heute, oder morgen, wenn schon vorbei) oder zur eigenen Zeit.
- pg_cron ruft jede Minute `send-reminders` auf; die Funktion beansprucht fällige Notizen atomar
  (`claim_due_notes`) und schickt Web-Push an alle Geräte – jede Erinnerung genau einmal.
- „Erledigt“/„Später“ in der Nachricht rufen `note-action` mit einem Token pro Notiz auf
  („Später“ = in 1 Stunde). Auf dem iPad gibt es diese Knöpfe nicht – Tipp öffnet die Notiz in der App.
- Alle Geräte bleiben per Supabase Realtime synchron.
