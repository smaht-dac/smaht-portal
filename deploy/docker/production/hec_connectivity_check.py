"""Opt-in Splunk Cloud HEC connectivity diagnostic, run from the deployment task.

WHY THIS EXISTS
---------------
The Splunk Universal Forwarder runs as its own ECS sidecar (see
``deploy/docker/splunk/``) and ships logs over the deployment-server-managed
outputs path. Before anyone wires an HTTP Event Collector (HEC) route through
that Fargate network, we need to know *from inside an actual Fargate task*
which hop fails: DNS, TCP egress, TLS interception/trust, or HEC authorization.
Those four failures look identical from the outside, and none of them can be
reproduced from a laptop.

This module answers that question and nothing else. It is a diagnostic, not a
deployment gate: ``entrypoint_deployment.sh`` runs it non-fatally, so a failed
probe never aborts a production deployment (deliberately the opposite of
``setup_nginx_tls.sh``, which fails closed).

OPT-IN (IT SENDS A REAL EVENT)
------------------------------
Nothing here runs unless ``SPLUNK_HEC_CONNECTIVITY_TEST=true``. On the success
path this posts **exactly one** synthetic event to the collector. The switch is
named for that side effect, there are no retries anywhere on the send path, and
ordinary deployments (the variable unset) do no DNS, no TCP, no Secrets Manager
call, and no send.

WHAT IT DISTINGUISHES
---------------------
Each stage logs a timestamped, bounded, sanitized line and stops at the first
failure, so the outcome is never ambiguous:

  ``dns``     hostname lookup success/failure + the addresses returned
  ``tcp``     connect success/failure + elapsed ms + the peer actually used
  ``tls``     handshake and certificate-chain validation, protocol/cipher, and
              sanitized certificate identity (subject/issuer/notAfter)
  ``secret``  HEC token retrieval from Secrets Manager (a distinct outcome: an
              AccessDenied here is NOT "HEC unreachable")
  ``send``    ONE HTTP POST; status line plus a bounded, token-free body summary
  ``RESULT``  the single authoritative outcome line

A completed TCP connection, a completed TLS handshake, or transferred bytes do
NOT prove HEC accepted anything -- a proxy, a WAF, or a load balancer will all
happily terminate a connection. Only the HTTP status and the collector's own
response code are treated as evidence of ingestion, and the RESULT line says so.

CREDENTIALS / SECRET PATH
-------------------------
The HEC token is read at runtime from AWS Secrets Manager through boto3's
default credential chain -- i.e. the ECS task role, the same supported path
``assume_identity.py`` already uses. No token is baked into the image, the
source, the tests, or the environment.

SECURITY
--------
The token, the ``Authorization`` header, and the raw Secrets Manager response
are never logged. Every line that could carry attacker- or service-controlled
text is passed through ``redact()`` (which also scrubs the live token value
literally) and truncated. Nothing shells out, so no command line can leak a
credential. botocore/urllib3 loggers are pinned to WARNING because
``assume_identity.py`` calls ``logging.basicConfig(level=logging.INFO)`` in this
same image and a DEBUG-level botocore would print the GetSecretValue response
verbatim. ``http.client`` debuglevel is never enabled.

CONFIGURATION (all overrides exist for controlled environments only)
--------------------------------------------------------------------
  SPLUNK_HEC_CONNECTIVITY_TEST   "true" enables the probe (and the one send)
  SPLUNK_HEC_HOST                bare hostname ONLY -- no scheme, no port, no path
  SPLUNK_HEC_PORT                443
  SPLUNK_HEC_PATH                /services/collector/event  (kept separate from the host)
  SPLUNK_HEC_TOKEN_SECRET_ARN    the Secrets Manager ARN holding the HEC token
  SPLUNK_HEC_SECRET_JSON_KEY     key to pull when the secret is a JSON object
  SPLUNK_HEC_TIMEOUT_SECONDS     per-stage timeout, clamped to [1, 15]
  SPLUNK_HEC_CA_BUNDLE           alternate CA bundle (private CA / test server)

Regression coverage: ``deploy/docker/production/tests/test_hec_connectivity_check.py``
(no AWS, no internet -- a real local TLS server plus a fake Secrets Manager).
"""

import http.client
import json
import logging
import os
import re
import socket
import ssl
import sys
import time
import uuid

