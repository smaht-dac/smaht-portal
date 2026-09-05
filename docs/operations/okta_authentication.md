# Okta login (Authorization Code with PKCE)

Portal login is an Okta OpenID Connect redirect flow run by the React SPA. All
values below are **synthetic examples**; substitute your own tenant's.

## The flow

1. The browser fetches `GET /okta_config` (public: issuer, client ID, redirect
   URI, post-logout URI, scopes — never a secret).
2. Clicking **Login / Register** calls `signInWithRedirect()`, which sends the
   browser to Okta with a PKCE `code_challenge`, `state`, and `nonce`.
3. Okta redirects back to `{origin}/okta/callback`. That path is served as an
   ordinary portal page whose React view completes the code→token exchange
   **in the browser** using the PKCE verifier. The server never sees the code.
4. The SPA POSTs the resulting **ID token** to `/login`, which stores it as the
   httpOnly `jwtToken` cookie; `/session-properties` then reports the in-system
   user. This is the portal's pre-existing session contract, unchanged.
5. Every later request is authenticated by verifying that cookie against the
   issuer's JWKS (see *Token verification* below).

The browser is a **public** client: there is no client secret in the React
source, in `/okta_config`, in the bundle, or in this repository.

### Logout and browser SDK lifetime

Logout deletes the portal cookie first, then calls Okta `signOut` with
`clearTokensBeforeRedirect: true`. This preserves the ID-token logout hint while
removing local tokens before navigation. Homepage restoration also rejects and
clears `pendingRemove` tokens left by an older page; it must never exchange them
for a new portal cookie.

Constructing the shared browser client does not start background SDK services.
The callback page's `OktaCallbackSecurity` boundary owns that lifetime: its nested
Okta `Security` starts services, and the boundary stops them on exit or when a
portal-session error replaces the callback.
Ordinary navigation uses token storage directly, so logout safety does not depend
on a later `tokenManager.start()` clearing pending tokens.

## Registering the application in Okta

Create an **OIDC → Single-Page Application** with:

| Setting | Value |
| --- | --- |
| Grant types | Authorization Code, Refresh Token (optional) |
| Sign-in redirect URIs | `https://<portal-host>/okta/callback` |
| Sign-out redirect URIs | `https://<portal-host>/` |
| Scopes | `openid`, `email`, `profile` |
| Client authentication | **None** (PKCE required) |

One redirect and one sign-out URI is needed **per origin** the portal is served
from, including `http://localhost:8000` for local development. A missing
redirect URI shows up as an Okta error page before the portal is ever reached;
a missing sign-out URI makes logout fail at the Okta redirect (the portal
session is still cleared first — see `OktaLogoutController`).

The Okta org must mark the email claim as verified, or set
`okta.require_email_verified = false` explicitly (see below).

## Configuration

`encoded.okta.set_okta_config` reads these from the application settings — the
ini file the process was started with — and from nothing else. There is no
Secrets Manager or process-environment lookup at runtime.

| Setting | Template placeholder | Identity key | Required | Notes |
| --- | --- | --- | --- | --- |
| `okta.issuer` | `${OKTA_ISSUER}` | `ENCODED_OKTA_ISSUER` | yes | `https://…`, **no** trailing slash |
| `okta.client` | `${OKTA_CLIENT}` | `ENCODED_OKTA_CLIENT` | yes | public SPA client ID |
| `okta.scopes` | `${OKTA_SCOPES}` | `ENCODED_OKTA_SCOPES` | no | default `openid email profile`; must include `openid` and `email` |
| `okta.require_email_verified` | `${OKTA_REQUIRE_EMAIL_VERIFIED}` | `ENCODED_OKTA_REQUIRE_EMAIL_VERIFIED` | no | default `true` |
| `okta.jwks_uri` | — | — | no | overrides OIDC discovery |

There is deliberately **no** Okta client secret: the browser is a public client
running Authorization Code with PKCE, so there is nothing to configure or leak.

Example (synthetic) for `development.ini`:

```ini
okta.issuer = https://example.okta.com/oauth2/default
okta.client = 0oa1example2client3id
okta.scopes = openid email profile
```

### How the container gets them

`deploy/docker/production/smaht_any_alpha.ini` carries the four `${OKTA_*}`
placeholders above. Every production entrypoint runs `python -m assume_identity`
exactly once before serving, which reads the AWS Secrets Manager identity named
by `IDENTITY` and expands the template into `production.ini`. `dcicutils`
8.19.0.1b1 is the first release that binds these four substitutions, hence the
exact pin in `pyproject.toml`.

