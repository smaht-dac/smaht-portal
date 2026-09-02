"""Okta configuration and ID-token verification.

Deliberately fixture-free: an RSA keypair is generated in-process, tokens are
signed with it, and the JWKS lookup is stubbed. That keeps the whole
verification contract - issuer, audience, algorithm, expiry, claims - testable
without PostgreSQL/OpenSearch, and makes the negative cases (wrong issuer,
wrong audience, algorithm swap) exact rather than approximate.
"""

import datetime
import json

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from pyramid.httpexceptions import HTTPForbidden, HTTPUnauthorized
from unittest.mock import MagicMock, patch

from ..okta import (
    OKTA_CALLBACK_PATH,
    OKTA_ID_TOKEN_ALGORITHMS,
    OktaConfigurationError,
    assert_no_client_secret,
    decode_okta_id_token,
    okta_config_view,
    okta_is_configured,
    okta_login_callback_view,
    okta_public_config,
    resolve_okta_jwks_uri,
    set_okta_config,
    token_is_asymmetrically_signed,
    validate_okta_settings,
)


pytestmark = [pytest.mark.setone, pytest.mark.working]


# Synthetic values only - not a real Okta tenant.
ISSUER = "https://example.okta.com/oauth2/default"
CLIENT_ID = "0oa1example2client3id"
JWKS_URI = f"{ISSUER}/v1/keys"
KEY_ID = "test-key-1"
LEGACY_SECRET = "legacy-shared-secret-long-enough-for-hs256"


@pytest.fixture(scope="module")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def okta_settings():
    return {
        "okta.issuer": ISSUER,
        "okta.client": CLIENT_ID,
        "okta.scopes": "openid email profile",
        "okta.jwks_uri": JWKS_URI,
        "okta.require_email_verified": True,
        "auth0.client": CLIENT_ID,
        "auth0.secret": LEGACY_SECRET,
    }


class Registry(dict):
    """A dict-like stand-in for the Pyramid registry, which is itself dict-like."""

    def __init__(self, settings):
        super().__init__()
        self.settings = settings


def make_registry(settings):
    return Registry(settings)


def sign_id_token(rsa_key, claims=None, algorithm="RS256", key=None, headers=None):
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "sub": "00uexamplesubject",
        "email": "someone@example.org",
        "email_verified": True,
        "iat": int(now.timestamp()),
        "exp": int((now + datetime.timedelta(minutes=10)).timestamp()),
    }
    if claims:
        payload.update(claims)
        for claim, value in list(claims.items()):
            if value is None:
                payload.pop(claim, None)
    signing_key = key if key is not None else rsa_key
    return jwt.encode(
        payload, signing_key, algorithm=algorithm, headers=headers or {"kid": KEY_ID}
    )


def decode_with_stubbed_jwks(token, rsa_key, settings):
    """Run `decode_okta_id_token` with the JWKS lookup replaced by `rsa_key`."""
    registry = make_registry(settings)
    signing_key = MagicMock()
    signing_key.key = rsa_key.public_key()
    jwks_client = MagicMock()
    jwks_client.get_signing_key_from_jwt.return_value = signing_key
    with patch("encoded.okta.get_okta_jwks_client", return_value=jwks_client):
        return decode_okta_id_token(token, registry)


class TestSettings:

    def test_configured_only_when_issuer_and_client_present(self):
        assert okta_is_configured({"okta.issuer": ISSUER, "okta.client": CLIENT_ID})
        assert not okta_is_configured({"okta.issuer": ISSUER})
        assert not okta_is_configured({"okta.client": CLIENT_ID})
        assert not okta_is_configured({})
        # Whitespace-only values must not read as configured.
        assert not okta_is_configured({"okta.issuer": "  ", "okta.client": CLIENT_ID})

    def test_ini_settings_win_over_environment(self, monkeypatch):
        monkeypatch.setenv("OKTA_ISSUER", "https://other.okta.com")
        monkeypatch.setenv("OKTA_CLIENT", "from-env")
        settings = set_okta_config({"okta.issuer": ISSUER, "okta.client": CLIENT_ID})
        assert settings["okta.issuer"] == ISSUER
        assert settings["okta.client"] == CLIENT_ID

    def test_environment_used_when_ini_is_silent(self, monkeypatch):
        monkeypatch.delenv("IDENTITY", raising=False)
        monkeypatch.setenv("OKTA_ISSUER", ISSUER)
        monkeypatch.setenv("OKTA_CLIENT", CLIENT_ID)
        settings = set_okta_config({})
        assert settings["okta.issuer"] == ISSUER
        assert settings["okta.client"] == CLIENT_ID
        assert settings["okta.scopes"] == "openid email profile"
        assert settings["okta.require_email_verified"] is True

    def test_absent_configuration_is_simply_not_configured(self, monkeypatch):
        for name in ("IDENTITY", "OKTA_ISSUER", "OKTA_CLIENT", "OKTA_SCOPES"):
            monkeypatch.delenv(name, raising=False)
        settings = set_okta_config({})
        assert not okta_is_configured(settings)

    @pytest.mark.parametrize("value,expected", [
        ("true", True), ("True", True), ("1", True), ("yes", True),
        ("false", False), ("0", False), ("no", False), ("", True),
    ])
    def test_require_email_verified_parsing(self, monkeypatch, value, expected):
        monkeypatch.delenv("IDENTITY", raising=False)
        settings = set_okta_config({"okta.require_email_verified": value})
        assert settings["okta.require_email_verified"] is expected