# --- expected configuration, stated explicitly -----------------------------
# The host field is a BARE HOSTNAME. The scheme (always HTTPS), the port (443),
# and the collector path are separate settings and are validated as such, so a
# full URL pasted into the host field fails loudly instead of silently probing
# the wrong endpoint.
DEFAULT_HOST = "http-inputs.harvardmedfedramp.splunkcloudgc.com"
DEFAULT_PORT = 443
DEFAULT_PATH = "/services/collector/event"

# Fixed test secret for this diagnostic. An ARN is an identifier, not a
# credential; the token it holds is fetched at runtime and never logged.
DEFAULT_SECRET_ARN = (
    "arn:aws:secretsmanager:us-east-1:527768939855:"
    "secret:C4AppConfigSmahtDevSrceSplunkToken-GJtiE7"
)

ENABLE_VAR = "SPLUNK_HEC_CONNECTIVITY_TEST"
LOG_PREFIX = "[hec-check]"

DEFAULT_TIMEOUT_SECONDS = 5.0
MIN_TIMEOUT_SECONDS = 1.0
MAX_TIMEOUT_SECONDS = 15.0

MAX_BODY_CHARS = 512          # bounded response summary
MAX_DETAIL_CHARS = 400        # bounded error/detail text
MAX_ADDRESSES_LOGGED = 8      # bounded DNS answer list

SOURCETYPE = "smaht:hec-connectivity-test"

# Distinct exit codes so the failing hop is legible from the task exit status
# alone, without parsing logs.
EXIT_OK = 0
EXIT_DISABLED = 0
EXIT_CONFIG = 2
EXIT_DNS = 3
EXIT_TCP = 4
EXIT_TLS = 5
EXIT_SECRET = 6
EXIT_SEND = 7
EXIT_RESPONSE = 8

# Patched by the tests. Bound to a module attribute on purpose: patching
# socket.getaddrinfo globally would also change socket.create_connection and
# ssl's own lookups, so a "DNS failure" case would contaminate unrelated hops.
_getaddrinfo = socket.getaddrinfo

# Secrets are fetched through this seam so the tests never need AWS.
_boto3_client = None


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _elapsed_ms(started):
    return int((time.monotonic() - started) * 1000)


# ---------------------------------------------------------------------------
# Redaction. Applied to EVERY value interpolated into a log line that did not
# originate as a literal in this file.
# ---------------------------------------------------------------------------

# HEC tokens are UUIDs; Splunk auth headers are "Splunk <token>". These patterns
# are belt-and-braces on top of the literal scrub of the live token below.
_REDACTION_PATTERNS = (
    re.compile(r"(?i)\b(Splunk|Bearer|Basic)\s+\S+"),
    re.compile(r"(?i)\b(authorization|x-splunk-request-channel)\b\s*[:=]\s*\S+"),
    # key/value credential shapes. The leading lookbehind keeps ARNs readable:
    # in `arn:aws:secretsmanager:...:secret:NAME` the word `secret` is preceded by
    # a colon, so the ARN (an identifier, not a credential, and the single most
    # useful thing to see when the fetch fails) survives intact.
    re.compile(
        r"(?i)(?<![:\w-])([\"']?(?:token|secret|secretstring|password|passwd|apikey|api_key)"
        r"(?![\w-])[\"']?\s*[:=]\s*[\"']?)[^\s,;\"'}]+"
    ),
    # Bare UUIDs (the shape of a HEC token). Skipped inside path-like text so
    # filesystem paths containing a UUID stay diagnosable.
    re.compile(r"(?<![/\w])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
               r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![/\w])"),
)

# The live token value, registered once fetched so it can be scrubbed literally
# even if it appears somewhere none of the patterns above anticipated.
_LITERAL_SECRETS = set()


def register_secret(value):
    """Register a literal value to scrub from all subsequent output."""
    if value and isinstance(value, str) and len(value) >= 8:
        _LITERAL_SECRETS.add(value)


def redact(text, limit=MAX_DETAIL_CHARS):
    """Scrub credential-shaped content from `text` and bound its length."""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    for literal in _LITERAL_SECRETS:
        text = text.replace(literal, "<redacted>")
    for pattern in _REDACTION_PATTERNS:
        # Keep the label (group 1 where present) so the line stays diagnosable.
        text = pattern.sub(
            lambda m: (m.group(1) + " <redacted>") if m.groups() else "<redacted>",
            text,
        )
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[:limit] + "...<truncated>"
    return text


