# Proposal

## Why

De map `supabase/` bevat 16 SQL-bestanden die tijdens de bouw stap voor stap als patch op de live database zijn uitgevoerd. Een deel ervan is gevaarlijk om opnieuw uit te voeren: `inschrijvingen_v2.sql` verwijdert de tabel met alle inschrijvingen, en `nummers_fix.sql`, `nummers_fix2.sql` en `nummers_lopers.sql` hernummeren alle lopers en zetten een verouderde trigger terug (zonder deelnemer-id's). Omdat SQL tot nu toe via "kopiëren → plakken → Run" in de Supabase SQL Editor wordt uitgevoerd, volstaat één verkeerd geplakt bestand om nummers die al per mail verstuurd zijn, of alle inschrijvingen, kwijt te raken. Dat risico wordt reëel zodra er echte inschrijvingen zijn, dus dit moet vóór de lancering opgelost zijn.

Daarnaast bevat `sponsors.sql` nog een oudere versie van `rondjes_opslaan()` zonder de startcontrole uit `starts.sql`: opnieuw uitvoeren zou die controle stilletjes ongedaan maken.

## What Changes

- Eenmalige patch-bestanden die niet meer opnieuw uitgevoerd mogen worden, verhuizen naar `supabase/archief/` met bovenaan een duidelijke waarschuwing ("NIET OPNIEUW UITVOEREN – al toegepast"): `inschrijvingen_v2.sql`, `supporters.sql`, `een_keuze.sql`, `nummers.sql`, `nummers_fix.sql`, `nummers_fix2.sql`, `nummers_lopers.sql`, `kotk_teampagina.sql`.
- In `supabase/` blijven enkel bestanden die veilig opnieuw uit te voeren zijn en samen de actuele database beschrijven: `schema.sql`, `accounts.sql`, `bevestigingsmail.sql`, `sponsors.sql`, `starts.sql`, `wandelen.sql`, `tellers.sql`, `beamer.sql`.
- `sponsors.sql` krijgt de actuele `rondjes_opslaan()` (met startcontrole), zodat opnieuw uitvoeren geen functionaliteit terugdraait.
- Een `supabase/README.md` beschrijft de volgorde om een nieuw Supabase-project op te zetten, welke handmatige stappen nodig zijn (Vault-sleutel, Auth-instellingen) en dat archiefbestanden niet uitgevoerd mogen worden.
- Geen wijziging aan de live database, de website of het gedrag voor bezoekers.

## Capabilities

### New Capabilities
- `database-opzet`: hoe de SQL-scripts in de repository de Supabase-database beschrijven, in welke volgorde ze een nieuw project opzetten, en dat ze veilig opnieuw uitvoerbaar zijn zonder gegevens te verliezen of functionaliteit terug te draaien.

### Modified Capabilities
- (geen)

## Impact

- Bestanden: `supabase/*.sql` (verplaatsen naar `supabase/archief/`, waarschuwingskop), `supabase/sponsors.sql` (functie bijwerken), nieuw `supabase/README.md`, eventueel de README in de projectroot (verwijzing).
- Live Supabase-database: niet aangeraakt.
- Website, GitHub Actions, Brevo: niet aangeraakt.
- Werkwijze: wie later SQL uitvoert, gebruikt enkel bestanden uit `supabase/` (niet uit `archief/`).