class TestValidation:

    def test_valid_settings(self, okta_settings):
        issuer, client_id, scopes = validate_okta_settings(okta_settings)
        assert issuer == ISSUER
        assert client_id == CLIENT_ID
        assert scopes == ["openid", "email", "profile"]

    @pytest.mark.parametrize("key,value,expected_message", [
        ("okta.issuer", "", "okta.issuer is not configured"),
        ("okta.issuer", "http://example.okta.com", "must be an https URL"),
        ("okta.issuer", ISSUER + "/", "must not end with"),
        ("okta.client", "", "okta.client is not configured"),
        ("okta.scopes", "email profile", "must include 'openid'"),
        ("okta.scopes", "openid profile", "must include 'email'"),
    ])
    def test_malformed_settings_raise_a_named_error(self, okta_settings, key, value,
                                                    expected_message):
        okta_settings[key] = value
        with pytest.raises(OktaConfigurationError) as excinfo:
            validate_okta_settings(okta_settings)
        assert expected_message in str(excinfo.value)


class TestPublicConfig:

    def test_shape(self, okta_settings):
        config = okta_public_config(okta_settings, "https://portal.example.org")
        assert config == {
            "issuer": ISSUER,
            "clientId": CLIENT_ID,
            "redirectUri": f"https://portal.example.org{OKTA_CALLBACK_PATH}",
            "postLogoutRedirectUri": "https://portal.example.org/",
            "scopes": ["openid", "email", "profile"],
        }

    def test_no_secret_reaches_the_browser(self, okta_settings):
        """The public config must never carry the legacy Auth0 secret or any other."""
        config = okta_public_config(okta_settings, "https://portal.example.org")
        serialized = json.dumps(config)
        assert LEGACY_SECRET not in serialized
        for key in config:
            assert "secret" not in key.lower()

    @pytest.mark.parametrize("key", [
        "clientSecret", "client_secret", "oktaSecret", "password", "privateKey",
        "credentials",
    ])
    def test_secret_like_keys_are_refused(self, key):
        with pytest.raises(OktaConfigurationError) as excinfo:
            assert_no_client_secret({"issuer": ISSUER, key: "nope"})
        assert "secret-like" in str(excinfo.value)

    def test_requires_a_host_url_to_build_a_redirect_uri(self, okta_settings):
        with pytest.raises(OktaConfigurationError):
            okta_public_config(okta_settings, "")

    def test_view_returns_the_config(self, okta_settings):
        request = MagicMock()
        request.registry.settings = okta_settings
        request.host_url = "https://portal.example.org"
        result = okta_config_view.__wrapped__(None, request)
        assert result["clientId"] == CLIENT_ID

    def test_view_fails_clearly_when_unconfigured(self):
        request = MagicMock()
        request.registry.settings = {}
        request.host_url = "https://portal.example.org"
        with pytest.raises(HTTPForbidden) as excinfo:
            okta_config_view.__wrapped__(None, request)
        assert "Okta is not configured" in excinfo.value.title


class TestJwksUriResolution:

    def test_explicit_setting_short_circuits_discovery(self, okta_settings):
        with patch("encoded.okta.requests.get") as mocked:
            assert resolve_okta_jwks_uri(okta_settings) == JWKS_URI
            mocked.assert_not_called()

    def test_discovery_is_authoritative(self, okta_settings):
        """The JWKS path is not a fixed suffix of the issuer, so it is discovered."""
        okta_settings.pop("okta.jwks_uri")
        response = MagicMock()
        response.json.return_value = {
            "issuer": ISSUER,
            "jwks_uri": "https://example.okta.com/oauth2/v1/keys",
        }
        with patch("encoded.okta.requests.get", return_value=response):
            assert resolve_okta_jwks_uri(okta_settings) == (
                "https://example.okta.com/oauth2/v1/keys"
            )

    def test_discovery_disagreeing_about_its_issuer_is_refused(self, okta_settings):
        okta_settings.pop("okta.jwks_uri")
        response = MagicMock()
        response.json.return_value = {
            "issuer": "https://attacker.example.com",
            "jwks_uri": "https://attacker.example.com/v1/keys",
        }
        with patch("encoded.okta.requests.get", return_value=response):
            with pytest.raises(OktaConfigurationError) as excinfo:
                resolve_okta_jwks_uri(okta_settings)
        assert "reports issuer" in str(excinfo.value)

    def test_discovery_without_a_jwks_uri_is_refused(self, okta_settings):
        okta_settings.pop("okta.jwks_uri")
        response = MagicMock()
        response.json.return_value = {"issuer": ISSUER}
        with patch("encoded.okta.requests.get", return_value=response):
            with pytest.raises(OktaConfigurationError):
                resolve_okta_jwks_uri(okta_settings)