def log(message):
    """Emit one timestamped diagnostic line (unbuffered, so ECS logs stay ordered)."""
    print("%s %s %s" % (LOG_PREFIX, _now(), message), flush=True)


def _quiet_aws_loggers():
    """Pin AWS/HTTP loggers to WARNING.

    ``assume_identity.py`` runs ``logging.basicConfig(level=logging.INFO)`` in
    this same image; if anything ever raises the root level to DEBUG, botocore
    and urllib3 print full request/response bodies -- which for GetSecretValue
    is the HEC token in cleartext. Pin them here rather than trusting ambient
    configuration.
    """
    for name in ("boto3", "botocore", "urllib3", "s3transfer"):
        logging.getLogger(name).setLevel(logging.WARNING)
        logging.getLogger(name).propagate = False


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class ConfigError(Exception):
    pass


def _timeout_seconds(env):
    raw = env.get("SPLUNK_HEC_TIMEOUT_SECONDS", "")
    if not raw.strip():
        return DEFAULT_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(
            "SPLUNK_HEC_TIMEOUT_SECONDS is not a number: %s" % redact(raw, 40)
        )
    # Clamp rather than reject: an operator typo must not be able to hang a
    # deployment task on an unbounded socket.
    return max(MIN_TIMEOUT_SECONDS, min(MAX_TIMEOUT_SECONDS, value))


def load_config(env):
    """Resolve and validate the probe configuration from the environment."""
    host = (env.get("SPLUNK_HEC_HOST") or DEFAULT_HOST).strip()
    if not host:
        raise ConfigError("SPLUNK_HEC_HOST is empty")
    # The host field carries a bare hostname only -- scheme, port, and path are
    # separate settings. Catch a pasted URL here instead of probing nonsense.
    if "://" in host or "/" in host or ":" in host:
        raise ConfigError(
            "SPLUNK_HEC_HOST must be a bare hostname (no scheme, port, or path); got %s"
            % redact(host, 80)
        )

    raw_port = (env.get("SPLUNK_HEC_PORT") or str(DEFAULT_PORT)).strip()
    try:
        port = int(raw_port)
    except ValueError:
        raise ConfigError("SPLUNK_HEC_PORT is not an integer: %s" % redact(raw_port, 40))
    if not 1 <= port <= 65535:
        raise ConfigError("SPLUNK_HEC_PORT out of range: %d" % port)

    path = (env.get("SPLUNK_HEC_PATH") or DEFAULT_PATH).strip()
    if not path.startswith("/"):
        raise ConfigError("SPLUNK_HEC_PATH must start with '/': %s" % redact(path, 80))

    secret_arn = (env.get("SPLUNK_HEC_TOKEN_SECRET_ARN") or DEFAULT_SECRET_ARN).strip()
    if not secret_arn:
        raise ConfigError("SPLUNK_HEC_TOKEN_SECRET_ARN is empty")

    return {
        "host": host,
        "port": port,
        "path": path,
        "secret_arn": secret_arn,
        "secret_json_key": (env.get("SPLUNK_HEC_SECRET_JSON_KEY") or "").strip(),
        "timeout": _timeout_seconds(env),
        "ca_bundle": (env.get("SPLUNK_HEC_CA_BUNDLE") or "").strip(),
    }


def _region_from_arn(arn):
    """Region is field 3 of the ARN, so the probe needs no AWS_REGION to be set."""
    parts = arn.split(":")
    if len(parts) > 3 and parts[3]:
        return parts[3]
    return None


# ---------------------------------------------------------------------------
# Stage 1: DNS
# ---------------------------------------------------------------------------

def resolve(host, port):
    """Look the hostname up; return the address list. Raises on failure."""
    started = time.monotonic()
    try:
        infos = _getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as exc:
        log("stage 'dns': FAILED host=%s after %dms: %s"
            % (host, _elapsed_ms(started), redact(exc)))
        raise
    addresses = []
    for family, _stype, _proto, _canon, sockaddr in infos:
        if (family, sockaddr) not in [(a[0], a[1]) for a in addresses]:
            addresses.append((family, sockaddr))
    shown = ", ".join(str(sockaddr[0]) for _f, sockaddr in addresses[:MAX_ADDRESSES_LOGGED])
    log("stage 'dns': OK host=%s resolved %d address(es) in %dms: %s%s"
        % (host, len(addresses), _elapsed_ms(started), shown,
           " (truncated)" if len(addresses) > MAX_ADDRESSES_LOGGED else ""))
    return addresses


