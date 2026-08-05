#!/usr/bin/env python3
"""Offline behavioral harness for the nginx failover/retry policy in nginx.conf.

Purpose
-------
Exercise the retry/method semantics that PR #721 documents, against a real nginx
binary and loopback mock upstreams -- NO live services, no Docker, no AWS. This is
an operational/behavioral check, deliberately NOT wired into pytest: it needs an
nginx binary and spawns processes, which does not belong in the unit-test stack.

What it asserts (deterministic, ordering forced with upstream `weight`):
  - The checked-in nginx/memory/Docker policy still matches this behavioral harness
  1. GET, first peer 502, second 200                 -> final 200 (failover)
  2. POST body sent, first peer 502                   -> final 502, NOT retried
  3. POST, first peer connection-refused (pre-send)   -> retried -> final 200
  4. PUT body sent, first peer 502                     -> retried -> final 200
  5. GET, two peers 502, third healthy, tries=2        -> final 502 (third NOT tried)
  6. Targeted log minimization: no query string/client address; $request_id present
  7. Ordinary application 500 response                       -> NOT logged
  8. Upstream gateway 502 response                           -> logged
  9. Upstream gateway 504 response                           -> logged

Cases requiring wall-clock/quarantine timing and multi-nginx-worker shared health
state (quarantine/recovery, handoff-timeout cutoff) are outside this harness. The
production Docker build runs `nginx -t` against the pinned nginx 1.21.6 config.

Version note
------------
Run this against the PRODUCTION-pinned nginx (1.21.6) for authoritative results. The
directives under test (proxy_next_upstream, _tries, _timeout, method policy) are core
and version-stable; a smoke run on another local nginx confirms the harness itself.

Usage
-----
  python3 deploy/docker/production/test_nginx_failover.py [--nginx /path/to/nginx]
Exit code 0 = all asserted cases passed; 2 = a case failed; 77 = skipped (no nginx).
"""
import argparse
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class MockUpstream(threading.Thread):
    """Minimal loopback HTTP upstream with a fixed behavior.

    status: 200 | 500 | 502 -- reads the full request (incl. body via Content-Length),
    then returns that status. A "refused" peer is modeled by simply NOT starting a
    server on its port (connect() then fails pre-send).
    """

    def __init__(self, port, status):
        super().__init__(daemon=True)
        self.port = port
        self.status = status
        self._stopped = False
        self._srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._srv.bind(("127.0.0.1", port))
        self._srv.listen(16)
        self._srv.settimeout(0.3)

    def run(self):
        while not self._stopped:
            try:
                conn, _ = self._srv.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=self._handle, args=(conn,), daemon=True).start()

    def _handle(self, conn):
        conn.settimeout(2.0)
        data = b""
        try:
            # Read headers.
            while b"\r\n\r\n" not in data:
                chunk = conn.recv(4096)
                if not chunk:
                    conn.close()
                    return
                data += chunk
            head = data.split(b"\r\n\r\n", 1)[0]
            m = re.search(rb"content-length:\s*(\d+)", head, re.I)
            if m:
                need = int(m.group(1))
                have = len(data) - (len(head) + 4)
                while have < need:
                    chunk = conn.recv(4096)
                    if not chunk:
                        break
                    have += len(chunk)
            body = b"ok" if self.status == 200 else b"bad"
            reason = {
                200: "OK",
                500: "Internal Server Error",
                502: "Bad Gateway",
                504: "Gateway Timeout",
            }[self.status]
            resp = (
                f"HTTP/1.1 {self.status} {reason}\r\n"
                f"Content-Length: {len(body)}\r\n"
                f"Connection: close\r\n\r\n"
            ).encode() + body
            conn.sendall(resp)
        except OSError:
            pass
        finally:
            conn.close()

    def stop(self):
        self._stopped = True
        try:
            self._srv.close()
        except OSError:
            pass


