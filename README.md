# KOTKApp – Sponsorloop Running for Pauline

Website voor de sponsorloop **Running for Pauline – Valentines Edition**
(zondag 14 februari 2027, 12u–18u, Daverlostraat 164, Assebroek), een actie voor Kom op tegen Kanker.

## Architectuur

Statische, responsieve website (werkt ook op gsm), gebouwd met een klein Python-script.
Geen server of database nodig: de countdown draait in de browser.

```
content/      Inhoud – hier pas je teksten, timeline, sponsors, menu en praktische info aan
templates/    Jinja2-templates (base.html + één per pagina)
static/       CSS, JavaScript en afbeeldingen
build.py      Genereert de site in dist/
dist/         Resultaat (niet zelf aanpassen; dit wordt gepubliceerd)
```

Pagina's: Home (countdown) · Over · Timeline · Sponsors · Food & Drinks · Praktische info

## Gebruik

Vereist [uv](https://docs.astral.sh/uv/).

```bash
uv run build.py --serve
```

Open daarna http://localhost:8000. Na een wijziging in `content/` of `templates/` opnieuw uitvoeren.

## Inhoud aanpassen

| Wat                    | Bestand                    |
|------------------------|----------------------------|
| Datum, uren, adres     | `content/evenement.yaml`   |
| Tekst over Pauline     | `content/over.md`          |
| Programma              | `content/timeline.yaml`    |
| Sponsorpakketten/logo's| `content/sponsors.yaml` + logo's in `static/img/sponsors/` |
| Food & drinks          | `content/menu.yaml`        |
| Praktische info, FAQ   | `content/praktisch.yaml`   |

Zoek naar `VOORBEELD` en `VUL AAN` voor inhoud die nog ingevuld moet worden.

## Publiceren

Upload de map `dist/` naar een statische host, bv. Azure Static Web Apps, GitHub Pages of Netlify.
