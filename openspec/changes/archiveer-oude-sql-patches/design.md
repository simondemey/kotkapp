# Design

## Context

Motivatie: zie `proposal.md` (Why). Vereisten: zie `specs/database-opzet/spec.md`.

Huidige toestand van `supabase/` (gecontroleerd met een read-only scan):

```
 veilig opnieuw uit te voeren        eenmalige patch (gevaarlijk of overbodig)
 ----------------------------        -----------------------------------------
 schema.sql                          inschrijvingen_v2.sql  DROP TABLE inschrijvingen
 accounts.sql                        nummers_fix.sql        hernummert + oude trigger
 bevestigingsmail.sql                nummers_fix2.sql       hernummert + oude trigger
 sponsors.sql   (*)                  nummers_lopers.sql     hernummert + oude trigger
 starts.sql                          een_keuze.sql          herschrijft keuzes
 wandelen.sql                        nummers.sql            achterhaald (zit in accounts/sponsors)
 tellers.sql                         supporters.sql         achterhaald (zit in accounts)
 beamer.sql                          kotk_teampagina.sql    achterhaald (zit in wandelen/sponsors)
```

(*) `sponsors.sql` definieert `rondjes_opslaan()` nog zonder startcontrole; de live versie komt uit `starts.sql`.

Functies die in meer dan één "veilig" script gedefinieerd zijn:

| Functie / trigger      | Gedefinieerd in                     | Live versie komt uit |
|------------------------|-------------------------------------|----------------------|
| `deelnemer_nummers`    | accounts.sql, sponsors.sql          | sponsors.sql         |
| `deelnemers_geldig`    | accounts.sql                        | een_keuze.sql (zelfde inhoud) |
| `stuur_sponsormail`    | sponsors.sql, wandelen.sql          | kotk_teampagina.sql (zelfde inhoud als wandelen.sql) |
| `rondjes_opslaan`      | sponsors.sql, starts.sql            | starts.sql           |

Beperking: de live database kan niet vanuit de repository uitgelezen worden met de publieke sleutel; vergelijking met live gebeurt via een query in de Supabase SQL Editor (`pg_get_functiondef`).

## Goals / Non-Goals

**Goals:**
- Geen enkel bestand in `supabase/` kan bij opnieuw uitvoeren gegevens wissen, nummers wijzigen, mails versturen of een oudere functieversie terugzetten.
- Een nieuw project kan opgezet worden met enkel `supabase/` en `supabase/README.md`.

**Non-Goals:**
- Geen echte migratietool (Supabase CLI-migraties) invoeren.
- De scripts niet samenvoegen tot één groot `opzet.sql` (kan later, zie Open Questions).
- Geen wijziging aan de live database; de change raakt enkel bestanden in de repository.

## Decisions

**1. Archiveren in `supabase/archief/` in plaats van verwijderen.**
De bestanden tonen hoe de database gegroeid is en bevatten de hernummer-logica, die nuttig kan zijn als referentie. Git bewaart ze ook bij verwijderen, maar dan zijn ze onzichtbaar voor wie niet met git werkt. Elk gearchiveerd bestand krijgt bovenaan een waarschuwingsblok met datum en reden.
*Alternatief:* verwijderen → overzichtelijker, maar de context verdwijnt uit het zicht.

**2. Dubbele functiedefinities identiek maken, niet ontdubbelen.**
`sponsors.sql` krijgt de `rondjes_opslaan()` uit `starts.sql`. Een plpgsql-functie mag naar `public.starts` verwijzen voordat die tabel bestaat (de body wordt pas bij uitvoering gecontroleerd), dus de volgorde voor een nieuw project blijft werken.
*Alternatief:* elke functie in precies één bestand → zuiverder, maar vraagt het herschikken van meerdere scripts en vergroot de kans op fouten vlak voor de lancering. Kan in een latere change.

**3. Eenmalige, scriptmatige controle in plaats van een CI-check.**
Een kort controlescript (lokaal, niet in de repository opgenomen) controleert na de verhuis dat (a) geen script in `supabase/` nog `drop table`, `setval` of hernummer-lussen bevat en (b) elke functie die in meerdere scripts staat overal dezelfde body heeft. Een GitHub Action is overkill voor een repository die zelden SQL wijzigt.

**4. Volgorde voor een nieuw project:**
`schema.sql` → `accounts.sql` → `bevestigingsmail.sql` → `sponsors.sql` → `starts.sql` → `wandelen.sql` → `tellers.sql` → `beamer.sql`, met de handmatige stappen (Vault-sleutel vóór de eerste mail, Auth-instellingen, beheerders aanduiden) in `supabase/README.md`.

## Risks / Trade-offs

- [`sponsors.sql` aanpassen terwijl het niet opnieuw uitgevoerd wordt] → Geen risico voor live: de change past enkel het bestand aan; de live functie is al de versie uit `starts.sql`.
- [Een archiefbestand toch per ongeluk uitvoeren] → Waarschuwing bovenaan elk bestand + aparte map + vermelding in `supabase/README.md`.
- [Nieuwe opzetvolgorde niet getest op een leeg project] → Verificatietaak: de volgorde één keer uitvoeren op een tijdelijk leeg Supabase-project (bv. het bestaande, ongebruikte `kotkapp-dev`), daarna dat project weer leegmaken of verwijderen.
- [Verschil tussen repository en live] → Verificatietaak met `pg_get_functiondef` in de SQL Editor voor de vier dubbel gedefinieerde functies.

## Migration Plan

1. Bestanden verplaatsen en waarschuwingen toevoegen (enkel repository).
2. `sponsors.sql` bijwerken, `supabase/README.md` schrijven.
3. Controles uitvoeren (statisch + vergelijking met live + optioneel test op leeg project).
4. Commit en push. De website en de live database veranderen niet; terugdraaien = git revert.

## Open Questions

- Na het evenement: alles samenvoegen tot één `opzet.sql` voor een volgende editie? Dat raakt deze change niet.
