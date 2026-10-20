# bedrijfssponsors Specification

## Purpose

Legt vast hoe bedrijfssponsors van de sponsorloop beheerd en bedankt worden: als posts op een sponsormuur, in een logostrook op elke pagina en op de beamer, waarbij het sponsorniveau bepaalt hoe groot een sponsor in beeld komt.

## Requirements

### Requirement: Sponsorpost met niveau
Elke bedrijfssponsor MUST bestaan als één sponsorpost met een naam, een niveau (hoofdsponsor, goud, zilver of brons), een logo, een optioneel tekstje en een optionele link naar de website van de sponsor.

#### Scenario: Volledige sponsorpost
- **WHEN** een beheerder een sponsor bewaart met naam, niveau "goud", logo, tekstje en link
- **THEN** bestaat er een sponsorpost met precies die gegevens

#### Scenario: Niveau is verplicht en beperkt
- **WHEN** een sponsorpost bewaard wordt zonder niveau of met een ander niveau dan hoofdsponsor, goud, zilver of brons
- **THEN** wordt de post geweigerd

### Requirement: Enkel beheerders beheren sponsorposts
Beheerders MUST via de beheerpagina sponsorposts kunnen toevoegen, aanpassen (inclusief logo vervangen), verbergen, terug tonen en verwijderen. Niemand anders MUST sponsorposts of sponsorlogo's kunnen toevoegen, wijzigen of verwijderen.

#### Scenario: Beheerder voegt een sponsor toe
- **WHEN** een ingelogde beheerder op de beheerpagina een nieuwe sponsor met logo bewaart
- **THEN** verschijnt die sponsor zonder nieuwe build op de sponsormuur, in de footerstrook en op de beamer

#### Scenario: Bezoeker probeert te schrijven
- **WHEN** een bezoeker die geen beheerder is een sponsorpost of logo probeert toe te voegen, te wijzigen of te verwijderen
- **THEN** wordt de bewerking geweigerd en blijven de sponsorposts ongewijzigd

#### Scenario: Sponsor verbergen
- **WHEN** een beheerder een sponsorpost verbergt
- **THEN** is die sponsor nergens meer zichtbaar voor bezoekers
- **AND** ziet de beheerder hem nog op de beheerpagina en kan hij hem terug tonen

### Requirement: Sponsorlogo's zijn veilige afbeeldingen
Een sponsorlogo MUST een PNG-, JPEG- of WebP-afbeelding van ten hoogste 2 MB zijn. Transparantie in een logo MUST behouden blijven.

#### Scenario: Ongeldig bestand
- **WHEN** een beheerder een SVG, PDF of een afbeelding groter dan 2 MB als logo kiest
- **THEN** wordt het logo geweigerd met een duidelijke melding en wordt de sponsorpost niet bewaard

#### Scenario: Transparant logo
- **WHEN** een beheerder een PNG-logo met transparante achtergrond uploadt
- **THEN** wordt het logo met transparante achtergrond getoond

### Requirement: Sponsormuur op de sponsorpagina
De sponsorpagina MUST alle zichtbare sponsorposts tonen als posts met logo, naam en tekstje, gegroepeerd per niveau in de volgorde hoofdsponsor, goud, zilver, brons. Binnen een niveau MUST de door de beheerder gekozen volgorde gelden. Een post met link MUST naar de site van de sponsor linken in een nieuw tabblad.

#### Scenario: Volgorde van de muur
- **WHEN** er een bronzen, een gouden en een zilveren sponsor zichtbaar zijn
- **THEN** toont de muur eerst de gouden, dan de zilveren en dan de bronzen sponsor

#### Scenario: Nog geen sponsors
- **WHEN** er geen zichtbare sponsorposts zijn
- **THEN** toont de sponsorpagina een melding dat de eerste sponsors binnenkort bekendgemaakt worden, en geen lege muur

#### Scenario: Sponsors laden mislukt
- **WHEN** de sponsorposts niet geladen kunnen worden
- **THEN** toont de pagina een foutmelding en blijft de rest van de pagina bruikbaar

### Requirement: Niveau bepaalt de grootte
Op de sponsormuur, in de footerstrook en op de beamer MUST een sponsor van een hoger niveau groter in beeld komen dan een sponsor van een lager niveau: hoofdsponsor groter dan goud, goud groter dan zilver, zilver groter dan brons. Sponsors van hetzelfde niveau MUST even groot getoond worden.

#### Scenario: Grootteverschil op de muur
- **WHEN** de sponsormuur een gouden en een bronzen sponsor toont
- **THEN** is de post en het logo van de gouden sponsor groter dan die van de bronzen sponsor

#### Scenario: Gelijke grootte binnen een niveau
- **WHEN** de sponsormuur twee zilveren sponsors toont
- **THEN** zijn hun posts even groot