`ENCODED_OKTA_REQUIRE_EMAIL_VERIFIED` is the one with a subtlety: `dcicutils`
expands it to `true`/`false` only when the identity actually supplies a boolean,
and to the empty string otherwise. An empty expansion makes `dcicutils` drop the
whole `okta.require_email_verified = …` line from the generated `production.ini`,
so the portal falls back to its own default of requiring a verified email. An
absent, blank, or unparseable value therefore cannot turn the check off.

With `okta.issuer` or `okta.client` absent, Okta is simply "not configured":
`/okta_config` returns 403, the login button renders disabled as
*Login Unavailable*, and the legacy Auth0/RAS path is untouched.

`/okta_config` derives `redirectUri` from `request.host_url`, so behind the load
balancer the scheme must be correct or Okta rejects the URI as unregistered.
That comes from the `egg:PasteDeploy#prefix` middleware in the `[pipeline:main]`
section honouring `X-Forwarded-Proto` — the same mechanism snovault's `/login`
already relies on for its `secure` cookie flag.

## Token verification

`SMAHTAuth0AuthenticationPolicy.get_token_info` routes on the token's own `alg`
header and the two families never cross:

* **RS256** → `encoded.okta.decode_okta_id_token`: signature checked against
  the issuer's JWKS (URI from OIDC discovery, cached per process), plus `iss`,
  `aud` (the SPA client ID), `exp`/`iat` with 30s leeway, and the required
  claims `iss aud exp iat sub email`. Accepted algorithms are pinned to
  `["RS256"]`.
* **HS256** → snovault's existing shared-secret verification, unchanged. This
  is what the legacy Auth0/RAS flow and the admin *impersonate user* feature
  use.

Because the Okta path accepts only RS256 and the legacy path keeps the shared
secret as its key, an algorithm-confusion downgrade has nowhere to land. An
asymmetrically signed token arriving at an environment with no Okta issuer is
refused rather than passed to the shared-secret decode.

`base.ini` names `encoded.authentication.SMAHTAuth0AuthenticationPolicy` (it
previously named the snovault base class, which skipped both the Okta path and
the NIH CADR restricted-email check that tests have always exercised).

## Why the callback page's `@id` matters

`/okta/callback` returns `@id: '/okta/callback'` with no query string. Snovault's
`canonical_redirect` subscriber only redirects when a context's `@id` disagrees
with the request path, and treats an empty canonical query string as "any query
string is fine", so `?code=…&state=…` reaches the SPA intact. Changing that `@id`
to carry a query string would make the redirect fire and strip the authorization
code. `src/encoded/tests/test_okta.py::TestCanonicalRedirect` pins this.

## Content Security Policy

`app.js` allows `connect-src https://*.okta.com https://*.oktapreview.com` for
the token exchange, token revocation, and discovery/JWKS fetches. A different
Okta domain suffix needs adding there, or login fails on deployed origins only.

## Code layout

| File | Role |
| --- | --- |
| `src/encoded/okta.py` | settings, `/okta_config`, `/okta/callback` page route, ID-token verification |
| `src/encoded/authentication.py` | policy routing between the Okta and legacy paths; Okta branch of self-registration |
| `static/components/auth/oktaConfig.js` | pure config validation; the no-client-secret assertion |
| `static/components/auth/oktaClient.js` | the single browser-only `OktaAuth` instance |
| `static/components/auth/oktaSession.js` | `/login` + `/session-properties` + `/logout` |
| `static/components/auth/OktaLoginController.js` | redirect login, reload restoration, self-registration |
| `static/components/auth/OktaLoginCallbackView.js` | `/okta/callback` page (`@okta/okta-react`) |
| `static/components/auth/OktaLogoutController.js` | portal-then-Okta logout |

`react-router-dom` is installed only because `@okta/okta-react` imports it at
module scope for its (unused) `SecureRoute`; the portal wires no router.

Tests: `src/encoded/tests/test_okta.py`,
`src/encoded/tests/test_authentication.py`,
`src/encoded/static/components/__tests__/oktaAuth.test.js`, and
`src/encoded/static/components/__tests__/oktaLogoutLifecycle.test.js` (real locked
SDK, persistent storage across simulated logout/reload, no IdP/network).
