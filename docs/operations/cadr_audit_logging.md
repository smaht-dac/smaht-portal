# NIH CADR audit logging coverage

This is the reviewable record of what the SMaHT portal audits today, in the NIH
CADR field schema, and of what it deliberately does **not** claim to know.

Every audit event is produced by `record_audit_event` in
`src/encoded/audit_logging.py`. That builder owns the field whitelist, the
application constants and the actor identity; `src/encoded/audit_tween.py`
completes each event with the response-level fields. Events are written as one
physical line of JSON on the existing console/CloudWatch/Splunk path - this
work adds no new transport, credential or retention behavior.

Two rules are enforced in code and asserted in
`src/encoded/tests/test_cadr_audit_logging.py`:

* **Truthful or absent.** A field appears only when the application can derive
  it from authoritative state. The single omission convention is that the key
  is left out; `null` is never substituted and a value is never guessed.
* **No secrets.** No *audit event* carries a token, cookie, raw `Authorization`
  header, password, reCAPTCHA secret, upload credential, annotated filename or
  presigned-URL query parameter. `url` is `request.path_url`, which excludes
  the query string and fragment. This rule governs audit events only; the
  separately authorized Splunk forwarder export of request query strings and
  `Referer` values is unchanged by this work and is out of its scope.

## Event families

### 1. Authentication and authorization

| Transition | `event_type` / `action` | Status |
|---|---|---|
| SSO login succeeds | `authentication` / `login` | Implemented, tested |
| SSO login fails | `authentication` / `login` (`outcome=failure`, with `reason`) | Implemented, tested |
| Explicit logout (`/logout`) | `authentication` / `logout` | Implemented, tested |
| Session expiry / automatic logout | `authentication` / `session_expired` | Implemented, tested |
| Denied attempt by a credentialed request | `authorization` / `access_denied` | Implemented, tested |
| Controlled donor record or search access, allowed and denied | `authorization` / `protected_donor_record_access`, `protected_donor_search` | Implemented, tested |
| Account created, changed, disabled | `authorization` / `user_account_create`, `user_record_change`, `user_account_disable` | Implemented, tested |
| Permission group granted or revoked | `authorization` / `user_group_grant`, `user_group_revoke` | Implemented, tested |
| Access key created, reset, revoked | `authorization` / `access_key_create`, `access_key_reset`, `access_key_revoke` | Implemented, tested |
| Automated lockout | - | **Not applicable.** The portal implements no lockout or throttle. Failed-attempt lockout belongs to the identity provider (Okta), which does not notify the portal, so there is no transition this application can observe. |

Login is recorded as a success only after the presented credential has been
run through the real authentication policy and resolved to exactly one portal
User. Snovault's `/login` only writes the token to a cookie without verifying
it, so `SMAHTProjectAuthentication.login` verifies it separately using a blank
request that carries only that token - an unrelated `jwtToken` cookie already
on the incoming request can never supply the identity. A failure records a
`reason` (`token_rejected`, `token_expired`,
`identity_provider_not_configured`, `user_not_found`, `no_credential_presented`
or `cookie_not_saved`) and no actor. A refusal by the restricted-email check
records `reason=email_restricted`, which is the portal's most CADR-specific
denial. A legacy HS256 token that has expired is reported as `token_rejected`
rather than `token_expired`: snovault's shared-secret path returns no reason of
its own, and inventing one would be a guess.

An anonymous 401/403 is the ordinary "please log in" response, not a denied
attempt by an identified actor, so the generic denial event is emitted only
when the request actually presented a credential. It is also suppressed
whenever another event already explains the refusal - an explicit logout and a
session expiry both answer 401 by design, and neither is a denied attempt.

### 2. Data Access Requests

**Not applicable: no DAR workflow exists in this application.** There is no
`DataAccessRequest` type, schema, route or state machine in the repository.
Access to controlled SMaHT data is requested, approved, modified and rejected
in dbGaP, outside the portal (see `docs/source/getting_dbgap_access.rst`).

What the portal *can* observe is the local consequence of an approval or
revocation: membership in the `dbgap` or `public-dbgap` group. Those grants and
revocations are audited as `authorization` / `user_group_grant` and
`user_group_revoke`, including removal via `?delete_fields=groups` or omission
in a replacement document. No DAR submission, approval or rejection event is
synthesized, because the portal does not observe one.

