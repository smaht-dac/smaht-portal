"""Regression tests for the opt-in Splunk HEC connectivity diagnostic.

Self-contained: no AWS, no Secrets Manager, no internet. The endpoint hops are
reproduced as closely as is safely feasible rather than mocked away --

  * a REAL TLS server on 127.0.0.1, with a freshly minted self-signed
    certificate, exercises the actual TCP connect, the actual TLS handshake and
    certificate-chain validation, and the actual HTTP request/response;
  * omitting the CA-bundle override against that same server reproduces a true
    certificate-validation failure (distinct from a handshake failure, which is
    reproduced by pointing the probe at a plaintext HTTP server);
  * a closed port reproduces a real TCP refusal;
  * only DNS and Secrets Manager are faked, through named module seams
    (``_getaddrinfo`` / ``_boto3_client``) rather than by patching stdlib
    globals -- patching ``socket.getaddrinfo`` itself would also change
    ``create_connection`` and cross-contaminate the other hops.

The module is loaded from its checked-in path the same way the image ships it.
"""

import http.server
import importlib.util
import json
import os
import socket
import ssl
import threading

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE_PATH = os.path.join(HERE, "..", "hec_connectivity_check.py")

# A realistic HEC token shape (Splunk HEC tokens are UUIDs). Synthetic: this
# value exists only in this test process and is never a real credential.
FAKE_TOKEN = "8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f"


def _load_module():
    spec = importlib.util.spec_from_file_location("hec_connectivity_check", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def hec():
    """Fresh module per test (module-level seams and the secret scrub-list reset)."""
    return _load_module()


# ---------------------------------------------------------------------------
# Local TLS/HTTP test collector
# ---------------------------------------------------------------------------

def _mint_self_signed(common_name="localhost"):
    """Self-signed cert + key valid for 127.0.0.1 and localhost."""
    import datetime
    import ipaddress

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    return (
        cert.public_bytes(serialization.Encoding.PEM),
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )


class _Collector:
    """A local stand-in for the HEC collector that counts POSTs it receives."""

    def __init__(self, status=200, body=None, use_tls=True, tmp_path=None):
        self.posts = []            # one entry per POST actually received
        self.ca_file = None
        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_POST(self):                                  # noqa: N802
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length)
                outer.posts.append({
                    "path": self.path,
                    "authorization": self.headers.get("Authorization"),
                    "body": raw.decode("utf-8", errors="replace"),
                })
                payload = (body if body is not None
                           else json.dumps({"text": "Success", "code": 0})).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_args):                      # silence stderr noise
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        # A deliberately-failed handshake (the cert-validation case) surfaces here;
        # swallow it so the expected failure does not print a traceback.
        self.server.handle_error = lambda *_args: None
        if use_tls:
            cert_pem, key_pem = _mint_self_signed()
            cert_file = tmp_path / "collector.crt"
            key_file = tmp_path / "collector.key"
            cert_file.write_bytes(cert_pem)
            key_file.write_bytes(key_pem)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(str(cert_file), str(key_file))
            self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
            self.ca_file = str(cert_file)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


@pytest.fixture()
def collector(tmp_path):
    made = []

    def _make(status=200, body=None, use_tls=True):
        instance = _Collector(status=status, body=body, use_tls=use_tls, tmp_path=tmp_path)
        made.append(instance)
        return instance

    yield _make
    for instance in made:
        instance.close()


# ---------------------------------------------------------------------------
# Fake Secrets Manager (the only AWS surface these tests touch)
# ---------------------------------------------------------------------------

class _FakeSecrets:
    def __init__(self, payload=FAKE_TOKEN, error=None):
        self.payload = payload
        self.error = error
        self.calls = []

    def __call__(self, _region):
        return self

    def get_secret_value(self, SecretId):                        # noqa: N803 - boto3 API
        self.calls.append(SecretId)
        if self.error:
            raise self.error
        return {"SecretString": self.payload}


def _env(**overrides):
    env = {"SPLUNK_HEC_CONNECTIVITY_TEST": "true", "SPLUNK_HEC_TIMEOUT_SECONDS": "3"}
    env.update(overrides)
    return env


def _point_at(collector_instance, verify=True, **overrides):
    env = _env(
        SPLUNK_HEC_HOST="127.0.0.1",
        SPLUNK_HEC_PORT=str(collector_instance.port),
        SPLUNK_HEC_PATH="/services/collector/event",
    )
    if verify and collector_instance.ca_file:
        env["SPLUNK_HEC_CA_BUNDLE"] = collector_instance.ca_file
    env.update(overrides)
    return env


def _free_port():
    """A port nothing is listening on, for a deterministic TCP refusal."""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


