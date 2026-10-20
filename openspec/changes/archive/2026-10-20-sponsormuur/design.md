# Design

## Context

- De site is statisch (Jinja → `dist/` via `build.py`) en haalt live gegevens rechtstreeks uit Supabase in de browser. `supabase-js` wordt enkel geladen op pagina's met `{% set gebruikt_supabase = true %}` (fotomuur, admin, deelname, inschrijven, beamer). `main.js` draait op elke pagina en werkt bewust zonder `supabase-js`.
- De fotomuur (`posts` + bucket `fotomuur`) is het voorbeeld: publiek leesbaar, en beheerders kunnen verwijderen via `public.is_admin()`.
- De tabel `public.sponsors` bestaat al en bevat de sponsors **per deelnemer** (bedragen per rondje). Bedrijfssponsors zijn iets anders en krijgen een eigen tabel.
- `templates/_overschrijving.html` wordt ook op Home en Over gebruikt en blijft ongewijzigd.

## Goals / Non-Goals

**Goals:**
- Eén bron voor bedrijfssponsors die live doorwerkt naar muur, footer en beamer.
- Geen extra JS-bibliotheek op pagina's die nu geen Supabase laden.
- De niveaugrootte op één plek in CSS bepalen, zodat muur, strook en beamer consistent blijven.

**Non-Goals:**
- Sponsors laten posten of reageren zoals op de fotomuur.
- Statistieken (kliks, impressies) per sponsor.
- Het sponsorboekje genereren: de organisatie levert de PDF aan.

## Decisions

### 1. Nieuwe tabel `public.partners` en bucket `partners`
Kolommen: `id uuid pk`, `created_at`, `naam text not null`, `niveau text not null check (niveau in ('hoofd','goud','zilver','brons'))`, `tekst text` (max. 500), `url text` (enkel `https://…`), `logo_pad text not null`, `volgorde int default 0`, `zichtbaar boolean default true`.
RLS: `select` voor iedereen `using (zichtbaar or public.is_admin())`; `insert/update/delete` enkel `public.is_admin()`. Bucket `partners` is publiek, `allowed_mime_types` = png/jpeg/webp, `file_size_limit` 2 MB, en schrijven/verwijderen in `storage.objects` enkel voor beheerders.
- *Alternatief:* `sponsors.yaml` behouden met logo's in `static/img/sponsors/`. Afgewezen: dan is een build en deploy nodig voor elke sponsor, en de beamer leest al live uit Supabase.
- *Alternatief:* een kolom `soort` op de bestaande tabel `sponsors`. Afgewezen: andere velden, andere rechten (die tabel is privé per deelnemer) en risico op vermenging in de sponsormails en de Excel-export.
- SVG wordt bewust geweigerd: een SVG in een publieke bucket kan script bevatten.

### 2. Script `supabase/partners.sql`, stap 9 in de README
Volgt de regel "veilig opnieuw uit te voeren": `create table if not exists`, `drop policy if exists` + `create policy`, `insert … on conflict do nothing` voor de bucket. Hangt enkel af van `is_admin()` (`accounts.sql`).

### 3. Niveaus als CSS-modifier
Elke weergave krijgt een klasse `niveau-hoofd|goud|zilver|brons`. De grootte komt uit CSS-variabelen per niveau (bv. `--logo-h`), die muur, strook en beamer elk binnen hun eigen context instellen. Volgorde in de JS: één gedeelde rangschikking (`hoofd, goud, zilver, brons`, daarna `volgorde`, daarna `naam`).

### 4. Sponsormuur: raster per niveau i.p.v. de kolommen van de fotomuur
De fotomuur gebruikt CSS-`columns` (masonry), waardoor de volgorde per kolom loopt. Voor sponsors moet de volgorde vast liggen, dus komt er per niveau een eigen sectie met een grid:
- hoofdsponsor: één brede kaart, logo links en tekst rechts (op gsm onder elkaar), accentkleur oranje en label "Hoofdsponsor";
- goud: 2 kolommen, zilver: 3, brons: 4 (via `auto-fill` met een minimumbreedte per niveau, zodat het op gsm vanzelf terugvalt).
De kaarten nemen de `.post`-look over (wit, lint-rand, radius), zodat het visueel familie is van de fotomuur. Nieuw bestand `static/js/sponsormuur.js`; `sponsors.html` zet `gebruikt_supabase = true`.

### 5. Footerstrook via `fetch` naar de REST-API, zonder `supabase-js`
De gedeelde module `static/js/partners.js` (op elke pagina via `base.html`, en op `beamer.html`) laadt, sorteert en levert logo-URL's voor de muur, de strook, de beamer en Beheer, en vult zelf de strook. Daardoor heeft ook `sponsors.html` geen `supabase-js` nodig. De module vraagt `GET {sbUrl}/rest/v1/partners?select=naam,niveau,url,logo_pad,volgorde&order=…` op met de publieke `apikey`-header (die staat al op `<body>`) en bouwt de logo-URL's als `{sbUrl}/storage/v1/object/public/partners/{logo_pad}`. De strook staat in `base.html` als `<section class="dank-strook" hidden>` boven de bestaande footerinhoud en wordt pas zichtbaar als er sponsors zijn. Logo's met `loading="lazy"`.
- *Alternatief:* `supabase-js` op elke pagina laden. Afgewezen: ±50 kB extra JS op elke pagina voor één lijst.
- *Alternatief:* de logo's bij de build ophalen. Afgewezen: dan is opnieuw een build nodig.
- RLS geldt ook voor deze anonieme aanvraag, dus verborgen sponsors komen niet mee. Een beheerder die ingelogd is ziet in de strook enkel wat bezoekers ook zien, omdat de aanvraag zonder sessie gebeurt.
- De strook verschijnt niet op `beamer.html`, dat `base.html` niet gebruikt, en ook niet op `admin.html`.

