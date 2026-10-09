"""Privacy-safe application audit events in the NIH CADR field schema.

Every audit event in this application is built by :func:`record_audit_event`.
That single builder owns the whitelist of permitted fields, the application
constants (``nih_ico``, ``cadr_name``, ``app``), the connection fields, and the
actor identity, so an event's shape cannot drift between call sites.

Two rules govern what an event may contain:

* **Truthful or absent.**  A field is emitted only when the application can
  actually derive it from authoritative state.  There is exactly one omission
  convention - the key is left out entirely; ``null`` is never substituted for
  a value the portal does not know, and a value is never guessed.
* **No secrets.**  Tokens, cookies, raw ``Authorization`` headers, passwords,
  presigned-URL query parameters, query strings and fragments never reach an
  event.  ``url`` is deliberately ``request.path_url``, which excludes both.

Events are queued on the request when :mod:`encoded.audit_tween` is active so
the response-level fields (``status``, ``bytes``, ``duration``,
``http_content_type``) can be attached once the response exists.  Without the
tween - management commands, or a view called directly in a unit test - an
event is emitted immediately and simply carries fewer fields.

``docs/operations/cadr_audit_logging.md`` holds the reviewable coverage matrix
for the mandatory CADR event families and all 24 CADR fields.
"""

import ipaddress
from uuid import UUID

import structlog
from snovault import COLLECTIONS

from .item_utils.constants import BENCHMARKING_PREFIX, PRODUCTION_PREFIX


log = structlog.getLogger(__name__)

# Stable application constants. Set centrally so no call site can disagree.
NIH_ICO = "NIDA"
CADR_NAME = "SMaHT"
APP_NAME = "smaht-portal"

# CADR event families. ``event_type`` carries the family; ``action`` carries
# the portal-specific transition inside it.
EVENT_TYPE_AUTHENTICATION = "authentication"
EVENT_TYPE_AUTHORIZATION = "authorization"
EVENT_TYPE_DATA_REQUEST = "data_request"
EVENT_TYPE_DOWNLOAD = "download"
EVENT_TYPE_UPLOAD = "upload"
EVENT_TYPE_DELETION = "deletion"
EVENT_TYPE_ARCHIVAL = "archival"
EVENT_TYPE_DESTRUCTION = "destruction"

EVENT_TYPES = frozenset({
    EVENT_TYPE_AUTHENTICATION,
    EVENT_TYPE_AUTHORIZATION,
    EVENT_TYPE_DATA_REQUEST,
    EVENT_TYPE_DOWNLOAD,
    EVENT_TYPE_UPLOAD,
    EVENT_TYPE_DELETION,
    EVENT_TYPE_ARCHIVAL,
    EVENT_TYPE_DESTRUCTION,
})

# Outcome vocabulary. Kept small so a dashboard can filter on it.
OUTCOMES = frozenset({"success", "failure", "denied", "allowed", "expired"})

# The CADR fields this application can ever populate. ``_time`` is intentionally
# absent: the console formatter already emits ``timestamp``/``@timestamp`` and a
# literal leading-underscore field collides with Splunk's internal namespace.
CADR_FIELDS = frozenset({
    "src_ip",
    "dest_port",
    "user_name",
    "user_id",
    "user_id_provider",
    "user_federated_source",
    "session_id",
    "url",
    "app",
    "http_user_agent",
    "status",
    "http_content_type",
    "bytes",
    "duration",
    "nih_ico",
    "cadr_name",
    "user_org",
    "user_email",
    "associated_study",
    "user_permission_group",
    "event_type",
})

# Portal-specific fields that give a CADR event its subject and detail.
PORTAL_FIELDS = frozenset({
    "action",
    "outcome",
    "reason",
    "http_method",
    "subject_uuid",
    "target_uuid",
    "resource_type",
    "resource_uuid",
    "resource_accession",
    "resource_status",
    "delivery",
    "granted_groups",
    "revoked_groups",
    "changed_fields",
    "changes",
    "result_count",
})

AUDIT_EVENT_FIELDS = CADR_FIELDS | PORTAL_FIELDS

# Never derived by this application, and never faked. See the coverage matrix.
#   dest_ip            - the client's destination is the TLS terminator / load
#                        balancer, whose address the app process never sees.
#   user_country_name  - no country is stored on User and none is asserted by
#                        the current identity provider.
#   eRA_commons_id     - RAS-only; the portal has no RAS integration.
UNAVAILABLE_CADR_FIELDS = frozenset({"dest_ip", "user_country_name", "eRA_commons_id"})