# ---------------------------------------------------------------------------
# 1. Disabled mode - the default for every ordinary deployment
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_disabled_by_default_does_nothing(hec, capsys, monkeypatch):
    """Without the opt-in switch: exit 0, no DNS, no secret fetch, no event."""
    secrets = _FakeSecrets()
    monkeypatch.setattr(hec, "_boto3_client", secrets)

    def _explode(*_args, **_kwargs):
        raise AssertionError("DNS must not be attempted when the check is disabled")

    monkeypatch.setattr(hec, "_getaddrinfo", _explode)

    assert hec.main(env={}) == hec.EXIT_DISABLED
    out = capsys.readouterr().out
    assert "disabled:" in out
    assert "SPLUNK_HEC_CONNECTIVITY_TEST" in out
    assert "stage '" not in out, "no stage may run while disabled"
    assert secrets.calls == [], "Secrets Manager must not be called while disabled"


@pytest.mark.unit
@pytest.mark.parametrize("value", ["", "false", "1", "yes", "TRUE-ish"])
def test_only_exact_true_enables(hec, capsys, monkeypatch, value):
    """The switch is strict: only 'true' opts in to sending an event."""
    monkeypatch.setattr(hec, "_getaddrinfo", lambda *a, **k: pytest.fail("enabled"))
    assert hec.main(env={"SPLUNK_HEC_CONNECTIVITY_TEST": value}) == hec.EXIT_DISABLED
    assert "disabled:" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# 2. DNS failure
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_dns_failure_is_reported_and_stops(hec, capsys, monkeypatch):
    secrets = _FakeSecrets()
    monkeypatch.setattr(hec, "_boto3_client", secrets)

    def _gaierror(*_args, **_kwargs):
        raise socket.gaierror(-2, "Name or service not known")

    monkeypatch.setattr(hec, "_getaddrinfo", _gaierror)

    assert hec.main(env=_env()) == hec.EXIT_DNS
    out = capsys.readouterr().out
    assert "stage 'dns': FAILED" in out
    assert "RESULT: FAILED at stage 'dns'" in out
    assert "stage 'tcp'" not in out, "must stop at the first failing hop"
    assert secrets.calls == [], "no token fetch after a DNS failure"


@pytest.mark.unit
def test_dns_success_logs_the_addresses(hec, capsys, monkeypatch, collector):
    """A successful lookup reports the addresses it returned."""
    instance = collector()
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())
    hec.main(env=_point_at(instance))
    out = capsys.readouterr().out
    assert "stage 'dns': OK" in out
    assert "127.0.0.1" in out


# ---------------------------------------------------------------------------
# 3. TCP failure
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_tcp_connect_failure(hec, capsys, monkeypatch):
    """A closed port: real connection refusal, reported with elapsed time."""
    secrets = _FakeSecrets()
    monkeypatch.setattr(hec, "_boto3_client", secrets)

    env = _env(SPLUNK_HEC_HOST="127.0.0.1", SPLUNK_HEC_PORT=str(_free_port()))
    assert hec.main(env=env) == hec.EXIT_TCP
    out = capsys.readouterr().out
    assert "stage 'dns': OK" in out
    assert "stage 'tcp': FAILED" in out
    assert "RESULT: FAILED at stage 'tcp'" in out
    assert secrets.calls == [], "no token fetch after a TCP failure"


# ---------------------------------------------------------------------------
# 4. TLS failures - handshake vs certificate validation (distinguished)
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_tls_handshake_failure_against_plaintext_endpoint(hec, capsys, monkeypatch, collector):
    """TCP succeeds but there is no TLS peer: handshake failure, not a cert failure."""
    instance = collector(use_tls=False)
    secrets = _FakeSecrets()
    monkeypatch.setattr(hec, "_boto3_client", secrets)

    assert hec.main(env=_point_at(instance)) == hec.EXIT_TLS
    out = capsys.readouterr().out
    assert "stage 'tcp': OK" in out
    assert "stage 'tls': FAILED handshake" in out
    assert "RESULT: FAILED at stage 'tls'" in out
    assert secrets.calls == [], "no token fetch after a TLS failure"


@pytest.mark.unit
def test_tls_certificate_validation_failure(hec, capsys, monkeypatch, collector):
    """A real TLS peer whose certificate does not validate is reported distinctly."""
    instance = collector()
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())

    # Same server, but WITHOUT trusting its self-signed CA.
    assert hec.main(env=_point_at(instance, verify=False)) == hec.EXIT_TLS
    out = capsys.readouterr().out
    assert "stage 'tcp': OK" in out
    assert "stage 'tls': FAILED certificate validation" in out, \
        "cert-validation failure must be distinguishable from a handshake failure"


