"""Admin view for composing and sending data-release email notifications.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

# Bound here as well as in `notifications.py`: the two bindings are
# independent, so each test module patches the one its own views call.
from boto3 import client as boto_client
from botocore.exceptions import BotoCoreError, ClientError
from pyramid.view import view_config
from snovault.embed import make_subrequest
from snovault.util import debug_log
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from urllib.parse import urlencode

from .endpoints.elasticsearch_utils import AGGREGATION_NO_VALUE
from .endpoints.endpoint_utils import create_query_string
from .endpoints.recent_files_summary.recent_files_summary import (
    QUERY_FILE_CATEGORIES,
    QUERY_FILE_DATASET,
    QUERY_FILE_STATUSES,
    QUERY_FILE_TAGS,
    QUERY_FILE_TYPES,
    recent_files_summary,
)
from .endpoints.recent_files_summary.recent_files_summary_fields import (
    AGGREGATION_FIELD_FILE_DESCRIPTOR,
    AGGREGATION_FIELD_RELEASE_DATE,
    AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE,
)
from .notifications import (
    PENDING_CONFIRMATION,
    SNS_TOPIC_REGISTRY_KEY,
    authenticated_user,
    get_user_email_or_raise,
    dry_run_topic_arn,
    is_confirmed_subscription,
    iter_topic_subscriptions,
)


log = logging.getLogger(__name__)

MAX_NOTIFICATIONS = 50

ADMIN_ONLY_ERROR = "This page requires admin privileges."

# SNS caps the Publish `Subject` at 100 printable ASCII characters on one line,
# not beginning with a space. `fullmatch`, not `match` plus `$`: Python's `$`
# also matches before a trailing newline, so "Release\n" would slip through.
SUBJECT_MAX_LENGTH = 100
SUBJECT_RE = re.compile(r"[!-~][ -~]{0,%d}" % (SUBJECT_MAX_LENGTH - 1))
SUBJECT_TOO_LONG_ERROR = (
    f"subject must be at most {SUBJECT_MAX_LENGTH} characters"
)
SUBJECT_INVALID_ERROR = (
    "subject must be printable ASCII on a single line and must not begin "
    "with a space"
)

UNNAMED_FILE = "(unnamed file)"

# Fixed rather than interpolated with the exception, as with the SNS errors
# above: an OpenSearch failure stringifies to index and host detail.
RELEASE_SUMMARY_ERROR = (
    "Could not load the release summary. Please try again."
)

RELEASE_SUMMARY_AUDIENCE = (
    "* For the SMaHT Network members with Data Use Agreements established "
    "for data access *"
)
PORTAL_URL = "https://data.smaht.org"
RETRACTED_FILES_URL = f"{PORTAL_URL}/retracted-files"

DONOR_SEX_ABBREVIATIONS = {"Male": "M", "Female": "F"}
# Donor ages above 89 are stored as 89 (see abstract_donor.json).
DONOR_AGE_CAP = 89

TARGET_TEST = "test"
TARGET_ALL = "all"
TARGETS = (TARGET_TEST, TARGET_ALL)
TARGET_INVALID_ERROR = f"target must be one of: {', '.join(TARGETS)}"

# Any admin may send a dry run; publishing to every subscriber is limited to
# these accounts. Matched against the authenticated User item's own email, not
# against anything the client sends, so it cannot be spoofed by the caller.
CONSORTIUM_SENDERS = frozenset({
    "elizabeth_chun@hms.harvard.edu",
    "alexander_veit@hms.harvard.edu",
})
SENDER_NOT_ALLOWED_ERROR = (
    "Your account is not authorized to email all subscribers. Test emails "
    "are available to any admin."
)

# SNS caps the Publish `Message` at 256 KB measured on the UTF-8 encoding, not
# on the character count.
BODY_MAX_BYTES = 256 * 1024
BODY_TOO_LONG_ERROR = f"body must be at most {BODY_MAX_BYTES} bytes"

# Fixed strings, never interpolated with the underlying exception: a
# ClientError stringifies to the caller's role ARN, account ID and topic ARN.
SNS_PUBLISH_ERROR = "AWS could not send the email. Please try again."
SNS_RECIPIENTS_ERROR = (
    "AWS could not list the email recipients. Please try again."
)
NOTIFICATIONS_UNAVAILABLE_ERROR = (
    "Email notifications are not configured on this environment."
)


def includeme(config):
    config.add_route("get_notification_status", "/get_notification_status/")
    config.add_route("get_released_files_text", "/get_released_files_text/")
    config.add_route(
        "get_released_files_summary", "/get_released_files_summary/"
    )
    config.add_route("get_email_recipients", "/get_email_recipients/")
    config.add_route("send_notification_email", "/send_notification_email/")
    config.scan(__name__)


def validate_user_is_admin(request) -> bool:
    """Validates that the user who executed the request context is an admin."""
    return 'group.admin' in request.effective_principals


def validate_user_may_notify_all(request) -> bool:
    """Whether the caller may publish to every subscriber, not just a dry run."""
    try:
        email = get_user_email_or_raise(authenticated_user(request))
    except Exception:
        # Fails closed. A caller whose profile or email cannot be resolved --
        # an internal principal with no User item, say -- is not on the list.
        return False
    return email in CONSORTIUM_SENDERS


@view_config(route_name="get_notification_status", request_method="POST")
@debug_log
def get_notification_status(context, request):
    # Outside the try block so the generic handler cannot rewrite this message.
    # A 200 with {"error": ...} is the shape the frontend renders; a view
    # predicate would 404 instead and never reach the success callback.
    if not validate_user_is_admin(request):
        return {"error": ADMIN_ONLY_ERROR}
    try:
        search_params = {
            "type": "EmailNotification",
            "limit": MAX_NOTIFICATIONS,
            "sort": "-date_created",
        }
        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        )
        search_res = search(context, subreq)["@graph"]

        email_notifications = [
            {
                "uuid": item.get("uuid"),
                "subject": item.get("subject"),
                "body": item.get("body"),
                "notification_type": item.get("notification_type"),
                "date_sent": item.get("date_sent"),
                "date_created": item.get("date_created"),
                # Populated by the `submitted` mixin on write, not by us.
                "sent_by": item.get("submitted_by"),
            }
            for item in search_res
        ]

        return {
            "email_notifications": email_notifications,
            # Lets the page disable the send-to-all button 
            "can_notify_all": validate_user_may_notify_all(request),
        }
    except Exception as e:
        return {
            "error": f"Error when trying to get notification status: {e}",
        }


@view_config(route_name="get_released_files_text", request_method="POST")
@debug_log
def get_released_files_text(context, request):
    # Admin-gated like the other two: the status filter below includes
    # open-early and protected-early, which are consortium-restricted.
    if not validate_user_is_admin(request):
        return {"error": ADMIN_ONLY_ERROR}
    try:
        body = request.json_body
        date_from = body.get("date_from")
        if not date_from:
            return {"error": "date_from is required"}

        search_params = [
            ("type", "File"),
            ("status", "open"),
            ("status", "open-early"),
            ("status", "protected-early"),
            ("status", "protected"),
            ("dataset!", "No value"),
            ("file_status_tracking.release_dates.initial_release_date.from", date_from),
            ("limit", "all"),
            ("sort", "display_title"),
        ]
        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params)}", inherit_user=True
        )
        files = search(context, subreq)["@graph"]

        if not files:
            return {"text": f"No files were released since {date_from}."}

        # Plain text, not Markdown: a setext-style underline instead of `####`,
        # and ASCII bullets. Titles are single unbreakable tokens (accessions,
        # filenames), so no hard wrap -- mail clients soft-wrap anyway.
        heading = f"Files Released Since {date_from}"
        lines = [heading, "-" * len(heading), ""]
        for f in files:
            title = (
                f.get("display_title")
                or f.get("accession")
                or f.get("uuid")
                or UNNAMED_FILE
            )
            lines.append(f"- {title}")

        # No trailing newline: the composer appends this with '\n\n' + text.
        return {"text": "\n".join(lines)}
    except Exception as e:
        return {
            "error": f"Error when trying to get released files: {e}",
        }


def collect_release_counts(
    node: Dict, title: Optional[str] = None,
    totals: Optional[Dict[Tuple[str, str], int]] = None,
) -> Dict[Tuple[str, str], int]:
    """Sum file counts per (release tracker title, file description)."""
    # Keyed off `name`, not depth: the aggregation nests release month and
    # release day above these two, and that nesting has changed before.
    if totals is None:
        totals = {}
    name, value = node.get("name"), node.get("value")
    if name == AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE and value:
        title = value
    elif name == AGGREGATION_FIELD_FILE_DESCRIPTOR and value and title:
        totals[(title, value)] = totals.get((title, value), 0) + (
            node.get("count") or 0
        )
    for child in node.get("items") or []:
        collect_release_counts(child, title, totals)
    return totals


def framed_heading(heading: str) -> List[str]:
    """A heading between two dash rules of its own length."""
    rule = "-" * len(heading)
    return [rule, heading, rule]


def uppercase_file_format(description: str) -> str:
    """Uppercase the trailing file format: "... NovaSeq X bam" -> "... BAM".

    `release_tracker_description` always ends with the file format's display
    title (see File._get_release_tracker_description).
    """
    head, _, file_format = description.rpartition(" ")
    return f"{head} {file_format.upper()}" if head else file_format.upper()


def count_files(count: int) -> str:
    """ "1 file", "2 files", "0 files"."""
    return f"{count} file" if count == 1 else f"{count} files"


def donor_label(sex: Optional[str], age: Optional[int]) -> Optional[str]:
    """ "M57" for a 57-year-old male donor; "F89+" at the age cap."""
    abbreviation = DONOR_SEX_ABBREVIATIONS.get(sex)
    if not abbreviation or not isinstance(age, int):
        return None
    return f"{abbreviation}{age}+" if age >= DONOR_AGE_CAP else f"{abbreviation}{age}"


def get_title_donor_labels(
    context, request, date_from: str, date_to: str
) -> Dict[str, str]:
    """Map each release-tracker title to its donor's sex and age, e.g. "M57".

    Read from the released files themselves. A title gets a label only when
    all its files agree on a single donor with known sex and age, so cell
    lines, mixtures and multi-donor titles stay unlabeled.
    """
    # The same filters as recent_files_summary's base query, so labels are read
    # from exactly the files the summary counts -- not also from QC or
    # tracker-excluded files, which would only enlarge this `limit=all` search.
    # create_query_string turns each "!value" into "field!=value".
    query = create_query_string({
        "type": QUERY_FILE_TYPES,
        "status": QUERY_FILE_STATUSES,
        "data_category": QUERY_FILE_CATEGORIES,
        "sample_summary.studies": ["Production"],
        "dataset": QUERY_FILE_DATASET,
        "tags": QUERY_FILE_TAGS,
        f"{AGGREGATION_FIELD_RELEASE_DATE}.from": date_from,
        f"{AGGREGATION_FIELD_RELEASE_DATE}.to": date_to,
        AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE: f"!{AGGREGATION_NO_VALUE}",
        AGGREGATION_FIELD_FILE_DESCRIPTOR: f"!{AGGREGATION_NO_VALUE}",
        # Only what the label needs: snovault limits _source to these.
        "field": [
            AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE,
            "donors.sex",
            "donors.age",
        ],
        "limit": "all",
    })
    subreq = make_search_subreq(
        request, f"/search?{query}", inherit_user=True
    )
    donors_by_title: Dict[str, set] = {}
    for hit in search(context, subreq).get("@graph") or []:
        title = hit.get(AGGREGATION_FIELD_RELEASE_TRACKER_FILE_TITLE)
        if not title:
            continue
        pairs = donors_by_title.setdefault(title, set())
        for donor in hit.get("donors") or []:
            pairs.add((donor.get("sex"), donor.get("age")))

    labels = {}
    for title, pairs in donors_by_title.items():
        if len(pairs) == 1 and (label := donor_label(*next(iter(pairs)))):
            labels[title] = label
    return labels


def recent_releases_url(date_from: str) -> str:
    """The Recent Releases page, opened on the month of `date_from`."""
    month = date_from[:7]
    query = urlencode(
        [("view", "monthly"), ("date", f"{month}-01"), ("month", month)]
    )
    return f"{PORTAL_URL}/recent-releases?{query}"


def format_release_summary(
    totals: Dict[Tuple[str, str], int], date_from: str, date_to: str,
    retracted_count: int, title_labels: Optional[Dict[str, str]] = None,
) -> str:
    """Render the grouped counts as the plain text the composer inserts."""
    by_title: Dict[str, Dict[str, int]] = {}
    for (title, description), count in totals.items():
        by_title.setdefault(title, {})[description] = count

    # The headline is the sum of what is printed below it, so the two can never
    # disagree -- the tree's own top-level count is a separate figure.
    total = sum(totals.values())
    lines = framed_heading(
        f"Data Files Released Between {date_from} and {date_to} "
        "on the SMaHT Data Portal"
    )
    lines += [
        RELEASE_SUMMARY_AUDIENCE,
        "",
        f"NEW DATA - {count_files(total)} released.",
        f"{recent_releases_url(date_from)}",
        "",
    ]

    # Count descending, then name, so the text is stable enough to assert on.
    def by_count_then_name(item):
        return (-item[1], item[0])

    titles = sorted(
        ((title, sum(rows.values())) for title, rows in by_title.items()),
        key=by_count_then_name,
    )
    title_labels = title_labels or {}
    for title, _ in titles:
        label = title_labels.get(title)
        lines.append(f"{title} ({label})" if label else title)
        for description, count in sorted(
            by_title[title].items(), key=by_count_then_name
        ):
            lines.append(f"  - {count} {uppercase_file_format(description)}")
        lines.append("")

    lines.append("")
    lines += framed_heading(
        f"Data Files Retracted / Replaced Between {date_from} and {date_to}"
    )
    lines += [
        f"{count_files(retracted_count)} retracted",
        f"* See the complete list here: {RETRACTED_FILES_URL}",
    ]

    # No trailing newline: the composer appends this with '\n\n' + text.
    return "\n".join(lines)


def count_retracted_files(context, request, date_from: str, date_to: str) -> int:
    """Count files retracted in the window, as the Retracted Files page lists them."""
    # Same set as RetractedFilesTable.js: retracted after having been released.
    search_params = [
        ("type", "File"),
        ("status", "retracted"),
        ("file_status_tracking.release_dates.initial_release_date!", "No value"),
        ("file_status_tracking.status_tracking.retracted.from", date_from),
        ("file_status_tracking.status_tracking.retracted.to", date_to),
        ("limit", "1"),
    ]
    subreq = make_search_subreq(
        request, f"/search?{urlencode(search_params)}", inherit_user=True
    )
    return search(context, subreq).get("total") or 0


@view_config(route_name="get_released_files_summary", request_method="POST")
@debug_log
def get_released_files_summary(context, request):
    """Summarize released files the way the home-page release tracker does."""
    if not validate_user_is_admin(request):
        return {"error": ADMIN_ONLY_ERROR}
    try:
        date_from = request.json_body.get("date_from")
        if not date_from:
            return {"error": "date_from is required"}
        # Older clients send only date_from and mean "through today".
        date_to = (
            request.json_body.get("date_to")
            or datetime.now(timezone.utc).date().isoformat()
        )

        # Both dates, always: `recent_files_summary` defaults `nmonths` to 3 and
        # would otherwise cap the window at date_from + 3 months, silently
        # dropping everything released after that.
        query = create_query_string({
            "from_date": date_from,
            "thru_date": date_to,
            "exclude_tissue_info": "true",
        })
        # A subrequest, never `request` itself: recent_files_summary sets
        # `remote_user = "IMPORT"` on whatever it is handed.
        subreq = make_search_subreq(
            request, f"/recent_files_summary?{query}", inherit_user=True
        )
        results = recent_files_summary(subreq)
        totals = collect_release_counts(results or {})
        title_labels = get_title_donor_labels(
            context, request, date_from, date_to
        )
        retracted_count = count_retracted_files(
            context, request, date_from, date_to
        )
        return {"text": format_release_summary(
            totals, date_from, date_to, retracted_count, title_labels
        )}
    except Exception:
        log.exception("get_released_files_summary failed")
        return {"error": RELEASE_SUMMARY_ERROR}


def get_topic_for_target(request, target: str) -> Optional[str]:
    """Return the SNS topic a target publishes to, or None if unconfigured.

    The only place in this module that decides who receives mail: `test`
    resolves to the dry-run sibling, `all` to the configured topic itself.
    """
    # Not `notifications.get_topic_or_raise`, which raises
    # HTTPServiceUnavailable: every view here answers 200 with {"error": ...}.
    topic = request.registry.get(SNS_TOPIC_REGISTRY_KEY)
    if not topic:
        return None
    if target == TARGET_TEST:
        return dry_run_topic_arn(topic)
    if target == TARGET_ALL:
        return topic
    # No `else` arm returning `topic`: an unrecognised target must fail rather
    # than fall through to the real one, which is where a two-branch if/else
    # would send "Test", "" and None alike. The message is fixed rather than
    # interpolated so the outer handler cannot echo caller input to the browser.
    raise ValueError("unknown notification target")


def sorted_endpoints(endpoints: Dict[str, str]) -> List[str]:
    """Order a casefold-keyed endpoint map by address."""
    return [endpoints[key] for key in sorted(endpoints)]


def collect_recipients(topic: str) -> Tuple[List[str], List[str]]:
    """Return a topic's email endpoints: confirmed, then pending.

    SNS can hold the same address more than once, with whatever casing each
    Subscribe used, so both lists are deduplicated case-insensitively. Each
    address keeps the spelling SNS holds -- the one an operator will find in
    the console and in their own inbox.
    """
    confirmed: Dict[str, str] = {}
    pending: Dict[str, str] = {}
    for subscription in iter_topic_subscriptions(boto_client("sns"), topic):
        # Only `email` endpoints receive this: we publish plain text over SMTP.
        if subscription.get("Protocol") != "email":
            continue
        endpoint = subscription.get("Endpoint")
        if not isinstance(endpoint, str) or not endpoint:
            continue
        if is_confirmed_subscription(subscription):
            confirmed.setdefault(endpoint.casefold(), endpoint)
        elif subscription.get("SubscriptionArn") == PENDING_CONFIRMATION:
            pending.setdefault(endpoint.casefold(), endpoint)
        # `Deleted` falls through deliberately: it was cancelled through the
        # AWS unsubscribe link, so nothing is outstanding for anyone to act on.
    # A Subscribe against an already-confirmed address leaves a pending
    # duplicate. It does receive the mail, so drop it from the list that says
    # it will not.
    for key in confirmed:
        pending.pop(key, None)
    return sorted_endpoints(confirmed), sorted_endpoints(pending)


@view_config(route_name="get_email_recipients", request_method="POST")
@debug_log
def get_email_recipients(context, request):
    """Report who a send would reach, split by confirmation state.

    Both targets get counts; only `test` gets addresses. The dry-run topic
    holds a few admin addresses and naming them is the point of that dialog;
    the configured topic holds the whole consortium and its dialog needs a
    number, not a mailing list. The split is decided here, not by the caller,
    so no request body can ask for the real topic's addresses.
    """
    if not validate_user_is_admin(request):
        return {"error": ADMIN_ONLY_ERROR}
    try:
        target = request.json_body.get("target")
        if target not in TARGETS:
            return {"error": TARGET_INVALID_ERROR}
        topic = get_topic_for_target(request, target)
        if not topic:
            return {"error": NOTIFICATIONS_UNAVAILABLE_ERROR}
        try:
            confirmed, pending = collect_recipients(topic)
        except (BotoCoreError, ClientError) as error:
            # Caught ahead of the generic handler, which would interpolate the
            # exception into a user-facing string. The generator is lazy, so
            # this must wrap the consumption, not just its construction.
            log.error("SNS list failed: %s", error.__class__.__name__)
            return {"error": SNS_RECIPIENTS_ERROR}
        # Counts are the contract both dialogs share: each disables Confirm on
        # `confirmed_count` rather than inferring it from a list it may not
        # have been given. Deduplicated first, so a pending duplicate cannot
        # inflate the figure an operator is asked to confirm.
        response = {
            "target": target,
            "confirmed_count": len(confirmed),
            "pending_count": len(pending),
        }
        if target == TARGET_TEST:
            response["confirmed"] = confirmed
            response["pending"] = pending
        return response
    except Exception as e:
        return {
            "error": f"Error when trying to list email recipients: {e}",
        }


def publish_notification_email(topic: str, subject: str, body: str) -> None:
    """Publish one message to a topic."""
    boto_client("sns").publish(TopicArn=topic, Subject=subject, Message=body)


def record_notification(request, item_data: Dict[str, str]) -> Optional[str]:
    """POST an EmailNotification and return its uuid.

    Raises on any failure -- a 4xx as readily as an exception out of the tween
    chain -- because the only caller has already published and needs one arm
    for "the mail went out but the history does not show it", not two.
    """
    subreq = make_subrequest(
        request,
        "/email-notifications/",
        method="POST",
        json_body=item_data,
        inherit_user=True,
    )
    # make_subrequest sets the body from json_body but leaves content_type
    # empty, so set it explicitly for the item POST view.
    subreq.content_type = "application/json"
    resp = request.invoke_subrequest(subreq, use_tweens=True)
    if resp.status_int >= 400:
        raise RuntimeError(
            f"EmailNotification POST returned {resp.status_int}: {resp.json_body}"
        )
    return resp.json_body.get("@graph", [{}])[0].get("uuid")


@view_config(route_name="send_notification_email", request_method="POST")
@debug_log
def send_notification_email(context, request):
    """Publish a notification: a dry run, or the real thing to all subscribers."""
    if not validate_user_is_admin(request):
        return {"error": ADMIN_ONLY_ERROR}
    try:
        body = request.json_body
        subject = body.get("subject")
        notification_body = body.get("body")
        notification_type = body.get("notification_type")
        target = body.get("target")

        if not subject:
            return {"error": "subject is required"}
        if len(subject) > SUBJECT_MAX_LENGTH:
            return {"error": SUBJECT_TOO_LONG_ERROR}
        if not SUBJECT_RE.fullmatch(subject):
            return {"error": SUBJECT_INVALID_ERROR}
        if not notification_body:
            return {"error": "body is required"}
        if not notification_type:
            return {"error": "notification_type is required"}
        if target not in TARGETS:
            return {"error": TARGET_INVALID_ERROR}
        # Depends on the target, so it cannot sit with the admin guard at the
        # top; still ahead of every path that reaches SNS.
        if target == TARGET_ALL and not validate_user_may_notify_all(request):
            return {"error": SENDER_NOT_ALLOWED_ERROR}
        if len(notification_body.encode("utf-8")) > BODY_MAX_BYTES:
            return {"error": BODY_TOO_LONG_ERROR}

        # Both targets publish and differ only in what happens afterwards, so
        # there is one call site and one boto error arm.
        topic = get_topic_for_target(request, target)
        if not topic:
            return {"error": NOTIFICATIONS_UNAVAILABLE_ERROR}
        try:
            publish_notification_email(topic, subject, notification_body)
        except (BotoCoreError, ClientError) as error:
            # Caught ahead of the generic handler, which would interpolate the
            # exception into a user-facing string. Nothing is recorded at this
            # point, which is the right way round: a row for mail that never
            # went out is a lie in the history nobody has reason to doubt.
            log.error("SNS publish failed: %s", error.__class__.__name__)
            return {"error": SNS_PUBLISH_ERROR}

        if target == TARGET_TEST:
            # A dry run leaves no trace in Previous Messages.
            return {
                "status": "ok",
                "target": TARGET_TEST,
                "sent": True,
                "recorded": False,
            }

        item_data = {
            "subject": subject,
            "body": notification_body,
            "notification_type": notification_type,
            "date_sent": datetime.now(timezone.utc).isoformat(),
        }

        # The mail is already out, so nothing below may answer {"error": ...}:
        # the frontend reads that as "nothing happened" and the operator's next
        # move would be to send the same announcement again.
        try:
            uuid = record_notification(request, item_data)
        except Exception:
            # Full traceback on purpose: the "never interpolate the exception"
            # rule governs user-facing strings, not the server log.
            log.exception(
                "EmailNotification write failed after a successful publish;"
                " the mail was delivered but is not in Previous Messages"
            )
            return {
                "status": "ok",
                "target": TARGET_ALL,
                "sent": True,
                "recorded": False,
            }
        return {
            "status": "ok",
            "uuid": uuid,
            "target": TARGET_ALL,
            "sent": True,
            "recorded": True,
        }
    except Exception as e:
        return {
            "error": f"Error when trying to send notification email: {e}",
        }