# Queue and identity attributes the tween and the auth policy set on a request.
AUDIT_EVENT_QUEUE_ATTR = "_audit_event_queue"
AUDIT_CLAIMS_ATTR = "_audit_verified_claims"
AUDIT_USER_CACHE_ATTR = "_audit_user_properties"
# Why a presented credential did not authenticate. snovault sets ``auth0_expired``
# for both an expired token and a rejected one, so the distinction is recorded
# here rather than inferred from that flag.
AUDIT_AUTH_FAILURE_ATTR = "_audit_auth_failure_reason"

AUTH_FAILURE_TOKEN_EXPIRED = "token_expired"
AUTH_FAILURE_TOKEN_REJECTED = "token_rejected"
AUTH_FAILURE_PROVIDER_UNCONFIGURED = "identity_provider_not_configured"
AUTH_FAILURE_USER_NOT_FOUND = "user_not_found"
AUTH_FAILURE_EMAIL_RESTRICTED = "email_restricted"

# Default number of proxies that append to X-Forwarded-For before the app sees
# it. The shipped container always has its own nginx (1). A deployment behind an
# additional edge load balancer must set ``audit.trusted_proxy_hops = 2`` so the
# client-supplied left-hand entries are never mistaken for the real client.
DEFAULT_TRUSTED_PROXY_HOPS = 1
TRUSTED_PROXY_HOPS_SETTING = "audit.trusted_proxy_hops"

# dbGaP study accessions, per docs/source/getting_dbgap_access.rst:
# phs004193 is the SMaHT Benchmarking data and phs004194 the Production data.
BENCHMARKING_STUDY_ACCESSION = "phs004193"
PRODUCTION_STUDY_ACCESSION = "phs004194"

# A File's annotated filename opens with the TPC project ID - "ST" for
# Benchmarking, "SMHT" for Production - which is how the rest of the
# application already identifies a file's study (see
# ``encoded.commands.create_annotated_filenames.get_project_id`` and
# ``encoded.item_utils.tissue.get_project_id``). It is a stored File property,
# so no traversal is needed on a request path.
ANNOTATED_FILENAME_SEPARATOR = "-"
PROJECT_PREFIX_STUDY_ACCESSIONS = (
    (PRODUCTION_PREFIX, PRODUCTION_STUDY_ACCESSION),
    (BENCHMARKING_PREFIX, BENCHMARKING_STUDY_ACCESSION),
)

# Statuses under which access to a File is actually governed by its dbGaP
# study. Open and public files are distributed without a dbGaP authorization,
# so naming a study accession on those events would assert an approval that is
# not what let the request through.
CONTROLLED_ACCESS_FILE_STATUSES = frozenset({
    "protected",
    "protected-network",
    "protected-early",
})


class AuditFieldError(ValueError):
    """Raised when a call site tries to log a field outside the whitelist."""


def canonical_uuid(value):
    """Return a normalized UUID string, or None for an unsafe/non-UUID value."""
    if value is None:
        return None
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def authenticated_actor_fields(request):
    """Return the canonical authenticated actor UUID, when unambiguous."""
    if request is None:
        return {}

    try:
        principals = request.effective_principals
    except Exception:
        return {}
    if not principals:
        return {}

    actor_uuids = []
    for principal in principals:
        if not isinstance(principal, str) or not principal.startswith("userid."):
            continue
        candidate = principal[len("userid."):]
        actor_uuid = canonical_uuid(candidate)
        if actor_uuid is not None:
            actor_uuids.append(actor_uuid)

    if len(actor_uuids) != 1:
        return {}
    return {"user_id": actor_uuids[0]}


def subject_uuid_fields(value):
    """Return a distinct subject UUID field only when the value is canonical."""
    subject_uuid = canonical_uuid(value)
    return {"subject_uuid": subject_uuid} if subject_uuid is not None else {}


def result_subject_uuid(result):
    """Extract a created item's UUID without copying its rendered properties."""
    if not isinstance(result, dict):
        return None
    graph = result.get("@graph")
    if not isinstance(graph, list) or not graph:
        return None
    created = graph[0]
    if isinstance(created, dict):
        return canonical_uuid(created.get("uuid"))
    if isinstance(created, str):
        return canonical_uuid(created.rstrip("/").rsplit("/", 1)[-1])
    return None