@pytest.mark.unit
def test_tls_success_reports_protocol_and_certificate(hec, capsys, monkeypatch, collector):
    instance = collector()
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())
    hec.main(env=_point_at(instance))
    out = capsys.readouterr().out
    assert "stage 'tls': OK handshake + certificate validated" in out
    assert "peer certificate" in out
    assert "not_after=" in out
    # TCP/TLS success must never be presented as proof of ingestion.
    assert "does NOT prove HEC accepted anything" in out


# ---------------------------------------------------------------------------
# 5. Secrets Manager failure is its own outcome, not "unreachable"
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_secret_failure_is_distinct_from_a_network_failure(hec, capsys, monkeypatch, collector):
    instance = collector()
    secrets = _FakeSecrets(error=RuntimeError("AccessDeniedException: not authorized"))
    monkeypatch.setattr(hec, "_boto3_client", secrets)

    assert hec.main(env=_point_at(instance)) == hec.EXIT_SECRET
    out = capsys.readouterr().out
    assert "RESULT: FAILED at stage 'secret'" in out
    assert "NOT a network" in out
    assert instance.posts == [], "no event may be sent without a token"


# ---------------------------------------------------------------------------
# 6. Non-success HTTP response
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_non_success_http_response_is_a_failure(hec, capsys, monkeypatch, collector):
    instance = collector(status=403, body=json.dumps({"text": "Invalid token", "code": 4}))
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())

    assert hec.main(env=_point_at(instance)) == hec.EXIT_RESPONSE
    out = capsys.readouterr().out
    assert "RESULT: FAILED" in out
    assert "http_status=403" in out
    assert "NOT ingested" in out
    assert "RESULT: SUCCESS" not in out
    assert len(instance.posts) == 1, "a rejected event must not be retried"


# ---------------------------------------------------------------------------
# 7. Successful response
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_successful_send_reports_success_and_the_collector_code(hec, capsys, monkeypatch, collector):
    instance = collector(status=200, body=json.dumps({"text": "Success", "code": 0}))
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())

    assert hec.main(env=_point_at(instance)) == hec.EXIT_OK
    out = capsys.readouterr().out
    assert "RESULT: SUCCESS" in out
    assert "http_status=200" in out
    assert "splunk_code=0" in out
    # The success line must still point at Splunk search as the real proof.
    assert "before treating ingestion as proven" in out

    # The event itself: sent to the collector path, minimally identifying, and
    # carrying no environment dump or credential material.
    assert len(instance.posts) == 1
    post = instance.posts[0]
    assert post["path"] == "/services/collector/event"
    event = json.loads(post["body"])
    assert event["sourcetype"] == hec.SOURCETYPE
    assert set(event["event"]) == {"message", "check_id", "application_type"}
    assert "token" not in post["body"].lower()
    assert FAKE_TOKEN not in post["body"]


# ---------------------------------------------------------------------------
# 8. Token redaction
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_token_is_used_but_never_logged(hec, capsys, monkeypatch, collector):
    """The token authenticates the request yet never reaches any output line."""
    # The collector echoes the token back in its body -- a hostile-but-plausible
    # case that proves the response summary is redacted, not merely truncated.
    instance = collector(status=401, body=json.dumps({"text": "bad token %s" % FAKE_TOKEN}))
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())

    hec.main(env=_point_at(instance))
    out = capsys.readouterr().out

    # It really was used for authorization...
    assert instance.posts[0]["authorization"] == "Splunk %s" % FAKE_TOKEN
    # ...and it appears nowhere in the diagnostics.
    assert FAKE_TOKEN not in out
    assert "Splunk %s" % FAKE_TOKEN not in out
    assert "<redacted>" in out
    # Sanitized metadata is still emitted, so the stage stays diagnosable.
    assert "stage 'secret': OK" in out
    assert "value redacted" in out


@pytest.mark.unit
def test_json_secret_payload_is_redacted_too(hec, capsys, monkeypatch, collector):
    """A JSON secret document: the token is extracted and the raw payload scrubbed."""
    payload = json.dumps({"SplunkHECToken": FAKE_TOKEN})
    instance = collector(status=200)
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets(payload=payload))

    assert hec.main(env=_point_at(instance)) == hec.EXIT_OK
    out = capsys.readouterr().out
    assert instance.posts[0]["authorization"] == "Splunk %s" % FAKE_TOKEN
    assert FAKE_TOKEN not in out
    assert payload not in out


@pytest.mark.unit
def test_redact_scrubs_credential_shapes(hec):
    hec.register_secret(FAKE_TOKEN)
    for probe in (
        "Authorization: Splunk %s" % FAKE_TOKEN,
        'token="%s"' % FAKE_TOKEN,
        '{"SecretString": "%s"}' % FAKE_TOKEN,
        "password=hunter2trustno1",
        FAKE_TOKEN,
    ):
        assert FAKE_TOKEN not in hec.redact(probe)
        assert "hunter2trustno1" not in hec.redact(probe)


