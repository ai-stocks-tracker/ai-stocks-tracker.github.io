"""Serve the site/ folder locally: python serve.py  (then open http://localhost:8765)."""
import http.server
import pathlib
import socketserver
import sys
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent / "site"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
TYPES = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
         ".svg": "image/svg+xml", ".ico": "image/x-icon"}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self, head=False):
        rel = self.path.split("?", 1)[0].lstrip("/") or "index.html"
        f = (ROOT / rel).resolve()
        if ROOT not in f.parents and f != ROOT or not f.is_file():
            self.send_response(404); self.send_header("Content-Length", "0"); self.end_headers(); return
        body = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(f.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET(head=True)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s\n" % (fmt % args)); sys.stdout.flush()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    url = f"http://localhost:{PORT}"
    print(f"Serving {ROOT} at {url}  (Ctrl+C to stop)")
    if "--open" in sys.argv:
        webbrowser.open(url)
    Server(("localhost", PORT), Handler).serve_forever()