def safe_user_field_value(field_name, value):
    """Normalize audited User fields to privacy-safe enum, group, or UUID values."""
    if field_name == "status":
        return None if value is None else str(value)
    if value is None:
        return []
    values = value if isinstance(value, (list, tuple, set)) else [value]
    if field_name == "groups":
        return sorted({str(item) for item in values})

    normalized = []
    for item in values:
        candidate = str(item).rstrip("/").rsplit("/", 1)[-1]
        item_uuid = canonical_uuid(candidate)
        if item_uuid is not None:
            normalized.append(item_uuid)
    return sorted(set(normalized))


def study_accession_for_file(properties):
    """Return the dbGaP accession that governs access to this File, if any.

    Both conditions must hold for an accession to be truthful here: the File
    must be under a controlled-access status, so that a dbGaP authorization is
    what the request exercised, and its annotated filename must name the TPC
    project the data was submitted under. Anything else yields nothing.
    """
    if not isinstance(properties, dict):
        return None
    if properties.get("status") not in CONTROLLED_ACCESS_FILE_STATUSES:
        return None
    annotated_filename = properties.get("annotated_filename")
    if not isinstance(annotated_filename, str) or not annotated_filename:
        return None
    project_and_sample_source = annotated_filename.split(
        ANNOTATED_FILENAME_SEPARATOR, 1
    )[0]
    for prefix, accession in PROJECT_PREFIX_STUDY_ACCESSIONS:
        if project_and_sample_source.startswith(prefix):
            return accession
    return None


def file_resource_fields(context):
    """Describe an audited File without copying its content or credentials."""
    fields = {}
    properties = getattr(context, "properties", None)
    if not isinstance(properties, dict):
        properties = {}
    resource_uuid = canonical_uuid(getattr(context, "uuid", None))
    if resource_uuid is not None:
        fields["resource_uuid"] = resource_uuid
    accession = properties.get("accession")
    if isinstance(accession, str) and accession:
        fields["resource_accession"] = accession
    status = properties.get("status")
    if isinstance(status, str) and status:
        fields["resource_status"] = status
    item_type = getattr(getattr(context, "type_info", None), "item_type", None)
    if isinstance(item_type, str) and item_type:
        fields["resource_type"] = item_type
    associated_study = study_accession_for_file(properties)
    if associated_study is not None:
        fields["associated_study"] = associated_study
    return fields


def _trusted_proxy_hops(request):
    """How many trailing X-Forwarded-For entries were appended by our own tier."""
    try:
        raw = request.registry.settings.get(TRUSTED_PROXY_HOPS_SETTING)
    except Exception:
        raw = None
    try:
        hops = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_TRUSTED_PROXY_HOPS
    return hops if hops >= 1 else DEFAULT_TRUSTED_PROXY_HOPS


def _valid_ip(value):
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate:
        return None
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return candidate


def client_ip(request):
    """Return the source IP under the deployment's trusted-proxy contract.

    ``X-Forwarded-For`` is appended to by each proxy, so only the trailing
    entries are trustworthy; the leading entries are whatever the client chose
    to send.  We therefore count ``audit.trusted_proxy_hops`` entries in from
    the right and never use ``request.client_addr``, which is the spoofable
    left-hand value.  With no usable header we fall back to the direct peer
    address, which cannot be forged.
    """
    hops = _trusted_proxy_hops(request)
    try:
        forwarded = request.headers.get("X-Forwarded-For")
    except Exception:
        forwarded = None
    if forwarded:
        chain = [entry.strip() for entry in forwarded.split(",") if entry.strip()]
        if len(chain) >= hops:
            candidate = _valid_ip(chain[-hops])
            if candidate is not None:
                return candidate
    return _valid_ip(getattr(request, "remote_addr", None))


def destination_port(request):
    """Return the port the client addressed, when an edge proxy asserts it.

    ``X-Forwarded-Port`` is only meaningful when a trusted edge load balancer
    sets (rather than appends to) it; the container's own nginx does not, so
    with a single trusted hop the header is client-controlled and is ignored.
    """
    if _trusted_proxy_hops(request) < 2:
        return None
    try:
        raw = request.headers.get("X-Forwarded-Port")
    except Exception:
        return None
    try:
        port = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    return port if 0 < port <= 65535 else None


