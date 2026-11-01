"""Serves the mock X page for every app route, plus the extension sources.

Usage: python3 test/mock-x/server.py [port] [old-content-dir]
"""
import http.server
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
OLD_DIR = sys.argv[2] if len(sys.argv) > 2 else None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if OLD_DIR and clean.startswith("/old/"):
            return os.path.join(OLD_DIR, os.path.basename(clean))
        if clean.startswith(("/src/", "/test/", "/_locales/")):
            return super().translate_path(path)
        return os.path.join(ROOT, "test", "mock-x", "index.html")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
