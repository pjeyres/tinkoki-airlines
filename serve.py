"""Local dev server for Tinkoki Airlines. Disables caching so edits show up on reload."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
print(f"Tinkoki Airlines boarding at http://localhost:{port}")
http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
