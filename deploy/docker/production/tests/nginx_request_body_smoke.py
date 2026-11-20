"""Exercise the built app image's non-root nginx request-body buffering.

Run only in an isolated container, bypassing the production entrypoint:

    docker run --rm --network none --entrypoint python IMAGE \
        deploy/docker/production/tests/nginx_request_body_smoke.py

No app, identity lookup, AWS, or external upstream is started. This uses the
image's real nginx config and filesystem, with synthetic loopback upstreams.
"""

import http.server
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import urllib.error
import urllib.request


LARGE_BODY = b"synthetic-request-body\n" * 10000  # >128K buffer, <16M body limit


class Backend(http.server.BaseHTTPRequestHandler):
    received = queue.Queue()

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.received.put(body)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"synthetic-upstream-ok")

    def do_GET(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


def main():
    if os.getuid() != 121 or os.getgid() != 121:
        raise RuntimeError("Run the app image as its default nginx uid/gid 121, not root")

    servers = []
    nginx = None
    # Ignore proxy environment variables; every request stays inside this container.
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        # Match all five upstreams, so round-robin/failover cannot hide a failure.
        for port in range(6543, 6548):
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Backend)
            servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()

        # The baked image defaults to TLS disabled; use the actual startup config
        # gate as well, but never run entrypoint.sh / assume_identity.
        setup = Path(__file__).resolve().parents[1] / "setup_nginx_tls.sh"
        env = dict(os.environ, NGINX_TLS_ENABLED="false")
        subprocess.run(["sh", str(setup)], check=True, env=env, timeout=15)
        nginx = subprocess.Popen(["/usr/sbin/nginx", "-g", "daemon off;"])
        url = "http://127.0.0.1:8000/__nginx_buffering_smoke"
        deadline = time.monotonic() + 10
        while True:
            if nginx.poll() is not None:
                raise RuntimeError("nginx exited before becoming ready")
            try:
                with client.open(url, timeout=1) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError("nginx did not become ready within 10 seconds")
            time.sleep(0.1)

        for body in (b"small", LARGE_BODY):
            request = urllib.request.Request(url, data=body, method="POST")
            with client.open(request, timeout=10) as response:
                if response.status != 200 or response.read() != b"synthetic-upstream-ok":
                    raise RuntimeError("Request did not reach the synthetic upstream")
            if Backend.received.get(timeout=1) != body:
                raise RuntimeError("The upstream received a truncated/changed request body")
            print(f"PASS: uid 121 buffered/proxied {len(body)} bytes to the upstream")
    finally:
        if nginx is not None:
            nginx.terminate()
            try:
                nginx.wait(timeout=5)
            except subprocess.TimeoutExpired:
                nginx.kill()
                nginx.wait(timeout=5)
        for server in servers:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