class TestTokenRouting:

    def test_rs256_tokens_take_the_okta_path(self, rsa_key):
        assert token_is_asymmetrically_signed(sign_id_token(rsa_key))

    def test_hs256_tokens_do_not(self):
        token = jwt.encode({"email": "x@example.org"}, LEGACY_SECRET, algorithm="HS256")
        assert not token_is_asymmetrically_signed(token)

    @pytest.mark.parametrize("token", ["", "not-a-token", "a.b", None, 123])
    def test_garbage_is_not_routed_to_okta(self, token):
        assert not token_is_asymmetrically_signed(token)

    def test_only_rs256_is_accepted_on_the_okta_path(self):
        assert OKTA_ID_TOKEN_ALGORITHMS == ["RS256"]


class TestTokenVerification:

    def test_accepts_a_correctly_signed_token(self, rsa_key, okta_settings):
        payload = decode_with_stubbed_jwks(sign_id_token(rsa_key), rsa_key, okta_settings)
        assert payload["email"] == "someone@example.org"
        assert payload["iss"] == ISSUER
        assert payload["aud"] == CLIENT_ID

    def test_rejects_a_token_signed_by_a_different_key(self, rsa_key, okta_settings):
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        token = sign_id_token(rsa_key, key=other_key)
        with pytest.raises(jwt.exceptions.InvalidSignatureError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_a_wrong_issuer(self, rsa_key, okta_settings):
        token = sign_id_token(rsa_key, {"iss": "https://attacker.example.com"})
        with pytest.raises(jwt.exceptions.InvalidIssuerError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_a_wrong_audience(self, rsa_key, okta_settings):
        token = sign_id_token(rsa_key, {"aud": "some-other-client"})
        with pytest.raises(jwt.exceptions.InvalidAudienceError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_an_expired_token(self, rsa_key, okta_settings):
        now = datetime.datetime.now(datetime.timezone.utc)
        token = sign_id_token(rsa_key, {
            "iat": int((now - datetime.timedelta(hours=2)).timestamp()),
            "exp": int((now - datetime.timedelta(hours=1)).timestamp()),
        })
        with pytest.raises(jwt.exceptions.ExpiredSignatureError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_an_unsigned_token(self, rsa_key, okta_settings):
        """An `alg: none` token must never be accepted (CWE-347)."""
        token = jwt.encode(
            {"iss": ISSUER, "aud": CLIENT_ID, "email": "x@example.org"},
            None, algorithm="none",
        )
        with pytest.raises(jwt.exceptions.PyJWTError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_a_symmetrically_signed_token_on_the_okta_path(self, rsa_key,
                                                                   okta_settings):
        """Algorithm confusion: an HS256 token cannot be verified here."""
        token = jwt.encode(
            {"iss": ISSUER, "aud": CLIENT_ID, "email": "x@example.org",
             "sub": "s", "iat": 0, "exp": 9999999999},
            LEGACY_SECRET, algorithm="HS256",
        )
        with pytest.raises(jwt.exceptions.PyJWTError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    @pytest.mark.parametrize("missing", ["sub", "iat", "exp"])
    def test_rejects_a_token_missing_a_required_claim(self, rsa_key, okta_settings,
                                                      missing):
        token = sign_id_token(rsa_key, {missing: None})
        with pytest.raises(jwt.exceptions.MissingRequiredClaimError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_a_token_with_no_email(self, rsa_key, okta_settings):
        token = sign_id_token(rsa_key, {"email": None})
        with pytest.raises(jwt.exceptions.MissingRequiredClaimError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_a_blank_email(self, rsa_key, okta_settings):
        """A blank claim would otherwise reach snovault's `jwt_info['email'].lower()`."""
        token = sign_id_token(rsa_key, {"email": "   "})
        with pytest.raises(jwt.exceptions.InvalidTokenError):
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)

    def test_rejects_an_unverified_email_by_default(self, rsa_key, okta_settings):
        token = sign_id_token(rsa_key, {"email_verified": False})
        with pytest.raises(jwt.exceptions.InvalidTokenError) as excinfo:
            decode_with_stubbed_jwks(token, rsa_key, okta_settings)
        assert "not verified" in str(excinfo.value)

    def test_accepts_an_unverified_email_when_explicitly_allowed(self, rsa_key,
                                                                 okta_settings):
        okta_settings["okta.require_email_verified"] = False
        token = sign_id_token(rsa_key, {"email_verified": False})
        payload = decode_with_stubbed_jwks(token, rsa_key, okta_settings)
        assert payload["email"] == "someone@example.org"

    def test_tolerates_small_clock_drift(self, rsa_key, okta_settings):
        now = datetime.datetime.now(datetime.timezone.utc)
        token = sign_id_token(rsa_key, {
            "exp": int((now - datetime.timedelta(seconds=10)).timestamp()),
        })
        payload = decode_with_stubbed_jwks(token, rsa_key, okta_settings)
        assert payload["email"] == "someone@example.org"


class TestCallbackView:

    def test_returns_a_page_context_the_spa_renders(self):
        result = okta_login_callback_view.__wrapped__(None, MagicMock())
        assert result["@id"] == OKTA_CALLBACK_PATH
        assert "OktaLoginCallback" in result["@type"]

    def test_does_not_read_the_authorization_code(self):
        """The code is exchanged in the browser with PKCE; the server never sees it."""
        request = MagicMock()
        okta_login_callback_view.__wrapped__(None, request)
        request.params.get.assert_not_called()


class TestRoutes:
    """Router-level checks with a bare Configurator, so no fixture stack is needed."""

    @staticmethod
    def make_app(settings):
        from pyramid.config import Configurator
        from webtest import TestApp
        config = Configurator(settings=dict(settings))
        config.include("snovault.json_renderer")
        config.include("encoded.okta")
        return TestApp(config.make_wsgi_app())

    def test_config_route_serves_the_public_config(self, okta_settings):
        app = self.make_app(okta_settings)
        body = app.get("/okta_config").json
        assert body["issuer"] == ISSUER
        assert body["clientId"] == CLIENT_ID
        assert body["redirectUri"].endswith(OKTA_CALLBACK_PATH)

    def test_config_route_never_serves_a_secret(self, okta_settings):
        app = self.make_app(okta_settings)
        response = app.get("/okta_config")
        assert LEGACY_SECRET not in response.text
        assert not any("secret" in key.lower() for key in response.json)

    def test_config_route_refuses_clearly_when_unconfigured(self):
        app = self.make_app({})
        app.get("/okta_config", status=403)

    def test_callback_route_serves_the_spa_page(self, okta_settings):
        app = self.make_app(okta_settings)
        body = app.get("/okta/callback?code=abc&state=xyz").json
        assert body["@type"] == ["OktaLoginCallback", "Portal"]


class TestCanonicalRedirect:
    """The callback's query string must survive the HTML render of the page.

    Snovault redirects to a context's `@id` when the request path disagrees with
    it, so a callback page whose `@id` dropped `?code=…&state=…` would send the
    browser to a query-less URL and the SDK would find no authorization code -
    a failure that only appears for `Accept: text/html` requests in the real app.
    """

    @staticmethod
    def run_subscriber(path_info, query_string, rendering_val):
        from pyramid.events import BeforeRender
        from pyramid.testing import DummyRequest
        from snovault.renderers import canonical_redirect
        request = DummyRequest(path=path_info)
        request.path_info = path_info
        request.query_string = query_string
        request.method = "GET"
        request.environ["QUERY_STRING"] = query_string
        request.response.status_int = 200
        canonical_redirect(BeforeRender({"request": request}, rendering_val))

    def test_callback_with_pkce_parameters_is_not_redirected(self):
        context = okta_login_callback_view.__wrapped__(None, MagicMock())
        # Raises HTTPMovedPermanently if the query string would be dropped.
        self.run_subscriber(OKTA_CALLBACK_PATH, "code=abc&state=xyz", context)

    def test_callback_without_parameters_is_not_redirected(self):
        context = okta_login_callback_view.__wrapped__(None, MagicMock())
        self.run_subscriber(OKTA_CALLBACK_PATH, "", context)

    def test_the_subscriber_would_have_caught_a_mismatched_id(self):
        """Guards the test itself: a wrong `@id` really does trigger a redirect."""
        from pyramid.httpexceptions import HTTPMovedPermanently
        with pytest.raises(HTTPMovedPermanently):
            self.run_subscriber(
                OKTA_CALLBACK_PATH, "code=abc", {"@id": "/somewhere/else"}
            )
