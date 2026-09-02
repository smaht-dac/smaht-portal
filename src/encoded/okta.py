"""Okta (OpenID Connect) support for the SMaHT portal.

The browser is treated as a *public* SPA: it runs Authorization Code + PKCE
against Okta and never sees a client secret. This module owns the two halves
of that contract that must live on the server:

1. The public configuration the SPA needs (`/okta_config`) - issuer, client ID,
   redirect URI, scopes. Deliberately narrow, and asserted secret-free.
2. Verification of the Okta-issued ID token the SPA presents to `/login`
   (signature via the issuer's JWKS, plus `iss`/`aud`/`exp`/claim checks).

The portal session contract itself is unchanged: the SPA POSTs the ID token to
`/login`, snovault stores it as the httpOnly `jwtToken` cookie, and every later
request is authenticated by decoding that cookie. See
`encoded.authentication.SMAHTAuth0AuthenticationPolicy`, which routes tokens to
`decode_okta_id_token` here.
"""

import os
import threading

import jwt
import requests
import structlog
from pyramid.httpexceptions import HTTPForbidden
from pyramid.security import NO_PERMISSION_REQUIRED
from pyramid.view import view_config
from snovault.util import debug_log


log = structlog.getLogger(__name__)


# Okta signs ID tokens asymmetrically. Restricting the accepted algorithm set to
# RS256 is what makes an "alg confusion" downgrade impossible on this path: a
# symmetrically signed token (e.g. the HS256 tokens snovault mints for user
# impersonation) can never be verified here, and is instead routed to the legacy
# policy by `encoded.authentication`.
OKTA_ID_TOKEN_ALGORITHMS = ["RS256"]

# Claims an Okta ID token must carry for us to consider it usable. `email` is
# required because the portal's whole notion of identity is the email address.
OKTA_REQUIRED_CLAIMS = ["iss", "aud", "exp", "iat", "sub", "email"]

# Clock drift allowance, matching snovault's Auth0 path.
OKTA_LEEWAY_SECONDS = 30

# Path the Okta redirect lands on. It is served as an ordinary portal page so
# the React SPA can complete the PKCE exchange; it is intentionally NOT
# snovault's `/callback`, which is the confidential (client-secret, Redis)
# server-side exchange used by the Auth0/RAS flow.
OKTA_CALLBACK_PATH = "/okta/callback"
OKTA_CONFIG_PATH = "/okta_config"

DEFAULT_OKTA_SCOPES = "openid email profile"

# Any setting or config key whose name looks like this must never reach the
# browser. `assert_no_client_secret` enforces it on the way out.
SECRET_LIKE_KEY_FRAGMENTS = ("secret", "password", "private", "credential")

_JWKS_CLIENT_REGISTRY_KEY = "encoded.okta.jwks_client"
_JWKS_CLIENT_LOCK = threading.Lock()


class OktaConfigurationError(Exception):
    """Raised when Okta settings are missing or malformed.

    Raised eagerly, with a message naming the offending setting, rather than
    letting a half-configured client be constructed and fail obscurely later.
    """


def _clean(value):
    return value.strip() if isinstance(value, str) else value


def set_okta_config(settings):
    """Resolve the `okta.*` settings.

    Precedence is ini file, then the AWS Secrets Manager identity (when
    `IDENTITY` is set, mirroring `set_ga4_config`), then the process
    environment. Okta values are deliberately NOT added to
    `deploy/docker/production/smaht_any_alpha.ini`: that template is expanded by
    dcicutils against a fixed variable set, so an unrecognized `${OKTA_*}`
    placeholder would break the build of `production.ini`.
    """
    identity = {}
    if "IDENTITY" in os.environ:
        from dcicutils.secrets_utils import assume_identity
        try:
            identity = assume_identity() or {}
        except Exception as e:  # noqa: BLE001 - startup must not hard-fail on this
            log.warning("Could not read identity for Okta configuration", error=str(e))
            identity = {}

    def resolve(setting_key, identity_key, default=""):
        configured = _clean(settings.get(setting_key))
        if configured:
            return configured
        return _clean(identity.get(identity_key)) or _clean(os.environ.get(identity_key)) or default

    settings["okta.issuer"] = resolve("okta.issuer", "OKTA_ISSUER")
    settings["okta.client"] = resolve("okta.client", "OKTA_CLIENT")
    settings["okta.scopes"] = resolve("okta.scopes", "OKTA_SCOPES", DEFAULT_OKTA_SCOPES)
    # An Okta org may or may not mark provider-sourced emails as verified. Kept
    # as an explicit, documented setting rather than a silent assumption.
    settings["okta.require_email_verified"] = _as_bool(
        resolve("okta.require_email_verified", "OKTA_REQUIRE_EMAIL_VERIFIED", "true")
    )
    return settings