def write_conf(workdir, listen_port, upstream_servers, access_log):
    """Render a minimal nginx.conf mirroring the PR's retry directives.

    upstream_servers: list of "server ...;" lines (weights force deterministic order).
    No `use epoll;` -- let nginx pick the platform default so this runs on macOS too.
    """
    conf = f"""
worker_processes 1;
error_log stderr warn;
pid {workdir}/nginx.pid;
events {{ worker_connections 64; }}
http {{
    log_format upstream_debug
        'method=$request_method uri="$uri" status=$status '
        'req_id=$request_id upstream_addr="$upstream_addr" '
        'upstream_status="$upstream_status"';
    map $upstream_addr   $ul_failover        {{ "~,"      1; default 0; }}
    map $upstream_status $ul_gateway_failure {{ "~50[24]" 1; default 0; }}
    map "$ul_failover$ul_gateway_failure" $ul_log {{ default 1; "00" 0; }}
    access_log {access_log} upstream_debug if=$ul_log;

    proxy_next_upstream error timeout http_502;
    proxy_next_upstream_tries 2;
    proxy_next_upstream_timeout 30s;

    upstream app {{
        {chr(10).join('        ' + s for s in upstream_servers)}
    }}
    server {{
        listen 127.0.0.1:{listen_port};
        location / {{
            proxy_pass http://app;
        }}
    }}
}}
"""
    path = os.path.join(workdir, "nginx.conf")
    with open(path, "w") as f:
        f.write(conf)
    return path


def http_request(port, method, path, body=None):
    s = socket.socket()
    s.settimeout(5.0)
    s.connect(("127.0.0.1", port))
    body_bytes = (body or "").encode()
    req = f"{method} {path} HTTP/1.1\r\nHost: t\r\nConnection: close\r\n"
    if method in ("POST", "PUT", "PATCH"):
        req += f"Content-Length: {len(body_bytes)}\r\n"
    req += "\r\n"
    s.sendall(req.encode() + body_bytes)
    data = b""
    while True:
        try:
            chunk = s.recv(4096)
        except socket.timeout:
            break
        if not chunk:
            break
        data += chunk
    s.close()
    status_line = data.split(b"\r\n", 1)[0].decode(errors="replace")
    m = re.match(r"HTTP/1\.\d (\d+)", status_line)
    return int(m.group(1)) if m else 0