### 3. Data download, upload, deletion, archival and destruction

| Transition | `event_type` / `action` | Status |
|---|---|---|
| Download authorized and redirect issued | `download` / `file_download` (`delivery=presigned_redirect`) | Implemented, tested |
| CLI download credentials issued | `download` / `file_download_cli` (`delivery=temporary_credentials`) | Implemented, tested |
| Download denied for want of dbGaP access | `download` / `file_download`, `file_download_cli` (`outcome=failure`) | Implemented, tested |
| Upload initiated / credentials issued | `upload` / `file_upload_initiate` | Implemented, tested |
| Existing upload credentials read | `upload` / `file_upload_credentials_read` | Implemented, tested |
| Upload reported complete or failed | `upload` / `file_upload_complete`, `file_upload_failed` | Implemented, tested |
| File archived | `archival` / `file_archive` | Implemented, tested |
| File deleted (status) | `deletion` / `file_delete` | Implemented, tested |
| Other item deleted (status) | `deletion` / `item_delete` | Implemented, tested |
| Record permanently purged (`DELETE ?purge=true`) | `destruction` / `item_purge` | Implemented, tested |
| Object transfer from S3 | - | **Not observable.** The portal authorizes a download and issues a presigned redirect; the bytes move directly between the client and S3. Transfer size, duration and completion are never claimed. |
| S3 object destruction / lifecycle expiry | - | **Not observable.** Bucket lifecycle policy destroys objects without informing the application. `item_purge` describes the PostgreSQL/OpenSearch record only. |

`bytes` and `duration` on a download event describe this application's own
response - a redirect is a few hundred bytes - not the file. Release and
visibility status changes are not mapped to a lifecycle family, because they
are neither a deletion, an archival nor a destruction.

## CADR field coverage