### 6. Beamer: één sponsor per dia
`beamer.js` haalt bij `ververs()` ook `partners` op. In `bouwReeks()` komt na elke `ELKE_N_SPONSOR` (4) dia's een sponsordia: telkens één sponsor onder "Met dank aan", met logo, naam, niveaulabel en tekstje. De logogrootte hangt af van het niveau. De volgorde wisselt de hoofdsponsor af met elke andere sponsor (h, goud1, h, goud2, …), zodat de hoofdsponsor om de andere sponsordia terugkomt en iedereen aan bod komt.
- *Alternatief (eerste versie):* een dankdia met alle logo's samen. Afgewezen op vraag van de organisatie: elke sponsor verdient een eigen dia. Zijn er geen posts, dan bestaat de reeks enkel uit sponsordia's (en rankings voor beheerders) in plaats van de `leeg`-dia. Duur: `SPONSOR_TIJD` (bv. 10 s). Logo's worden mee voorgeladen.

### 7. Beheer in `admin.html`
Nieuwe sectie "Bedrijfssponsors" (bewust niet "Sponsors", om verwarring met de Excel-knop voor deelnemer-sponsors te vermijden) met:
- een lijst per niveau met logo, naam, zichtbaar-schakelaar, volgorde (▲▼), "Bewerken" en "Verwijderen" (met bevestiging; wist ook het logobestand);
- een formulier (toevoegen en bewerken) met naam, niveau (select), tekstje, website, logo (met voorbeeld). Het logo wordt **niet** herschaald of naar JPEG omgezet (transparantie behouden); type en grootte worden in de browser gecontroleerd vóór de upload. Bestandsnaam: `crypto.randomUUID()` + extensie. Bij het vervangen wordt het oude bestand na een geslaagde update verwijderd.

### 8. `content/sponsors.yaml` en het sponsorboekje
De nieuwe structuur:
```yaml
intro: …          # tekst boven de muur
leeg: …           # melding zonder sponsors
contact: { tekst, email }
boekje: static/docs/sponsorboekje.pdf
```
`build.py` geeft `boekje_beschikbaar = (ROOT / boekje).exists()` mee. De knop gebruikt `download` en `type="application/pdf"`. `pakketten` en `lijst` verdwijnen.

### 9. Testmodus met voorbeeldsponsors (enkel lokaal)
Er is maar één Supabase-project, en dat is het live project. Testsponsors in de database zouden dus meteen publiek zijn. Daarom laadt `partners.js` op `localhost` met `?mock` de bestanden `static/mock/partners.json` en `static/mock/logos/*.svg` in plaats van de tabel. De keuze wordt per tabblad onthouden in `sessionStorage`, en `?mock=0` zet de testmodus uit. `build.py` neemt `static/mock/` enkel mee bij `--serve`.
- *Alternatief:* een seed-script met testrijen. Afgewezen: die zouden op de live site verschijnen, en de logo's moeten dan ook in de bucket staan.

## Risks / Trade-offs

- [Een beheerder uploadt een enorm of verkeerd bestand] → controle in de browser én bucketlimieten (mime-type, 2 MB) aan de serverkant.
- [Een `url` met `javascript:`] → CHECK-constraint op `https://` in de database, en de JS zet de link enkel als `new URL(url).protocol === "https:"`.
- [Een extra aanvraag op elke pagina] → één kleine REST-aanvraag (een paar rijen), de strook staat onderaan en blokkeert niets. Bij een fout gewoon verborgen.
- [Hoofdsponsor ontbreekt] → de muur begint dan gewoon bij goud; de beamer slaat de hoofdsponsor-dia over.
- [Meerdere hoofdsponsors] → toegestaan, elk een eigen brede kaart en eigen beamerdia.
- [Logo's met witte achtergrond op de oranje hoofdsponsorkaart] → het logo staat op een wit vlak binnen de kaart, de accentkleur zit in de rand of achtergrond eromheen.

## Migration Plan

1. `supabase/partners.sql` uitvoeren in de SQL Editor (veilig opnieuw uit te voeren).
2. Site bouwen en deployen. Zonder sponsors in de tabel: de muur toont de melding "binnenkort" en de footerstrook blijft verborgen, dus er is geen zichtbare regressie.
3. PDF van het sponsorboekje in `static/docs/sponsorboekje.pdf` zetten en opnieuw deployen. Tot dan is er geen downloadknop.
4. Sponsors toevoegen via Beheer.
Terugdraaien: de vorige build deployen. De tabel en bucket mogen blijven bestaan, ze hinderen niets.

## Open Questions

- Exacte teksten (intro boven de muur): voorlopige teksten in `sponsors.yaml`, achteraf aan te passen.
- Hoe vaak sponsordia's precies verschijnen op de beamer: begint op elke 4 dia's, af te stellen tijdens een test met echte posts.