class Nginx:
    def __init__(self, nginx_bin, conf, prefix):
        self.p = subprocess.Popen([nginx_bin, "-c", conf, "-p", prefix, "-g", "daemon off;"],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        time.sleep(0.6)

    def stop(self):
        self.p.terminate()
        try:
            self.p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.p.kill()


def run_case(nginx_bin, name, upstream_specs, method, expect_status, extra_check=None):
    """upstream_specs: list of (behavior, weight). behavior: 200|502|refuse."""
    workdir = tempfile.mkdtemp(prefix="nginx_failover_")
    mocks = []
    servers = []
    try:
        for behavior, weight in upstream_specs:
            port = free_port()
            if isinstance(behavior, int):
                mk = MockUpstream(port, behavior)
                mk.start()
                mocks.append(mk)
            # behavior "refuse": no listener bound to `port` -> connection refused
            w = f" weight={weight}" if weight else ""
            servers.append(f"server 127.0.0.1:{port}{w} fail_timeout=15s;")
        listen = free_port()
        access_log = os.path.join(workdir, "access.log")
        conf = write_conf(workdir, listen, servers, access_log)
        ng = Nginx(nginx_bin, conf, workdir)
        try:
            status = http_request(listen, method, "/probe?token=SECRET123", body="x" * 32)
        finally:
            ng.stop()
        log_txt = ""
        if os.path.exists(access_log):
            with open(access_log) as f:
                log_txt = f.read()
        ok = status == expect_status
        detail = f"status={status} expect={expect_status}"
        if ok and extra_check:
            ex_ok, ex_detail = extra_check(log_txt)
            ok = ok and ex_ok
            detail += f"; {ex_detail}"
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")
        return ok
    finally:
        for mk in mocks:
            mk.stop()
        shutil.rmtree(workdir, ignore_errors=True)


def validate_checked_in_policy():
    """Keep the minimal test config tied to the production policy it represents."""
    repo_root = Path(__file__).resolve().parents[3]
    nginx_conf = (repo_root / "deploy/docker/production/nginx.conf").read_text()
    base_ini = (repo_root / "base.ini").read_text()
    dockerfile = (repo_root / "Dockerfile").read_text()

    log_format = re.search(
        r"log_format\s+upstream_debug(?P<body>.*?);", nginx_conf, re.S
    )
    upstream = re.search(r"upstream\s+app\s*\{(?P<body>.*?)\n\s*\}", nginx_conf, re.S)
    active_peers = re.findall(
        r"^\s*server 0\.0\.0\.0:654[3-7] fail_timeout=15s;\s*$",
        upstream.group("body") if upstream else "",
        re.M,
    )
    checks = {
        "retry conditions": "proxy_next_upstream error timeout http_502;" in nginx_conf,
        "two total attempts": "proxy_next_upstream_tries 2;" in nginx_conf,
        "30s handoff cutoff": "proxy_next_upstream_timeout 30s;" in nginx_conf,
        "five active 15s peers": len(active_peers) == 5,
        "no backup peer": not re.search(
            r"^\s*server\s+[^;]*\bbackup\b", upstream.group("body") if upstream else "", re.M
        ),
        "gateway-only status log": '"~50[24]" 1' in nginx_conf,
        "client address omitted": bool(log_format) and "$remote_addr" not in log_format.group("body"),
        "450MB parent cap": re.findall(r"^rss_limit\s*=\s*(\S+)", base_ini, re.M) == ["450MB"],
        "pinned nginx syntax gate": "RUN nginx -v && nginx -t" in dockerfile,
    }
    failed = [name for name, ok in checks.items() if not ok]
    ok = not failed
    detail = "all guardrails present" if ok else "missing/mismatched: " + ", ".join(failed)
    print(f"[{'PASS' if ok else 'FAIL'}] checked-in production policy: {detail}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nginx", default=shutil.which("nginx"))
    args = ap.parse_args()
    if not args.nginx:
        print("SKIP: no nginx binary found (pass --nginx). Exit 77.")
        return 77
    ver = subprocess.run([args.nginx, "-v"], capture_output=True, text=True)
    print(f"nginx: {ver.stderr.strip() or ver.stdout.strip()}")
    print("(Run against pinned 1.21.6 for authoritative results.)\n")

    results = [validate_checked_in_policy()]
    # 1. GET failover: first peer 502 (heavy weight -> first hop), second 200.
    results.append(run_case(args.nginx, "GET 502->200 failover",
                            [(502, 100), (200, 1)], "GET", 200))
    # 2. POST after-send 502 -> NOT retried.
    results.append(run_case(args.nginx, "POST after-send 502 (no retry)",
                            [(502, 100), (200, 1)], "POST", 502))
    # 3. POST pre-send connection refused -> retried -> 200.
    results.append(run_case(args.nginx, "POST pre-send refuse -> retry 200",
                            [("refuse", 100), (200, 1)], "POST", 200))
    # 4. PUT after-send 502 -> retried (PUT not protected) -> 200.
    results.append(run_case(args.nginx, "PUT after-send 502 -> retry 200",
                            [(502, 100), (200, 1)], "PUT", 200))
    # 5. tries=2: two 502 peers, third healthy -> 502 (third not tried).
    results.append(run_case(args.nginx, "tries=2: 502,502,(healthy 3rd) -> 502",
                            [(502, 100), (502, 50), (200, 1)], "GET", 502))

    # 6. Log minimization + correlation id (reuse case 1's failover log).
    def check_log(log_txt):
        no_qs = "SECRET123" not in log_txt and "token=" not in log_txt
        has_id = "req_id=" in log_txt and not re.search(r"req_id=(\s|$)", log_txt)
        has_uri = 'uri="/probe"' in log_txt
        no_client_addr = not log_txt.startswith("127.0.0.1 ")
        return (no_qs and has_id and has_uri and no_client_addr,
                f"query_string_redacted={no_qs} req_id_present={has_id} "
                f"uri_logged={has_uri} client_addr_omitted={no_client_addr}")
    results.append(run_case(args.nginx, "targeted log: minimized, has req_id",
                            [(502, 100), (200, 1)], "GET", 200, extra_check=check_log))

    # 7. An ordinary application 500 is already in the LB log; do not duplicate it.
    def check_no_targeted_log(log_txt):
        empty = not log_txt.strip()
        return empty, f"targeted_log_empty={empty}"
    results.append(run_case(args.nginx, "application 500 is not targeted-log noise",
                            [(500, 1)], "GET", 500, extra_check=check_no_targeted_log))

    # 8. A gateway 502 with no successful retry remains a worker-failure signal.
    def check_gateway_log(log_txt):
        logged = 'upstream_status="502"' in log_txt
        return logged, f"gateway_failure_logged={logged}"
    results.append(run_case(args.nginx, "gateway 502 remains targeted-log signal",
                            [(502, 1)], "GET", 502, extra_check=check_gateway_log))

    # 9. Exhausted upstream timeouts surface as 504 and must remain visible too.
    def check_timeout_log(log_txt):
        logged = 'upstream_status="504"' in log_txt
        return logged, f"gateway_timeout_logged={logged}"
    results.append(run_case(args.nginx, "gateway 504 remains targeted-log signal",
                            [(504, 1)], "GET", 504, extra_check=check_timeout_log))

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} cases passed")
    return 0 if passed == len(results) else 2


if __name__ == "__main__":
    sys.exit(main())
