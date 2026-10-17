"""
Aktualisiert die Liste der Offline-Dateien im Service Worker (sw.js)
und setzt optional eine neue Versionskennung.

    python tools/update_sw.py                 # nur Dateiliste aktualisieren
    python tools/update_sw.py --version abc12 # zusätzlich Version setzen (macht GitHub Actions)
"""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

INCLUDE = [
    "index.html", "manifest.webmanifest", "config.js",
    "css/*.css", "js/*.js", "js/**/*.js",
    "assets/*.webp", "assets/*.png", "assets/icons/*.png", "assets/fonts/*.woff2",
    "vendor/page-flip/*.js", "vendor/qrcode/*.js",
]
# große Dateien werden erst bei Bedarf geladen und dann zwischengespeichert
EXCLUDE = re.compile(r"(^|/)(tests|tools|apps-script|docs)/|\.pdf$|assets/demo/")


def files():
    seen = []
    for pattern in INCLUDE:
        for p in sorted(ROOT.glob(pattern)):
            rel = p.relative_to(ROOT).as_posix()
            if p.is_file() and not EXCLUDE.search(rel) and rel not in seen:
                seen.append(rel)
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=None)
    args = ap.parse_args()
    sw = ROOT / "sw.js"
    s = sw.read_text(encoding="utf-8")
    entries = ["  './',"] + [f"  './{f}'," for f in files()]
    s = re.sub(r"const CORE = \[\n.*?\n\];", "const CORE = [\n" + "\n".join(entries) + "\n];", s, flags=re.S)
    if args.version:
        s = re.sub(r"const VERSION = 'fb-app-[^']*';", f"const VERSION = 'fb-app-{args.version}';", s)
    sw.write_text(s, encoding="utf-8")
    print(f"sw.js: {len(entries)} Dateien" + (f", Version {args.version}" if args.version else ""))


if __name__ == "__main__":
    main()