def connection_fields(request):
    """Return the request-connection CADR fields this tier actually observes."""
    fields = {}
    if request is None:
        return fields
    source_ip = client_ip(request)
    if source_ip is not None:
        fields["src_ip"] = source_ip
    port = destination_port(request)
    if port is not None:
        fields["dest_port"] = port
    # path_url is scheme://host/path - no query string, no fragment. The Okta
    # callback and every presigned redirect carry their secrets in the query.
    url = getattr(request, "path_url", None)
    if isinstance(url, str) and url:
        fields["url"] = url
    user_agent = getattr(request, "user_agent", None)
    if isinstance(user_agent, str) and user_agent:
        fields["http_user_agent"] = user_agent
    method = getattr(request, "method", None)
    if isinstance(method, str) and method:
        fields["http_method"] = method
    return fields


def record_auth_failure_reason(request, reason):
    """Note why a presented credential failed, for the response-level event."""
    if request is None:
        return
    try:
        setattr(request, AUDIT_AUTH_FAILURE_ATTR, reason)
    except Exception:
        pass


def auth_failure_reason(request):
    """Return the recorded credential-failure reason, if one was noted."""
    reason = getattr(request, AUDIT_AUTH_FAILURE_ATTR, None)
    return reason if isinstance(reason, str) and reason else None


def verified_claims(request):
    """Return the non-secret subset of verified token claims, if any."""
    claims = getattr(request, AUDIT_CLAIMS_ATTR, None)
    return claims if isinstance(claims, dict) else {}


def record_verified_claims(request, payload, issuer=None):
    """Stash the non-secret parts of a *verified* token for later audit events.

    Only claims that identify the session and the asserting provider are kept.
    The token itself, its signature and any authorization code never leave the
    verification path.
    """
    if request is None or not isinstance(payload, dict):
        return {}
    claims = {}
    token_issuer = issuer or payload.get("iss")
    if isinstance(token_issuer, str) and token_issuer:
        claims["iss"] = token_issuer
    for claim_name in ("sid", "jti"):
        value = payload.get(claim_name)
        if isinstance(value, str) and value:
            claims[claim_name] = value
            break
    federated = payload.get("idp")
    if not isinstance(federated, str) or not federated:
        subject = payload.get("sub")
        # Legacy Auth0 subjects are "<connection>|<id>"; the connection name is
        # the only honest statement this application can make about the
        # upstream identity provider.
        if isinstance(subject, str) and "|" in subject:
            federated = subject.split("|", 1)[0]
        else:
            federated = None
    if federated:
        claims["federated_source"] = federated
    email = payload.get("email")
    if isinstance(email, str) and email:
        claims["email"] = email.lower()
    try:
        setattr(request, AUDIT_CLAIMS_ATTR, claims)
    except Exception:
        pass
    return claims


def _user_properties(request, user_uuid):
    """Load audited User properties once per request, or return {} on failure."""
    if request is None or not user_uuid:
        return {}
    cache = getattr(request, AUDIT_USER_CACHE_ATTR, None)
    if not isinstance(cache, dict):
        cache = {}
        try:
            setattr(request, AUDIT_USER_CACHE_ATTR, cache)
        except Exception:
            pass
    if user_uuid in cache:
        return cache[user_uuid]
    properties = {}
    try:
        item = request.registry[COLLECTIONS]["user"][user_uuid]
        candidate = getattr(item, "properties", None)
        if isinstance(candidate, dict):
            properties = candidate
    except Exception:
        properties = {}
    cache[user_uuid] = properties
    return properties


def permission_groups(request):
    """Return the portal groups the request is actually authorized under."""
    try:
        principals = request.effective_principals or []
    except Exception:
        return []
    groups = {
        principal[len("group."):]
        for principal in principals
        if isinstance(principal, str) and principal.startswith("group.")
    }
    return sorted(groups)


