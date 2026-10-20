# Supabase – database van runningforpauline.be

De scripts in deze map beschrijven de volledige Supabase-database: fotomuur, accounts,
inschrijvingen, deelnemersnummers, sponsors, starts, rondjes, tellers, beamer en de
automatische mails.

> ⚠️ **Nooit iets uit [`archief/`](archief/) uitvoeren.** Dat zijn eenmalige patches die al
> op de live database zijn toegepast. Sommige wissen alle inschrijvingen of hernummeren
> alle lopers. Ze staan er enkel nog als geschiedenis.

## Regel: alles in deze map is veilig opnieuw uit te voeren

Elk script hier mag je opnieuw uitvoeren op de live database zonder gegevens te verliezen,
nummers te wijzigen of mails te versturen (`create … if not exists`, `create or replace`,
`drop … if exists` + opnieuw aanmaken van policies en triggers).

- **Toegestane uitzondering:** `sponsors.sql` slaat alle inschrijvingen één keer opnieuw op
  (`update … set deelnemers = deelnemers`) om elke deelnemer een vaste id te geven. Dat
  gebeurt met de mailtrigger uitgeschakeld, en bestaande id's en nummers blijven behouden.
- **Functies die in twee bestanden staan, moeten identiek blijven.** Pas je er een aan,
  doe het dan in beide bestanden:

  | Functie              | Staat in                         |
  |----------------------|----------------------------------|
  | `deelnemer_nummers`  | `accounts.sql`, `sponsors.sql`   |
  | `rondjes_opslaan`    | `sponsors.sql`, `starts.sql`     |
  | `stuur_sponsormail`  | `sponsors.sql`, `wandelen.sql`   |

## Een nieuw Supabase-project opzetten

Voer de scripts uit in de **SQL Editor** van het project, in deze volgorde:

| # | Script                  | Wat het opzet |
|---|-------------------------|---------------|
| 1 | `schema.sql`            | Fotomuur: tabel `posts` en opslag-bucket `fotomuur` |
| 2 | `accounts.sql`          | Beheerders (`admins`, `is_admin()`), inschrijvingen met validatie en deelnemersnummers, beheerrechten op de fotomuur |
| 3 | `bevestigingsmail.sql`  | `pg_net`, de bevestigingsmail na inschrijven |
| 4 | `sponsors.sql`          | Vaste deelnemer-id, tabellen `sponsors` en `rondjes`, sponsormail, `rondjes_opslaan()` |
| 5 | `starts.sql`            | Tabel `starts`, `start_deelnemer()` (enkel beheerders), startcontrole bij rondjes |
| 6 | `wandelen.sql`          | Wandelaars: enkel vaste bedragen, sponsormail met "wandeltocht" |
| 7 | `tellers.sql`           | Live teller op de homepagina (enkel aantallen) |
| 8 | `beamer.sql`            | Rankings en totalen voor de beamer (enkel beheerders) |

### Handmatige stappen (niet in SQL)

1. **Brevo-sleutel in de Vault** (vóór de eerste inschrijving), in de SQL Editor:
   ```sql
   select vault.create_secret('<Brevo API-sleutel, begint met xkeysib->', 'brevo_api_key');
   ```
   Maak in Brevo een API-sleutel met enkel het recht *Transactional email*. Zet bij
   Brevo → Security → *Authorised IPs* het blokkeren van onbekende IP-adressen **uit**,
   anders weigert Brevo de mails vanuit Supabase.
2. **Auth → URL Configuration:** Site URL `https://runningforpauline.be/`, Redirect URL
   `https://runningforpauline.be/**` (en `http://localhost:8000/**` om lokaal te testen).
3. **Auth → SMTP:** custom SMTP via Brevo (`smtp-relay.brevo.com`, poort 587, afzender
   `noreply@runningforpauline.be`). Het domein moet in Brevo geauthenticeerd zijn
   (DKIM/DMARC-records bij de domeinbeheerder).
4. **Auth → Email Templates:** de inhoud van [`emails/inloglink.html`](emails/inloglink.html)
   plakken bij *Magic Link* én *Confirm signup*, onderwerp
   `Je inloglink voor Running for Pauline`.
5. **Auth → Rate limits:** *Rate limit for sending emails* verhogen (bv. 100, op de dag zelf 500).
6. **Beheerders aanduiden** (nadat ze één keer ingelogd zijn):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'naam@voorbeeld.be'
   on conflict do nothing;
   ```
7. **Site laten wijzen naar het project:** URL en publishable key in
   [`content/supabase.yaml`](../content/supabase.yaml).

## Nakijken wat er live draait

Om te vergelijken met de scripts hier (bv. na een aanpassing):

```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('deelnemer_nummers', 'rondjes_opslaan', 'stuur_sponsormail', 'deelnemers_geldig');
```