| # | Field | Status | Source / reason |
|---:|---|---|---|
| 1 | `_time` | Implemented (renamed) | Emitted as `timestamp` and `@timestamp` by the console formatter. A literal `_time` key is not written, because leading-underscore fields collide with Splunk's internal namespace; map `_time` ← `timestamp` at index time. |
| 2 | `src_ip` | Implemented | Counted in from the right of `X-Forwarded-For` by `audit.trusted_proxy_hops` (2 in the deployed stack: load balancer + container nginx), falling back to the unforgeable peer address. The spoofable leftmost entry - what `request.client_addr` returns - is never used. |
| 3 | `dest_ip` | **Not observable** | The client's destination is the TLS terminator / load balancer. The application process only ever sees its own container socket, so no honest destination address exists at this tier. |
| 4 | `dest_port` | Implemented, conditional | From `X-Forwarded-Port`, and only when `audit.trusted_proxy_hops >= 2` declares an edge proxy that sets rather than appends it. With a single trusted hop the header is client-controlled and is ignored. |
| 5 | `user_name` | Implemented | `first_name` + `last_name` from the resolved portal User. Omitted when the User has not supplied them. |
| 6 | `user_id` | Implemented | The portal User UUID, from the verified `userid.` principal only. |
| 7 | `user_id_provider` | Implemented | The verified token issuer (`iss`). `user_federated_source` additionally carries the upstream IdP when the token asserts one. On the Okta path that is the `idp` claim, which is Okta's own opaque IdP identifier (`0oa…`) rather than a provider name such as "Google" - map it to a readable name with a Splunk lookup rather than guessing in application code. On the legacy Auth0 path it is the subject prefix, such as `google-oauth2`. The provider is never hardcoded; when RAS arrives its `federated_source` populates the same field. |
| 8 | `session_id` | Implemented, conditional | The verified `sid` claim, or the token's `jti` when the provider asserts no `sid`. Never the cookie value or a hash of it; omitted when the token carries neither claim. |
| 9 | `url` | Implemented | `request.path_url` - scheme, host and path. The query string and fragment are excluded so authorization codes, presigned parameters and search terms cannot leak. |
| 10 | `app` | Implemented | Constant `smaht-portal`. |
| 11 | `http_user_agent` | Implemented | `request.user_agent`. |
| 12 | `status` | Implemented | The HTTP status code, attached by the tween. The semantic result is the separate `outcome` field (`success`, `failure`, `denied`, `allowed`, `expired`). A queued `success`/`allowed` is downgraded to `failure` with `reason=request_failed` when the request never completed - a `pyramid_tm` commit failure raises past every view, so the change the view believed it made was rolled back. A 401 alone does not downgrade anything, because an explicit logout returns one by design. |
| 13 | `http_content_type` | Implemented | The response content type. |
| 14 | `bytes` | Implemented, scoped | The declared length of *this application's* response. Never a file size, a `Range` calculation or an S3 transfer, none of which the portal observes. |
| 15 | `duration` | Implemented | Wall-clock seconds for the request, measured by the tween. |
| 16 | `nih_ico` | Implemented | Constant `NIDA`. |
| 17 | `cadr_name` | Implemented | Constant `SMaHT`. |
| 18 | `user_country_name` | **Not available** | No country is stored on User and the current identity provider asserts none. It is deliberately not inferred from an email TLD or an IP geolocation the portal does not perform. (The restricted-country check in `encoded.authentication` tests an address against a blocklist; it does not establish where a user is.) |
| 19 | `user_org` | Implemented | The User's `institution`. Self-supplied and informational, per `src/encoded/schemas/user.json`; omitted when unset. |
| 20 | `user_email` | Implemented | The resolved User's `email`, or the verified token's `email` claim when the credential verified but matched no portal User. Never an unverified address. |
| 21 | `associated_study` | Implemented, scoped | `phs004193` (Benchmarking) or `phs004194` (Production), per `docs/source/getting_dbgap_access.rst`. Emitted for a File only when **both** conditions hold: the File is under a controlled-access status (`protected`, `protected-network`, `protected-early`), so a dbGaP authorization is what the request exercised; and its stored `annotated_filename` opens with the TPC project ID (`ST` or `SMHT`), which is how the rest of the application identifies a file's study. **Scope:** open and public files carry no accession, because they are not distributed under a dbGaP approval and claiming one would misdescribe the authorization; a controlled file with no annotated filename also carries none. The annotated filename itself is controlled metadata and is never logged. |
| 22 | `eRA_commons_id` | **Not applicable yet** | RAS-only. The portal has no RAS integration, so no eRA Commons identity reaches it. |
| 23 | `user_permission_group` | Implemented | The `group.*` principals the request is actually authorized under (for example `dbgap`, `public-dbgap`, `admin`). When RAS arrives, dbGaP access derived from `ga4gh_visa_v1` populates the same field. |
| 24 | `event_type` | Implemented | One of `authentication`, `authorization`, `data_request`, `download`, `upload`, `deletion`, `archival`, `destruction`. The specific transition is in `action`. `data_request` is reserved and currently unused - see the DAR section. |

### Portal-specific fields

Alongside the CADR fields, an event may carry `action`, `outcome`, `reason`,
`http_method`, `subject_uuid`, `target_uuid`, `resource_type`, `resource_uuid`,
`resource_accession`, `resource_status`, `delivery`, `granted_groups`,
`revoked_groups`, `changed_fields`, `changes` and `result_count`. The whitelist
lives in `AUDIT_EVENT_FIELDS`; anything outside it raises `AuditFieldError`
rather than being logged.

## Operating notes

* All audit events are written by the `encoded.audit_logging` logger, so a
  single logger name routes the whole audit stream.
* `audit.trusted_proxy_hops` must match the number of proxies that append to
  `X-Forwarded-For` in front of the application. It is set to `2` in
  `deploy/docker/production/smaht_any_alpha.ini` and defaults to `1` for a bare
  container or local run.
* Without the tween - a management command, or a view called directly in a unit
  test - events are emitted immediately and simply omit the four
  response-level fields.
* The tween's own events resolve their actor inside a fresh transaction, or
  from verified claims alone. `DBSession` is registered with
  `zope.sqlalchemy`, so reading the User after `pyramid_tm` has closed would
  otherwise leave a connection idle-in-transaction.
* The audit tween is the outermost tween, outside `pyramid_tm` and snovault's
  renderers, so `status` reflects a transaction abort or a session-expiry
  rewrite rather than what a view believed it was returning.
