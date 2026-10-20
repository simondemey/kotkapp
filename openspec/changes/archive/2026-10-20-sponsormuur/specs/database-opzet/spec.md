# Spec Delta

## MODIFIED Requirements

### Requirement: Nieuw project opzetten met een gedocumenteerde volgorde
De repository MUST documenteren in welke volgorde de scripts uit `supabase/` uitgevoerd worden om een leeg Supabase-project volledig op te zetten, inclusief de handmatige stappen die niet in SQL gebeuren.

#### Scenario: Leeg project opzetten
- **WHEN** een beheerder de gedocumenteerde scripts in de beschreven volgorde uitvoert op een leeg Supabase-project
- **THEN** bestaat de volledige database: inschrijvingen, sponsors, rondjes, starts, fotomuur, beheerders, tellers, beamergegevens, bedrijfssponsors met hun logo-opslag, bevestigings- en sponsormails
- **AND** is geen enkel script uit `supabase/archief/` nodig

#### Scenario: Handmatige stappen zijn vermeld
- **WHEN** een beheerder de documentatie leest
- **THEN** staan de stappen vermeld die buiten SQL gebeuren: de Brevo-sleutel in de Vault zetten, de Auth-instellingen (site-URL, redirect-URL's, SMTP, mailsjablonen) en het aanduiden van beheerders
