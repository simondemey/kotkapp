"""Bouwt de statische site: content/ + templates/ + static/  ->  dist/

Gebruik:
    uv run build.py           # bouw naar dist/
    uv run build.py --serve   # bouw en start een lokale server op http://localhost:8000
"""

import argparse
import functools
import http.server
import shutil
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

ROOT = Path(__file__).parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
DIST = ROOT / "dist"

# (bestandsnaam in dist, template, menulabel – None = niet in het menu)
PAGES = [
    ("index.html", "index.html", "Home"),
    ("over.html", "over.html", "Over"),
    ("timeline.html", "timeline.html", "Timeline"),
    ("sponsors.html", "sponsors.html", "Sponsors"),
    ("food-drinks.html", "menu.html", "Food & Drinks"),
    ("praktisch.html", "praktisch.html", "Praktische info"),
    ("fotomuur.html", "fotomuur.html", "Fotomuur"),
    ("inschrijven.html", "inschrijven.html", "Inschrijven"),
    ("deelname.html", "deelname.html", None),
    ("admin.html", "admin.html", None),
]


def load_yaml(name: str) -> dict:
    with open(CONTENT / name, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_markdown(name: str) -> str:
    text = (CONTENT / name).read_text(encoding="utf-8")
    return markdown.markdown(text, extensions=["extra"])


def md_inline(text: str) -> Markup:
    """Markdown voor één alinea (bv. **vet**), zonder omringende <p>."""
    html = markdown.markdown(text or "")
    return Markup(html.removeprefix("<p>").removesuffix("</p>"))


def agenda(event: dict) -> dict:
    """Google Agenda-link en de inhoud van een .ics-bestand voor het evenement."""
    utc = lambda s: datetime.fromisoformat(s).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    start, einde = utc(event["start"]), utc(event["einde"])
    titel = f"{event['naam']} – {event['ondertitel']}"
    plaats = f"{event['locatie']['adres']}, {event['locatie']['gemeente']}"
    info = f"Loop, wandel of supporter mee! Info en inschrijven: {event['site_url']}"
    google = "https://calendar.google.com/calendar/render?" + urllib.parse.urlencode(
        {"action": "TEMPLATE", "text": titel, "dates": f"{start}/{einde}", "location": plaats, "details": info}
    )
    iso = lambda s: datetime.fromisoformat(s).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    outlook = "https://outlook.live.com/calendar/0/deeplink/compose?" + urllib.parse.urlencode(
        {"path": "/calendar/action/compose", "rru": "addevent", "subject": titel,
         "startdt": iso(event["start"]), "enddt": iso(event["einde"]), "location": plaats, "body": info}
    )
    escape = lambda t: t.replace("\\", "\\\\").replace(",", r"\,").replace(";", r"\;")
    ics = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Running for Pauline//NL", "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:sponsorloop-2027@{event['site_url'].removeprefix('https://')}",
        f"DTSTAMP:{start}", f"DTSTART:{start}", f"DTEND:{einde}",
        f"SUMMARY:{escape(titel)}", f"LOCATION:{escape(plaats)}", f"DESCRIPTION:{escape(info)}",
        f"URL:{event['site_url']}",
        "END:VEVENT", "END:VCALENDAR", "",
    ])
    return {"google_url": google, "outlook_url": outlook, "ics": "running-for-pauline.ics", "ics_inhoud": ics}


def build() -> None:
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html"]),
    )
    env.filters["md"] = md_inline

    event = load_yaml("evenement.yaml")
    context = {
        "event": event,
        "agenda": agenda(event),
        "over_html": load_markdown("over.md"),
        "timeline": load_yaml("timeline.yaml"),
        "sponsors": load_yaml("sponsors.yaml"),
        "menu": load_yaml("menu.yaml"),
        "praktisch": load_yaml("praktisch.yaml"),
        "fotomuur": load_yaml("fotomuur.yaml"),
        "inschrijven": load_yaml("inschrijven.yaml"),
        "supabase": load_yaml("supabase.yaml"),
        "nav": [(out, label) for out, _, label in PAGES if label],
        # Versienummer achter CSS/JS-links, zodat gsm's na elke publicatie de nieuwe opmaak laden
        "versie": str(int(time.time())),
    }

    # Overschrijven i.p.v. dist/ te verwijderen: OneDrive houdt mappen soms vergrendeld.
    DIST.mkdir(exist_ok=True)
    shutil.copytree(STATIC, DIST / "static", dirs_exist_ok=True)

    (DIST / context["agenda"]["ics"]).write_text(context["agenda"]["ics_inhoud"], encoding="utf-8", newline="")

    for out, template, _ in PAGES:
        html = env.get_template(template).render(**context, current=out)
        (DIST / out).write_text(html, encoding="utf-8")
        print(f"  - {out}")

    print(f"Site gebouwd in {DIST}")


def serve(port: int) -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIST)
    with http.server.ThreadingHTTPServer(("localhost", port), handler) as httpd:
        print(f"Bekijk de site op http://localhost:{port}  (Ctrl+C om te stoppen)")
        httpd.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--serve", action="store_true", help="start een lokale server na het bouwen")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    build()
    if args.serve:
        serve(args.port)
