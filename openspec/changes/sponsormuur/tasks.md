# Tasks

## 1. Database

- [x] 1.1 Schrijf `supabase/partners.sql`: tabel `public.partners` (niveau-check, `https://`-check op `url`, tekst max. 500), RLS-policies (publiek lezen van `zichtbaar`, beheerders alles), bucket `partners` (publiek, png/jpeg/webp, 2 MB) met storage-policies enkel voor beheerders. Controleer dat het script geen `drop table` bevat en twee keer na elkaar foutloos draait (zie spec database-opzet).
- [x] 1.2 Werk `supabase/README.md` bij: `partners.sql` als stap 9 in de tabel, met een korte beschrijving in het overzicht. Controleer dat de volgorde klopt (na `accounts.sql`).
- [x] 1.3 Laat de beheerder `partners.sql` uitvoeren in de Supabase SQL Editor (de MCP-koppeling is read-only) en controleer daarna via de read-only MCP dat tabel, policies en bucket bestaan en dat een anonieme `select` geen verborgen rijen teruggeeft.

## 2. Inhoud en build

- [x] 2.1 Herschrijf `content/sponsors.yaml` naar `intro`, `leeg`, `contact` en `boekje` (`pakketten` en `lijst` weg). Controleer dat `uv run build.py` zonder fouten bouwt.
- [x] 2.2 Laat `build.py` `boekje_beschikbaar` meegeven op basis van het bestaan van het PDF-bestand en zet het aangeleverde sponsorboekje in `static/docs/sponsorboekje.pdf`. Controleer dat de build lukt met én zonder `sponsorboekje.pdf`.
- [x] 2.3 Testmodus met voorbeeldsponsors: `static/mock/partners.json` + logo's, actief via `?mock` enkel op localhost (onthouden per tabblad, `?mock=0` zet uit), en `build.py` publiceert `static/mock/` niet (enkel mee bij `--serve`). Controleer dat `?mock` de muur, strook en beamer vult en dat een gewone build geen mock-bestanden in `dist/` zet.

## 3. Sponsorpagina

- [x] 3.1 Herschrijf `templates/sponsors.html`: titel + intro, container voor de sponsormuur (met `data-`-teksten), sectie "Word jij onze sponsor?" met contactknop en downloadknop (enkel als `boekje_beschikbaar`), en enkel `_overschrijving.html` als steun-blok. Controleer in de preview dat de teampaginaknop precies één keer voorkomt en dat er geen pakketkaarten meer staan.
- [x] 3.2 Schrijf `static/js/sponsormuur.js`: zichtbare partners ophalen, sorteren (niveau → volgorde → naam), per niveau een sectie bouwen met kaarten (logo, naam, tekstje, link enkel bij `https:`), plus de melding bij geen sponsors en de foutmelding. Controleer met testrijen in de preview: volgorde, lege toestand en foutmelding (bv. met een ongeldige key).
- [x] 3.3 Voeg de CSS toe in `static/css/style.css`: kaartstijl in de familie van `.post`, niveau-modifiers met groottevariabelen, een brede uitgelichte hoofdsponsorkaart met label, en een responsieve grid per niveau. Verwijder de oude `.sponsor-logos`/`.sponsor-logo`/`.pakket(ten)`-stijlen. Controleer in de preview op desktop en op 375 px: hoofdsponsor het grootst, gelijke grootte binnen een niveau, geen horizontaal scrollen.

## 4. "Met dank aan"-strook

- [x] 4.1 Voeg in `templates/base.html` de verborgen `dank-strook` toe boven de footerinhoud, niet op `admin.html`. Controleer dat de strook zonder sponsors op geen enkele pagina zichtbaar is.
- [x] 4.2 Laad de strook in de gedeelde module `static/js/partners.js` (ook gebruikt door muur, beamer en beheer) via `fetch` naar de REST-API (zonder `supabase-js`): logo's per niveau, hoofdsponsor eerst, links enkel bij `https:`, en bij een fout stil verborgen. Voeg de CSS toe met de niveaugroottes. Controleer in de preview op Home en Timeline dat de logo's verschijnen, dat er geen `supabase-js` geladen wordt (via de netwerkaanvragen) en dat er geen consolefouten zijn.

## 5. Beheer

- [x] 5.1 Voeg in `templates/admin.html` de sectie "Bedrijfssponsors" toe: een lijst per niveau en een formulier (naam, niveau, tekstje, website, logo met voorbeeld). Controleer dat de sectie enkel zichtbaar is voor beheerders, net als de rest van `admin-inhoud`.
- [x] 5.2 Implementeer in `static/js/admin.js` het toevoegen, bewerken (inclusief logo vervangen en het oude logo verwijderen), zichtbaar/verborgen, volgorde ▲▼ en verwijderen (met bevestiging, ook het logobestand). Controleer type en grootte vóór de upload. Test als beheerder in de preview: elke actie werkt en is meteen zichtbaar op `sponsors.html`, en een SVG of een bestand >2 MB wordt geweigerd met een melding.
- [x] 5.3 Controleer de rechten: als niet-beheerder (uitgelogd) mislukt een `insert`/`update`/`delete` op `partners` en een upload naar de bucket `partners` (bv. via de console op `fotomuur.html`).

## 6. Beamer

- [x] 6.1 Breid `static/js/beamer.js` uit: `partners` laden bij `ververs()`, sponsordia's (één sponsor per dia onder "Met dank aan", hoofdsponsor om de andere beurt) toevoegen aan `bouwReeks()` (ook als er geen posts zijn) en logo's voorladen. Voeg de bijbehorende stijl toe in `static/css/beamer.css`. Controleer in de preview van `beamer.html`: elke sponsor krijgt een eigen dia, de hoofdsponsor wisselt af met de anderen, de logogrootte volgt het niveau, en een in Beheer verborgen sponsor verdwijnt na het verversen.

## 7. Integratie

- [ ] 7.1 Volledige doorloop in de preview met een hoofdsponsor en sponsors van elk niveau: sponsorpagina, footerstrook op drie pagina's, beamer en het verbergen/verwijderen via Beheer. Neem een screenshot van de sponsorpagina op desktop en op gsm. Ruim daarna de testsponsors op.
- [x] 7.2 Voer `openspec validate sponsormuur --strict` uit en los eventuele meldingen op.

## Workflow follow-up

- De organisatie levert `static/docs/sponsorboekje.pdf` aan; daarna opnieuw bouwen en deployen.
- Na review en deploy de change archiveren met `/opsx:archive`.