# ---------------------------------------------------------------------------
# Stage 2 + 3: TCP connect, then TLS handshake on that same socket
# ---------------------------------------------------------------------------

def tcp_connect(addresses, timeout):
    """Connect to the first reachable resolved address. Returns (socket, peer)."""
    last_error = None
    for family, sockaddr in addresses:
        started = time.monotonic()
        sock = socket.socket(family, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect(sockaddr)
        except OSError as exc:
            last_error = exc
            log("stage 'tcp': FAILED peer=%s after %dms: %s"
                % (redact(str(sockaddr[0]), 60), _elapsed_ms(started), redact(exc)))
            sock.close()
            continue
        log("stage 'tcp': OK peer=%s:%s connected in %dms"
            % (redact(str(sockaddr[0]), 60), sockaddr[1], _elapsed_ms(started)))
        return sock, sockaddr
    raise last_error if last_error else OSError("no addresses to connect to")


def build_ssl_context(ca_bundle):
    """Default-verifying context (hostname check + chain validation both on)."""
    if ca_bundle:
        context = ssl.create_default_context(cafile=ca_bundle)
        log("stage 'tls': using alternate CA bundle %s" % redact(ca_bundle, 200))
    else:
        context = ssl.create_default_context()
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return context


def _cert_summary(peercert):
    """Bounded, sanitized certificate identity. Never the full certificate."""
    if not peercert:
        return "certificate=<none presented>"

    def _pull(field):
        for rdn in peercert.get(field, ()):
            for key, value in rdn:
                if key == "commonName":
                    return value
                if key == "organizationName":
                    return value
        return "?"

    return "subject_cn=%s issuer=%s not_after=%s" % (
        redact(_pull("subject"), 100),
        redact(_pull("issuer"), 100),
        redact(peercert.get("notAfter", "?"), 60),
    )


def tls_handshake(sock, host, context, timeout):
    """Wrap the connected socket in TLS with full certificate validation."""
    started = time.monotonic()
    sock.settimeout(timeout)
    try:
        tls_sock = context.wrap_socket(sock, server_hostname=host)
    except ssl.SSLCertVerificationError as exc:
        log("stage 'tls': FAILED certificate validation for host=%s after %dms: %s"
            % (host, _elapsed_ms(started), redact(exc)))
        raise
    except (ssl.SSLError, OSError) as exc:
        log("stage 'tls': FAILED handshake with host=%s after %dms: %s"
            % (host, _elapsed_ms(started), redact(exc)))
        raise
    cipher = tls_sock.cipher() or ("?", "?", 0)
    log("stage 'tls': OK handshake + certificate validated for host=%s in %dms "
        "protocol=%s cipher=%s"
        % (host, _elapsed_ms(started), redact(tls_sock.version(), 40),
           redact(cipher[0], 60)))
    log("stage 'tls': peer certificate %s" % _cert_summary(tls_sock.getpeercert()))
    return tls_sock


# ---------------------------------------------------------------------------
# Stage 4: HEC token from Secrets Manager (ECS task role)
# ---------------------------------------------------------------------------

def _make_secrets_client(region, timeout):
    """Secrets Manager client on the standard ECS task-role credential chain."""
    if _boto3_client is not None:            # test seam
        return _boto3_client(region)
    import boto3                              # noqa: PLC0415 - keep import cost off the disabled path
    from botocore.config import Config
    # max_attempts=1 => no retries, so a black-holed endpoint cannot stall the
    # deployment task beyond the bounded timeouts.
    config = Config(
        retries={"max_attempts": 1, "mode": "standard"},
        connect_timeout=timeout,
        read_timeout=timeout,
    )
    kwargs = {"config": config}
    if region:
        kwargs["region_name"] = region
    return boto3.client("secretsmanager", **kwargs)


def _extract_token(payload, json_key):
    """Pull the token out of a raw-string or JSON-object secret."""
    stripped = payload.strip()
    if stripped.startswith("{"):
        try:
            document = json.loads(stripped)
        except ValueError:
            return stripped
        if not isinstance(document, dict):
            return stripped
        if json_key:
            if json_key not in document:
                raise KeyError(
                    "SPLUNK_HEC_SECRET_JSON_KEY=%s is not present in the secret"
                    % redact(json_key, 60)
                )
            return str(document[json_key])
        for key in document:
            if "token" in key.lower():
                return str(document[key])
        if len(document) == 1:
            return str(next(iter(document.values())))
        raise KeyError(
            "secret is a JSON object with %d keys and no token-like key; "
            "set SPLUNK_HEC_SECRET_JSON_KEY" % len(document)
        )
    return stripped


def fetch_token(config):
    """Fetch + register the HEC token. The value is never logged, only its shape."""
    region = _region_from_arn(config["secret_arn"])
    started = time.monotonic()
    client = _make_secrets_client(region, config["timeout"])
    response = client.get_secret_value(SecretId=config["secret_arn"])
    payload = response.get("SecretString")
    if not payload:
        raise ValueError("secret has no SecretString (binary secrets are not supported)")
    token = _extract_token(payload, config["secret_json_key"])
    if not token:
        raise ValueError("resolved HEC token is empty")
    register_secret(token)
    register_secret(payload)
    log("stage 'secret': OK retrieved HEC token from %s (region=%s) in %dms "
        "[value redacted; length=%d chars]"
        % (redact(config["secret_arn"], 160), region or "<default>",
           _elapsed_ms(started), len(token)))
    return token


# ---------------------------------------------------------------------------
# Stage 5: exactly one synthetic event
# ---------------------------------------------------------------------------

def build_event(check_id):
    """Minimally identifying synthetic event.

    Deliberately excludes user data, credentials, environment dumps, and any
    deployment configuration -- just enough for the captain to find this exact
    event in Splunk and correlate it with the task that sent it.
    """
    return {
        "time": int(time.time()),
        "host": socket.gethostname(),
        "source": "smaht-portal-deployment",
        "sourcetype": SOURCETYPE,
        "event": {
            "message": "smaht-portal HEC connectivity test",
            "check_id": check_id,
            "application_type": os.environ.get("application_type", "unknown"),
        },
    }


def _summarize_response(status, reason, body_bytes):
    """Bounded, token-free summary of the collector's reply."""
    text = body_bytes.decode("utf-8", errors="replace")
    summary = redact(text, MAX_BODY_CHARS)
    splunk_code = None
    splunk_text = None
    try:
        document = json.loads(text)
        if isinstance(document, dict):
            splunk_code = document.get("code")
            splunk_text = document.get("text")
    except ValueError:
        pass
    return {
        "status": status,
        "reason": redact(reason, 80),
        "body": summary,
        "splunk_code": splunk_code,
        "splunk_text": redact(splunk_text, 80) if splunk_text is not None else None,
    }


def send_event(config, token, context, check_id):
    """POST exactly one event. No retries -- a retry would multiply test events."""
    payload = json.dumps(build_event(check_id)).encode("utf-8")
    # NOTE: this opens a FRESH TLS connection. The stage 'tcp'/'tls' probe socket
    # above is closed before we get here, so the handshake reported by those
    # stages is not the session carrying this request -- a second handshake
    # happens now, over the same host/port/context.
    log("stage 'send': opening a NEW TLS connection (the probe socket is closed; "
        "this re-establishes the handshake) to https://%s:%d%s"
        % (config["host"], config["port"], config["path"]))
    connection = http.client.HTTPSConnection(
        config["host"], config["port"], timeout=config["timeout"], context=context
    )
    started = time.monotonic()
    try:
        # The token appears ONLY here, in the request header. It is never logged,
        # never placed in argv, and never put in a child process environment.
        connection.request(
            "POST",
            config["path"],
            body=payload,
            headers={
                "Authorization": "Splunk %s" % token,
                "Content-Type": "application/json",
                "Content-Length": str(len(payload)),
                "User-Agent": "smaht-portal-hec-connectivity-check",
            },
        )
        response = connection.getresponse()
        body = response.read(MAX_BODY_CHARS * 4)
        summary = _summarize_response(response.status, response.reason, body)
    finally:
        connection.close()
    summary["elapsed_ms"] = _elapsed_ms(started)
    log("stage 'send': sent 1 event (check_id=%s, %d bytes, no retries); "
        "HTTP %s %s in %dms"
        % (check_id, len(payload), summary["status"], summary["reason"],
           summary["elapsed_ms"]))
    log("stage 'send': response body (bounded, redacted): %s"
        % (summary["body"] or "<empty>"))
    return summary


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def _fail(stage, exc, exit_code):
    log("RESULT: FAILED at stage '%s' -- %s: %s"
        % (stage, type(exc).__name__, redact(exc)))
    return exit_code


def main(env=None):
    env = os.environ if env is None else env

    if (env.get(ENABLE_VAR) or "").strip().lower() != "true":
        log("disabled: %s is not 'true' - skipping the HEC connectivity check "
            "(no DNS, no TCP, no Secrets Manager call, no event sent)" % ENABLE_VAR)
        return EXIT_DISABLED

    _quiet_aws_loggers()

    try:
        config = load_config(env)
    except ConfigError as exc:
        log("RESULT: FAILED at stage 'config' -- %s" % redact(exc))
        return EXIT_CONFIG

    check_id = str(uuid.uuid4())
    log("enabled: probing HEC endpoint https://%s:%d%s (timeout=%.1fs per stage, "
        "one event only, no retries) check_id=%s"
        % (config["host"], config["port"], config["path"], config["timeout"], check_id))
    log("config: host=%s (hostname only) scheme=https port=%d path=%s secret_arn=%s"
        % (config["host"], config["port"], config["path"],
           redact(config["secret_arn"], 160)))

    # Stage 1: DNS
    try:
        addresses = resolve(config["host"], config["port"])
    except Exception as exc:                                    # noqa: BLE001
        return _fail("dns", exc, EXIT_DNS)

    # Stage 2: TCP
    try:
        sock, _peer = tcp_connect(addresses, config["timeout"])
    except Exception as exc:                                    # noqa: BLE001
        return _fail("tcp", exc, EXIT_TCP)

    # Stage 3: TLS (handshake + certificate validation) on that socket
    try:
        context = build_ssl_context(config["ca_bundle"])
        tls_sock = tls_handshake(sock, config["host"], context, config["timeout"])
        tls_sock.close()
    except Exception as exc:                                    # noqa: BLE001
        try:
            sock.close()
        except OSError:
            pass
        return _fail("tls", exc, EXIT_TLS)

    log("note: TCP connect and TLS handshake succeeded. That proves reachability "
        "and trust ONLY - it does NOT prove HEC accepted anything. A proxy, WAF, "
        "or load balancer terminates connections identically. The HTTP status "
        "below is the authoritative signal.")

    # Stage 4: HEC token (distinct outcome - AccessDenied here is not "unreachable")
    try:
        token = fetch_token(config)
    except Exception as exc:                                    # noqa: BLE001
        log("RESULT: FAILED at stage 'secret' -- could not retrieve the HEC token "
            "from Secrets Manager (this is an IAM/secret problem, NOT a network "
            "reachability problem; the endpoint was reachable over TLS above). "
            "%s: %s" % (type(exc).__name__, redact(exc)))
        return EXIT_SECRET

    # Stage 5: exactly one event
    try:
        summary = send_event(config, token, context, check_id)
    except Exception as exc:                                    # noqa: BLE001
        return _fail("send", exc, EXIT_SEND)

    status = summary["status"]
    detail = "http_status=%s splunk_code=%s splunk_text=%s check_id=%s" % (
        status,
        summary["splunk_code"] if summary["splunk_code"] is not None else "<none>",
        summary["splunk_text"] or "<none>",
        check_id,
    )
    if 200 <= status < 300:
        log("RESULT: SUCCESS - the collector returned a 2xx for the single test "
            "event. %s. Confirm the event is searchable in Splunk (sourcetype=%s) "
            "before treating ingestion as proven." % (detail, SOURCETYPE))
        return EXIT_OK

    log("RESULT: FAILED - the endpoint was reachable and TLS-valid, but the "
        "collector REJECTED the event (a non-2xx HTTP status means the event was "
        "NOT ingested; 401/403 usually means a bad or disabled HEC token). %s"
        % detail)
    return EXIT_RESPONSE


if __name__ == "__main__":
    sys.exit(main())
