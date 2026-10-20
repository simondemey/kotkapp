# Tasks

## 1. Eenmalige patches archiveren

- [x] 1.1 Map `supabase/archief/` aanmaken en daar `inschrijvingen_v2.sql`, `supporters.sql`, `een_keuze.sql`, `nummers.sql`, `nummers_fix.sql`, `nummers_fix2.sql`, `nummers_lopers.sql` en `kotk_teampagina.sql` naartoe verplaatsen met `git mv`; verifiëren met `git status` dat de 8 bestanden als hernoemd staan en dat `supabase/` enkel nog `schema.sql`, `accounts.sql`, `bevestigingsmail.sql`, `sponsors.sql`, `starts.sql`, `wandelen.sql`, `tellers.sql` en `beamer.sql` bevat
- [x] 1.2 Bovenaan elk gearchiveerd bestand een SQL-commentaarblok zetten: "NIET OPNIEUW UITVOEREN – al toegepast op de live database in oktober 2026", met per bestand de reden (bv. "verwijdert alle inschrijvingen", "hernummert alle lopers en zet een oude trigger terug", "achterhaald: zit nu in accounts.sql"); verifiëren dat de eerste regel van elk van de 8 bestanden met "-- NIET OPNIEUW UITVOEREN" begint

## 2. Actuele scripts gelijktrekken

- [x] 2.1 In `supabase/sponsors.sql` de functie `rondjes_opslaan()` vervangen door de versie uit `supabase/starts.sql` (met startcontrole) en de verwijzende commentaarregel aanpassen; verifiëren dat beide bestanden een identieke functiebody bevatten (tekstvergelijking van het blok `create or replace function public.rondjes_opslaan` … `$$;`)
- [x] 2.2 Controleren dat `deelnemer_nummers()` in `accounts.sql` en `sponsors.sql`, en `stuur_sponsormail()` in `sponsors.sql` en `wandelen.sql` identiek zijn, en verschillen gelijktrekken naar de nieuwste versie; verifiëren met dezelfde tekstvergelijking voor elke dubbel gedefinieerde functie
- [x] 2.3 Statische controle uitvoeren op alle bestanden in `supabase/` (niet `archief/`): geen `drop table`, geen `setval`, geen lussen die nummers opnieuw uitdelen, geen `update` die deelnemers of keuzes wijzigt met de mailtrigger aan; verifiëren dat de controle zonder treffers eindigt (de bewuste `update ... set deelnemers = deelnemers` in `sponsors.sql`, met de mailtrigger uitgeschakeld en nummers behouden, wordt gedocumenteerd als toegestane uitzondering)

## 3. Documentatie

- [x] 3.1 `supabase/README.md` schrijven met: de volgorde voor een nieuw project (`schema` → `accounts` → `bevestigingsmail` → `sponsors` → `starts` → `wandelen` → `tellers` → `beamer`), de handmatige stappen (Brevo-API-sleutel in de Vault als `brevo_api_key`, pg_net, Auth: site-URL en redirect-URL's, custom SMTP via Brevo, mailsjablonen uit `supabase/emails/`, IP-blokkering in Brevo uit, beheerders aanduiden via `admins`) en een waarschuwing dat `archief/` nooit uitgevoerd wordt; verifiëren dat elk script uit `supabase/` en elke handmatige stap vermeld is
- [x] 3.2 In de README in de projectroot de beschrijving van de map `supabase/` bijwerken met een verwijzing naar `supabase/README.md`; verifiëren dat de link klopt

## 4. Verificatie tegen live en leeg project

- [x] 4.1 In de Supabase SQL Editor van het live project `pg_get_functiondef` opvragen voor `rondjes_opslaan`, `deelnemer_nummers`, `stuur_sponsormail` en `deelnemers_geldig` en vergelijken met de versies in `supabase/`; verifiëren dat er geen inhoudelijk verschil is (enkel witruimte)
- 4.2 (optioneel – overgeslagen op beslissing van de gebruiker, kotkapp-dev wordt verwijderd; niet meer opgevolgd) De volgorde uit `supabase/README.md` uitvoeren op het lege, ongebruikte project `kotkapp-dev`, daarna een test-inschrijving, sponsor, start en rondjes uitvoeren via de SQL Editor; verifiëren dat alles werkt zonder archiefbestanden, en het project nadien weer leegmaken of verwijderen

## 5. Afronden

- [x] 5.1 Wijzigingen committen en pushen; verifiëren dat de GitHub-workflow "Publiceer site" slaagt en dat https://runningforpauline.be ongewijzigd werkt (inschrijven, Mijn deelname en Beheer laden zonder fouten)

## Workflow follow-up

- De change archiveren met `/opsx:archive` nadat de taken afgerond en nagekeken zijn; daarmee wordt `database-opzet` een vaste spec in `openspec/specs/`.