### Requirement: Hoofdsponsor springt eruit
Elke zichtbare hoofdsponsor MUST bovenaan de sponsormuur staan in een uitgelicht blok over de volle breedte, met het label "Hoofdsponsor", en duidelijk groter en opvallender dan alle andere sponsors. Dit MUST ook op gsm gelden.

#### Scenario: Hoofdsponsor op de muur
- **WHEN** er een zichtbare hoofdsponsor is
- **THEN** staat die als eerste op de sponsormuur, over de volle breedte, met het label "Hoofdsponsor"

#### Scenario: Hoofdsponsor op gsm
- **WHEN** de sponsorpagina op een scherm van 375 pixels breed bekeken wordt
- **THEN** is het logo van de hoofdsponsor groter dan dat van elke andere sponsor en is er geen horizontaal scrollen

### Requirement: "Met dank aan"-strook op elke pagina
Elke publieke pagina van de site MUST onderaan een strook "Met dank aan" tonen met de logo's van alle zichtbare sponsors, de hoofdsponsor eerst en het grootst, daarna per niveau. Een logo met link MUST naar de site van de sponsor linken. Zonder zichtbare sponsors MUST de strook volledig wegblijven.

#### Scenario: Strook met sponsors
- **WHEN** een bezoeker eender welke publieke pagina opent en er zichtbare sponsors zijn
- **THEN** staat onderaan de strook "Met dank aan" met hun logo's, de hoofdsponsor vooraan

#### Scenario: Geen sponsors
- **WHEN** er geen zichtbare sponsors zijn
- **THEN** toont geen enkele pagina een (lege) "Met dank aan"-strook

#### Scenario: Strook vertraagt de pagina niet
- **WHEN** de sponsors traag of niet laden
- **THEN** is de rest van de pagina al volledig bruikbaar en verschijnt er geen foutmelding in de strook

### Requirement: Sponsors op de beamer
De beamervoorstelling MUST regelmatig sponsordia's tonen tussen de fotomuurposts, met telkens één sponsor per dia onder de titel "Met dank aan": logo, naam, niveau en tekstje, met de logogrootte volgens de grootteregel. Elke zichtbare sponsor MUST aan bod komen, en de hoofdsponsor MUST vaker verschijnen dan de andere sponsors. De beamer MUST nieuwe of verborgen sponsors oppikken bij het periodiek verversen, zonder herstart.

#### Scenario: Elke sponsor apart
- **WHEN** de beamer draait met een gouden, een zilveren en een bronzen sponsor
- **THEN** krijgt elk van hen een eigen dia met "Met dank aan", zijn logo en zijn naam

#### Scenario: Hoofdsponsor komt vaker
- **WHEN** de beamer draait met een hoofdsponsor en andere sponsors
- **THEN** wisselt de hoofdsponsor af met de andere sponsors, zodat hij om de andere sponsordia verschijnt

#### Scenario: Beamer zonder posts
- **WHEN** de fotomuur leeg is maar er zichtbare sponsors zijn
- **THEN** toont de beamer toch de sponsordia's

#### Scenario: Sponsor toegevoegd tijdens het evenement
- **WHEN** een beheerder een sponsor toevoegt terwijl de beamer draait
- **THEN** verschijnt die sponsor na het volgende verversen in de voorstelling

#### Scenario: Sponsor verborgen tijdens het evenement
- **WHEN** een beheerder een sponsor verbergt terwijl de beamer draait
- **THEN** verschijnt die sponsor na het volgende verversen niet meer in de voorstelling

### Requirement: Sponsor worden en sponsorboekje
De sponsorpagina MUST een sectie "Word jij onze sponsor?" hebben met het contactadres voor sponsors en, als het sponsorboekje aanwezig is, een knop om het sponsorboekje als PDF te downloaden. De sponsorpakketten MUST NOT meer als kaarten op de pagina staan.

#### Scenario: Boekje aanwezig
- **WHEN** het sponsorboekje als PDF in de site staat
- **THEN** toont de sectie een knop die het PDF-bestand opent of downloadt

#### Scenario: Boekje nog niet aanwezig
- **WHEN** het PDF-bestand van het sponsorboekje ontbreekt
- **THEN** lukt de build toch, toont de sectie geen kapotte downloadknop en blijft het contactadres zichtbaar

### Requirement: Eén steun-blok voor particulieren
De sponsorpagina MUST voor particulieren enkel het gedeelde blok "Rechtstreeks steunen" tonen, zodat de link naar de teampagina van het goede doel er maar één keer op staat.

#### Scenario: Geen dubbele teampagina-knop
- **WHEN** een bezoeker de sponsorpagina bekijkt
- **THEN** staat de knop naar de teampagina van het goede doel er precies één keer op
