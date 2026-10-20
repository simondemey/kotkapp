# database-opzet Specification

## Purpose

Legt vast hoe de SQL-scripts in de repository de Supabase-database van de site beschrijven: welke scripts samen de actuele database opzetten, in welke volgorde, en dat het opnieuw uitvoeren ervan nooit gegevens wist of functionaliteit terugdraait.

## Requirements

### Requirement: Actuele scripts zijn veilig opnieuw uitvoerbaar
Elk SQL-script in de hoofdmap `supabase/` MUST veilig opnieuw uitgevoerd kunnen worden op de live database: het mag geen tabellen of rijen verwijderen, geen deelnemersnummers of keuzes van bestaande deelnemers wijzigen en geen bevestigings- of sponsormails versturen.

#### Scenario: Script opnieuw uitgevoerd op een database met inschrijvingen
- **WHEN** een beheerder een script uit `supabase/` opnieuw uitvoert op een database met bestaande inschrijvingen, sponsors en rondjes
- **THEN** blijven alle inschrijvingen, deelnemers, nummers, sponsors, rondjes en starts ongewijzigd
- **AND** wordt er geen e-mail verstuurd

#### Scenario: Script bevat geen destructieve opdrachten
- **WHEN** een script in `supabase/` wordt nagekeken
- **THEN** bevat het geen `drop table` op een tabel met gegevens en geen opdracht die nummers opnieuw uitdeelt

### Requirement: Opnieuw uitvoeren draait geen functionaliteit terug
De scripts in `supabase/` MUST samen de nieuwste versie van elke databasefunctie en trigger bevatten, zodat het opnieuw uitvoeren van een willekeurig script uit die map geen oudere versie van een functie of trigger terugzet.

#### Scenario: Sponsor-script opnieuw uitgevoerd
- **WHEN** het script met de sponsorfunctionaliteit opnieuw wordt uitgevoerd
- **THEN** kan een deelnemer zijn rondjes nog steeds pas ingeven nadat een beheerder hem gestart heeft

#### Scenario: Elke functie heeft één actuele definitie
- **WHEN** dezelfde databasefunctie in meer dan één script in `supabase/` gedefinieerd is
- **THEN** zijn die definities identiek aan de versie die op de live database draait

### Requirement: Afgeronde patches staan apart en zijn gemarkeerd
Eenmalige migratiescripts die al op de live database zijn toegepast en niet meer opnieuw uitgevoerd mogen worden, MUST in `supabase/archief/` staan en bovenaan een waarschuwing dragen dat ze niet opnieuw uitgevoerd mogen worden.

#### Scenario: Gevaarlijk script terugvinden
- **WHEN** iemand een eenmalig migratiescript opent, zoals het script dat de inschrijvingstabel opnieuw aanmaakt of de lopers hernummert
- **THEN** staat het in `supabase/archief/`
- **AND** begint het met een waarschuwing "NIET OPNIEUW UITVOEREN" en de reden waarom

### Requirement: Nieuw project opzetten met een gedocumenteerde volgorde
De repository MUST documenteren in welke volgorde de scripts uit `supabase/` uitgevoerd worden om een leeg Supabase-project volledig op te zetten, inclusief de handmatige stappen die niet in SQL gebeuren.

#### Scenario: Leeg project opzetten
- **WHEN** een beheerder de gedocumenteerde scripts in de beschreven volgorde uitvoert op een leeg Supabase-project
- **THEN** bestaat de volledige database: inschrijvingen, sponsors, rondjes, starts, fotomuur, beheerders, tellers, beamergegevens, bedrijfssponsors met hun logo-opslag, bevestigings- en sponsormails
- **AND** is geen enkel script uit `supabase/archief/` nodig

#### Scenario: Handmatige stappen zijn vermeld
- **WHEN** een beheerder de documentatie leest
- **THEN** staan de stappen vermeld die buiten SQL gebeuren: de Brevo-sleutel in de Vault zetten, de Auth-instellingen (site-URL, redirect-URL's, SMTP, mailsjablonen) en het aanduiden van beheerders