@pytest.mark.unit
def test_non_uuid_token_is_redacted_by_the_literal_scrub(hec, capsys, monkeypatch, collector):
    """Redaction must not depend on the token happening to look like a UUID.

    HEC tokens are usually UUIDs, so the UUID pattern alone would hide a
    regression in the literal scrub. Use an opaque token echoed back in a body
    with no credential-shaped key in front of it: the pattern rules cannot match
    it, so only the registered-literal scrub can.
    """
    opaque = "hecOpaqueValue1234567890abcdefXYZ"
    instance = collector(status=401, body=json.dumps({"text": "rejected for %s" % opaque}))
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets(payload=opaque))

    hec.main(env=_point_at(instance))
    out = capsys.readouterr().out
    assert instance.posts[0]["authorization"] == "Splunk %s" % opaque
    assert opaque not in out
    assert "<redacted>" in out


@pytest.mark.unit
def test_redaction_keeps_the_arn_readable(hec, capsys, monkeypatch, collector):
    """The ARN is an identifier, not a credential.

    Over-redacting it would hide the single most useful fact when the token
    fetch fails: WHICH secret was attempted. The `secret:` segment inside an ARN
    must therefore survive the credential-shaped scrub.
    """
    assert hec.DEFAULT_SECRET_ARN in hec.redact(hec.DEFAULT_SECRET_ARN, limit=400)

    instance = collector(status=200)
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())
    hec.main(env=_point_at(instance))
    out = capsys.readouterr().out
    assert "C4AppConfigSmahtDevSrceSplunkToken-GJtiE7" in out
    assert "secretsmanager:us-east-1" in out


@pytest.mark.unit
def test_redact_bounds_output(hec):
    assert len(hec.redact("A" * 5000, limit=100)) <= 100 + len("...<truncated>")


# ---------------------------------------------------------------------------
# 9. One event only
# ---------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.parametrize("status", [200, 400, 401, 403, 500, 503])
def test_exactly_one_event_is_ever_sent(hec, monkeypatch, collector, status):
    """No status - success or failure - causes a retry that would duplicate events."""
    instance = collector(status=status)
    monkeypatch.setattr(hec, "_boto3_client", _FakeSecrets())

    hec.main(env=_point_at(instance))
    assert len(instance.posts) == 1, (
        "exactly one POST must reach the collector for HTTP %s; a retry would "
        "multiply test events in Splunk" % status
    )


# ---------------------------------------------------------------------------
# 10. Configuration contract
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_defaults_are_the_expected_endpoint(hec):
    config = hec.load_config({})
    assert config["host"] == "http-inputs.harvardmedfedramp.splunkcloudgc.com"
    assert config["port"] == 443
    assert config["path"] == "/services/collector/event"
    assert config["secret_arn"] == hec.DEFAULT_SECRET_ARN
    assert hec.DEFAULT_SECRET_ARN.endswith("C4AppConfigSmahtDevSrceSplunkToken-GJtiE7")


@pytest.mark.unit
@pytest.mark.parametrize("bad_host", [
    "https://http-inputs.harvardmedfedramp.splunkcloudgc.com",
    "http-inputs.harvardmedfedramp.splunkcloudgc.com/services/collector/event",
    "http-inputs.harvardmedfedramp.splunkcloudgc.com:443",
])
def test_host_field_must_be_a_bare_hostname(hec, bad_host):
    """Scheme, port, and path are separate settings; a pasted URL fails loudly."""
    with pytest.raises(hec.ConfigError):
        hec.load_config({"SPLUNK_HEC_HOST": bad_host})


@pytest.mark.unit
def test_bad_config_fails_before_any_network_use(hec, capsys, monkeypatch):
    monkeypatch.setattr(hec, "_getaddrinfo", lambda *a, **k: pytest.fail("resolved"))
    rc = hec.main(env=_env(SPLUNK_HEC_HOST="https://example.invalid"))
    assert rc == hec.EXIT_CONFIG
    assert "RESULT: FAILED at stage 'config'" in capsys.readouterr().out


@pytest.mark.unit
@pytest.mark.parametrize("raw,expected", [("0.01", 1.0), ("900", 15.0), ("4", 4.0)])
def test_timeouts_are_clamped(hec, raw, expected):
    """Timeouts stay bounded so a probe can never hang a deployment task."""
    assert hec.load_config({"SPLUNK_HEC_TIMEOUT_SECONDS": raw})["timeout"] == expected


@pytest.mark.unit
def test_region_is_derived_from_the_arn(hec):
    assert hec._region_from_arn(hec.DEFAULT_SECRET_ARN) == "us-east-1"