def _as_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def okta_is_configured(settings):
    """True when enough Okta settings are present to attempt the Okta path."""
    return bool(_clean(settings.get("okta.issuer")) and _clean(settings.get("okta.client")))


def validate_okta_settings(settings):
    """Return validated `(issuer, client_id, scopes)` or raise OktaConfigurationError."""
    issuer = _clean(settings.get("okta.issuer")) or ""
    client_id = _clean(settings.get("okta.client")) or ""
    scopes = _clean(settings.get("okta.scopes")) or DEFAULT_OKTA_SCOPES

    if not issuer:
        raise OktaConfigurationError("okta.issuer is not configured")
    if not issuer.startswith("https://"):
        raise OktaConfigurationError(f"okta.issuer must be an https URL, got {issuer!r}")
    if issuer.endswith("/"):
        # Okta's own `iss` claim never has a trailing slash; keeping one here would
        # make every issuer comparison fail with a confusing signature-looking error.
        raise OktaConfigurationError(f"okta.issuer must not end with '/', got {issuer!r}")
    if not client_id:
        raise OktaConfigurationError("okta.client is not configured")

    scope_list = [s for s in scopes.replace(",", " ").split() if s]
    if "openid" not in scope_list:
        raise OktaConfigurationError(f"okta.scopes must include 'openid', got {scopes!r}")
    if "email" not in scope_list:
        # The portal identifies users by email; without the claim, login cannot complete.
        raise OktaConfigurationError(f"okta.scopes must include 'email', got {scopes!r}")

    return issuer, client_id, scope_list


def assert_no_client_secret(config):
    """Guard the browser-bound config against ever carrying a secret.

    This is a boundary assertion, not defense against a specific bug: it makes a
    future edit that adds a secret-shaped key to the echoed dict fail loudly
    here instead of quietly shipping it in a page response.
    """
    for key in config:
        lowered = str(key).lower()
        if any(fragment in lowered for fragment in SECRET_LIKE_KEY_FRAGMENTS):
            raise OktaConfigurationError(
                f"Refusing to expose secret-like key {key!r} to the browser"
            )
    return config


def okta_public_config(settings, host_url):
    """Build the public SPA configuration for the given request host.

    The redirect and post-logout URIs are derived from the request host rather
    than configured per environment, so a new deployment only needs its URIs
    registered in Okta (see docs/operations/okta_authentication.md).
    """
    issuer, client_id, scope_list = validate_okta_settings(settings)
    host_url = (host_url or "").rstrip("/")
    if not host_url:
        raise OktaConfigurationError("Cannot build Okta redirect URI without a host URL")
    return assert_no_client_secret({
        "issuer": issuer,
        "clientId": client_id,
        "redirectUri": f"{host_url}{OKTA_CALLBACK_PATH}",
        "postLogoutRedirectUri": f"{host_url}/",
        "scopes": scope_list,
    })


def resolve_okta_jwks_uri(settings):
    """Resolve the issuer's JWKS URI, preferring OIDC discovery.

    The JWKS path is not a fixed suffix of the issuer: Okta's org authorization
    server issues as `https://ORG.okta.com` but publishes keys at
    `/oauth2/v1/keys`, while a custom authorization server issues as
    `https://ORG.okta.com/oauth2/default` and publishes at
    `<issuer>/v1/keys`. Discovery is authoritative for both, so we read
    `jwks_uri` from the issuer's OpenID configuration instead of guessing.
    `okta.jwks_uri` overrides it for environments that cannot reach discovery.
    """
    issuer, _client_id, _scopes = validate_okta_settings(settings)
    configured = _clean(settings.get("okta.jwks_uri"))
    if configured:
        return configured
    discovery_url = f"{issuer}/.well-known/openid-configuration"
    response = requests.get(discovery_url, timeout=10)
    response.raise_for_status()
    document = response.json()
    discovered_issuer = document.get("issuer")
    if discovered_issuer != issuer:
        # A discovery document that disagrees about its own issuer cannot be
        # used to decide which keys are authoritative for our expected issuer.
        raise OktaConfigurationError(
            f"Okta discovery at {discovery_url} reports issuer {discovered_issuer!r},"
            f" expected {issuer!r}"
        )
    jwks_uri = document.get("jwks_uri")
    if not jwks_uri:
        raise OktaConfigurationError(f"Okta discovery at {discovery_url} has no jwks_uri")
    return jwks_uri


