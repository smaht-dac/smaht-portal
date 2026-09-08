"""Small helpers for privacy-safe application audit events."""

from uuid import UUID


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
    return {"user_uuid": actor_uuids[0]}


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
