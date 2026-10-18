"""Bouwt de statische site: content/ + templates/ + static/  ->  dist/

Gebruik:
    uv run build.py           # bouw naar dist/
    uv run build.py --serve   # bouw en start een lokale server op http://localhost:8000
"""

import argparse
import functools
import http.server
import shutil
from pathlib import Path

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
DIST = ROOT / "dist"

# (bestandsnaam in dist, template, menulabel)
PAGES = [
    ("index.html", "index.html", "Home"),
    ("over.html", "over.html", "Over"),
    ("timeline.html", "timeline.html", "Timeline"),
    ("sponsors.html", "sponsors.html", "Sponsors"),
    ("food-drinks.html", "menu.html", "Food & Drinks"),
    ("praktisch.html", "praktisch.html", "Praktische info"),
]


def load_yaml(name: str) -> dict:
    with open(CONTENT / name, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_markdown(name: str) -> str:
    text = (CONTENT / name).read_text(encoding="utf-8")
    return markdown.markdown(text, extensions=["extra"])


def build() -> None:
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html"]),
    )

    context = {
        "event": load_yaml("evenement.yaml"),
        "over_html": load_markdown("over.md"),
        "timeline": load_yaml("timeline.yaml"),
        "sponsors": load_yaml("sponsors.yaml"),
        "menu": load_yaml("menu.yaml"),
        "praktisch": load_yaml("praktisch.yaml"),
        "nav": [(out, label) for out, _, label in PAGES],
    }

    # Overschrijven i.p.v. dist/ te verwijderen: OneDrive houdt mappen soms vergrendeld.
    DIST.mkdir(exist_ok=True)
    shutil.copytree(STATIC, DIST / "static", dirs_exist_ok=True)

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
