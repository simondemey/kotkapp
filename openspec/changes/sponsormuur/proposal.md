# Proposal

## Why

De sponsorpagina toont vandaag vooral vier lange pakketkaarten en een (lege) logolijst uit `content/sponsors.yaml`, terwijl bedrijven die al sponsoren nauwelijks zichtbaar zijn: niet op de beamer, niet op de andere pagina's, en enkel na een nieuwe build. We willen sponsors bedanken zoals de fotomuur bezoekers in de kijker zet: als posts met hun logo en een tekstje, waarbij het niveau bepaalt hoe groot ze in beeld komen en de hoofdsponsor er duidelijk uitspringt.

## What Changes

- **Sponsorpagina wordt een sponsormuur**: elke bedrijfssponsor verschijnt als post (logo, tekstje, optionele link) in de stijl van de fotomuur. Het niveau (hoofdsponsor, goud, zilver, brons) bepaalt de grootte; de hoofdsponsor staat bovenaan in een opvallend, breed uitgelicht blok.
- **Beheer via de adminpagina**: beheerders voegen sponsorposts toe, passen ze aan, verbergen en verwijderen ze, inclusief logo-upload. Geen nieuwe build nodig; bezoekers kunnen niets posten.
- **Nieuwe Supabase-tabel `partners`** en publieke opslag-bucket voor logo's (de naam `sponsors` is al in gebruik voor de sponsors per deelnemer). Lezen is publiek, schrijven enkel voor beheerders.
- **"Met dank aan"-logostrook** in de footer van elke pagina, met de logo's per niveau in oplopende grootte en de hoofdsponsor het grootst.
- **Beamer**: sponsordia's tussen de fotomuurposts; elke sponsor krijgt een eigen dia onder "Met dank aan", met de logogrootte volgens het niveau. De hoofdsponsor komt om de andere sponsordia terug.
- **Sponsorboekje als PDF**: de pakketten (brons/zilver/goud/hoofd) verdwijnen van de pagina. In de plaats komt "Word jij onze sponsor?" met een downloadknop voor het sponsorboekje (PDF, aangeleverd door de organisatie) en het contactadres.
- **Eén steun-blok**: het losse blok "Liever als particulier steunen?" vervalt; enkel het gedeelde blok "Rechtstreeks steunen" (`_overschrijving.html`) blijft.
- **BREAKING (inhoud)**: `pakketten` en `lijst` verdwijnen uit `content/sponsors.yaml`. `lijst` was leeg, er gaat dus geen sponsor verloren.

## Capabilities

### New Capabilities
- `bedrijfssponsors`: hoe bedrijfssponsors beheerd en getoond worden: sponsormuur op de sponsorpagina, beheer door beheerders, zichtbaarheid per niveau, de "Met dank aan"-strook in de footer, sponsordia's op de beamer en het downloadbare sponsorboekje.

### Modified Capabilities
- `database-opzet`: het opzetten van een leeg project omvat nu ook de bedrijfssponsors (tabel `partners` en de logo-bucket), en het nieuwe script krijgt een plaats in de gedocumenteerde volgorde.

## Impact

- **Templates**: `templates/sponsors.html` (herschreven), `templates/base.html` (footerstrook), `templates/admin.html` (beheersectie), `templates/beamer.html` (sponsordia's).
- **JS**: nieuw `static/js/sponsormuur.js`; nieuw `static/js/partners.js` (gedeelde module + footerstrook), `static/js/admin.js` (beheer), `static/js/beamer.js` (sponsordia's).
- **CSS**: `static/css/style.css` (muur, niveaus, footerstrook), `static/css/beamer.css`. De oude `.sponsor-logo`- en `.pakket`-stijlen vervallen.
- **Inhoud**: `content/sponsors.yaml` (intro, contact, pad naar het boekje); nieuwe map `static/docs/` voor `sponsorboekje.pdf`.
- **Build**: `build.py` toont de downloadknop enkel als het PDF-bestand bestaat.
- **Database**: nieuw script `supabase/partners.sql`, bijgewerkte `supabase/README.md`. Raakt de bestaande tabel `sponsors` (deelnemer-sponsors) niet.
- **Buiten scope**: sponsors per deelnemer (`deelname.html`), het opmaken van het sponsorboekje zelf.
