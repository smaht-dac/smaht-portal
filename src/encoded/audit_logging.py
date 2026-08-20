"""Small helpers for privacy-safe application audit events."""

from uuid import UUID


def authenticated_actor_fields(request):
    """Return the canonical authenticated actor UUID, when unambiguous."""
    if request is None:
        return {}

    try:
        principals = request.effective_principals
    except Exception:
        return {}

    actor_uuids = []
    for principal in principals:
        if not isinstance(principal, str) or not principal.startswith("userid."):
            continue
        candidate = principal[len("userid."):]
        try:
            UUID(candidate)
        except (ValueError, AttributeError):
            continue
        actor_uuids.append(candidate)

    if len(actor_uuids) != 1:
        return {}
    return {"user_uuid": actor_uuids[0]}
