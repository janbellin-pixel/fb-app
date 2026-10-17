"""
Lokaler Testserver für die Mitglieder-App.

    python tools/serve.py          → http://localhost:8080
    python tools/serve.py 8090     → anderer Port

Wichtig: Für die Google-Anmeldung muss genau diese Adresse
(z. B. http://localhost:8080/) in der Google Cloud Console eingetragen sein.
"""
import http.server
import mimetypes
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

for ext, typ in {
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".webmanifest": "application/manifest+json",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".pfb": "application/octet-stream",
    ".svg": "image/svg+xml",
}.items():
    mimetypes.add_type(typ, ext)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".js": "text/javascript",
                      ".webmanifest": "application/manifest+json", ".webp": "image/webp",
                      ".woff2": "font/woff2"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(ROOT)
    server = http.server.ThreadingHTTPServer(("localhost", port), Handler)
    print(f"Mitglieder-App läuft auf http://localhost:{port}/  (Strg+C beendet)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