def identity_fields(request, user_id=None):
    """Return the CADR actor fields for the verified identity behind a request.

    The actor is the portal User the request authenticated as - never an email
    or a subject taken from an unverified incoming cookie.  ``user_id`` may be
    supplied when the authoritative identity is not the one attached to this
    request (the login view verifies a presented credential separately).
    """
    fields = {}
    if request is None:
        return fields
    if user_id is None:
        user_id = authenticated_actor_fields(request).get("user_id")
    if user_id:
        fields["user_id"] = user_id
        properties = _user_properties(request, user_id)
        first_name = properties.get("first_name")
        last_name = properties.get("last_name")
        names = [part for part in (first_name, last_name) if isinstance(part, str) and part]
        if names:
            fields["user_name"] = " ".join(names)
        email = properties.get("email")
        if isinstance(email, str) and email:
            fields["user_email"] = email
        institution = properties.get("institution")
        if isinstance(institution, str) and institution:
            fields["user_org"] = institution

    claims = verified_claims(request)
    issuer = claims.get("iss")
    if issuer:
        fields["user_id_provider"] = issuer
    federated_source = claims.get("federated_source")
    if federated_source:
        fields["user_federated_source"] = federated_source
    session_id = claims.get("sid") or claims.get("jti")
    if session_id:
        fields["session_id"] = session_id
    if "user_email" not in fields and claims.get("email"):
        # A verified token whose User could not be resolved still identifies a
        # real, verified address; that is authoritative enough to record. The
        # claim is only ever stashed after full verification, so this can never
        # promote an address the application did not check.
        fields["user_email"] = claims["email"]

    groups = permission_groups(request)
    if groups:
        fields["user_permission_group"] = groups
    return fields


def claims_identity_fields(request):
    """Actor fields that need no database lookup, from verified claims only.

    Used where a lookup would be unsafe - notably after the request's
    transaction has closed - so an event can still name the provider and
    session it observed without reopening the database.
    """
    claims = verified_claims(request)
    fields = {}
    if claims.get("iss"):
        fields["user_id_provider"] = claims["iss"]
    if claims.get("federated_source"):
        fields["user_federated_source"] = claims["federated_source"]
    session_id = claims.get("sid") or claims.get("jti")
    if session_id:
        fields["session_id"] = session_id
    if claims.get("email"):
        fields["user_email"] = claims["email"]
    return fields


def constant_fields():
    """Return the application-wide CADR constants."""
    return {"app": APP_NAME, "nih_ico": NIH_ICO, "cadr_name": CADR_NAME}


def validate_audit_fields(fields):
    """Reject any field outside the audit whitelist before it can be logged."""
    unknown = sorted(set(fields) - AUDIT_EVENT_FIELDS)
    if unknown:
        raise AuditFieldError(
            f"Audit event fields are not in the CADR whitelist: {', '.join(unknown)}"
        )
    return fields


def build_audit_event(request, message, event_type, action, outcome, identity=None,
                      **fields):
    """Assemble one complete, whitelist-checked audit event dictionary."""
    if event_type not in EVENT_TYPES:
        raise AuditFieldError(f"Unknown CADR event_type: {event_type!r}")
    if outcome not in OUTCOMES:
        raise AuditFieldError(f"Unknown audit outcome: {outcome!r}")
    event = constant_fields()
    event.update(connection_fields(request))
    if identity is None:
        identity = identity_fields(request)
    event.update({key: value for key, value in identity.items() if value not in (None, [], "")})
    event.update({
        "event_type": event_type,
        "action": action,
        "outcome": outcome,
    })
    event.update({key: value for key, value in fields.items() if value is not None})
    validate_audit_fields(event)
    return {"message": message, "fields": event}


def emit_audit_event(event):
    """Write one assembled audit event as a single physical JSON line."""
    log.warning(event["message"], **event["fields"])


def record_audit_event(request, message, event_type, action, outcome, identity=None,
                       **fields):
    """Record one audit event, deferring it to the response when possible.

    With :mod:`encoded.audit_tween` active the event waits on the request so
    the response-level fields can be attached; otherwise it is emitted now.
    """
    event = build_audit_event(
        request, message, event_type, action, outcome, identity=identity, **fields
    )
    queue = _audit_queue(request)
    if queue is None:
        emit_audit_event(event)
    else:
        queue.append(event)
    return event


def _audit_queue(request):
    """Return the queue the tween created for this request, if it is wrapping it."""
    from snovault.util import get_root_request  # local: avoids an import cycle

    for candidate in (request, _safe_root_request(get_root_request)):
        if candidate is None:
            continue
        queue = getattr(candidate, AUDIT_EVENT_QUEUE_ATTR, None)
        if isinstance(queue, list):
            return queue
    return None


def _safe_root_request(get_root_request):
    try:
        return get_root_request()
    except Exception:
        return None