def get_okta_jwks_client(registry):
    """Return a process-wide cached PyJWKClient for the configured issuer.

    The authentication policy runs on every request, so neither discovery nor
    the JWKS itself may be re-fetched per request; the client is built once and
    PyJWKClient caches signing keys internally.
    """
    existing = registry.get(_JWKS_CLIENT_REGISTRY_KEY)
    if existing is not None:
        return existing
    with _JWKS_CLIENT_LOCK:
        existing = registry.get(_JWKS_CLIENT_REGISTRY_KEY)
        if existing is not None:
            return existing
        client = jwt.PyJWKClient(resolve_okta_jwks_uri(registry.settings), cache_keys=True)
        registry[_JWKS_CLIENT_REGISTRY_KEY] = client
        return client


def token_is_asymmetrically_signed(token):
    """True when the token's own header names an algorithm we verify via JWKS.

    Read from the *unverified* header purely to pick a verification path; the
    algorithm actually accepted is pinned to OKTA_ID_TOKEN_ALGORITHMS below, so
    a caller cannot use this to choose a weaker check.
    """
    try:
        header = jwt.get_unverified_header(token)
    except Exception:  # noqa: BLE001 - a malformed token is simply not ours
        return False
    return header.get("alg") in OKTA_ID_TOKEN_ALGORITHMS


def decode_okta_id_token(token, registry):
    """Fully verify an Okta ID token and return its claims, or None.

    Verification covers signature (via the issuer's JWKS), `iss`, `aud`
    (the SPA client ID, which is what Okta puts in an ID token's audience),
    expiry, and the presence of the claims the portal depends on.
    """
    settings = registry.settings
    issuer, client_id, _scopes = validate_okta_settings(settings)
    signing_key = get_okta_jwks_client(registry).get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=OKTA_ID_TOKEN_ALGORITHMS,
        audience=client_id,
        issuer=issuer,
        leeway=OKTA_LEEWAY_SECONDS,
        options={"require": OKTA_REQUIRED_CLAIMS, "verify_signature": True},
    )
    email = payload.get("email")
    if not isinstance(email, str) or not email.strip():
        # snovault's caller does `jwt_info['email'].lower()`, so refuse here
        # rather than letting a missing claim surface as a 500.
        raise jwt.exceptions.InvalidTokenError("Okta ID token has no usable email claim")
    if settings.get("okta.require_email_verified", True) and not payload.get("email_verified"):
        raise jwt.exceptions.InvalidTokenError(
            "Okta ID token email is not verified (set okta.require_email_verified = false "
            "only if the Okta org intentionally does not assert this claim)"
        )
    return payload


def includeme(config):
    config.add_route("okta-config", OKTA_CONFIG_PATH)
    config.add_route("okta-login-callback", OKTA_CALLBACK_PATH)
    config.scan(__name__)


@view_config(route_name="okta-config", request_method="GET", permission=NO_PERMISSION_REQUIRED)
@debug_log
def okta_config_view(context, request):
    """Public Okta SPA configuration. Never carries a client secret."""
    del context
    try:
        return okta_public_config(request.registry.settings, request.host_url)
    except OktaConfigurationError as e:
        # A clear, developer-facing failure beats handing the SPA a config it
        # would silently build a broken client from.
        log.warning("Okta is not configured for this environment", error=str(e))
        raise HTTPForbidden(title=f"Okta is not configured: {e}")


@view_config(route_name="okta-login-callback", request_method="GET",
             permission=NO_PERMISSION_REQUIRED, http_cache=0)
@debug_log
def okta_login_callback_view(context, request):
    """Serve the SPA page that completes the PKCE exchange in the browser.

    The authorization code and PKCE verifier are handled entirely client-side by
    the Okta SDK, so this view intentionally does not read the query string.
    """
    del context, request
    return {
        "@id": OKTA_CALLBACK_PATH,
        "@context": OKTA_CALLBACK_PATH,
        "@type": ["OktaLoginCallback", "Portal"],
        "title": "Signing in",
    }
