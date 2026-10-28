import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, call
from urllib.parse import parse_qs

import pytest
import webtest
from botocore.exceptions import ClientError
from pyramid.config import Configurator
from snovault import COLLECTIONS

from encoded import notification_status, notifications


ADMIN_PRINCIPALS = ["system.Authenticated", "group.admin"]
NON_ADMIN_PRINCIPALS = ["system.Authenticated", "group.submitter"]

USER_UUID = "11111111-2222-3333-4444-666666666666"
ALLOWED_SENDER = sorted(notification_status.CONSORTIUM_SENDERS)[0]
BLOCKED_SENDER = "someone_else@hms.harvard.edu"

TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:smaht-data-releases"
DRY_RUN_TOPIC_ARN = TOPIC_ARN + "-dryrun"
SUBSCRIPTION_ARN = DRY_RUN_TOPIC_ARN + ":11111111-2222-3333-4444-555555555555"

ALL_VIEWS = [
    notification_status.get_notification_status,
    notification_status.get_released_files_text,
    notification_status.get_released_files_summary,
    notification_status.get_email_recipients,
    notification_status.send_notification_email,
]

# Every route `includeme` registers. Both router tests below iterate this, so a
# new route is added in one place rather than three.
ALL_ROUTES = [
    "/get_notification_status/",
    "/get_released_files_text/",
    "/get_released_files_summary/",
    "/get_email_recipients/",
    "/send_notification_email/",
]


def fake_request(
    *, principals=None, json_body=None, topic=TOPIC_ARN, user_email=ALLOWED_SENDER
):
    registry = {}
    if topic:
        registry[notification_status.SNS_TOPIC_REGISTRY_KEY] = topic
    principals = list(ADMIN_PRINCIPALS if principals is None else principals)
    if user_email is not None:
        # A resolvable User item, so the consortium-sender gate reads a real
        # address here instead of failing closed in every unrelated test.
        user = Mock()
        user.upgrade_properties.return_value = {"email": user_email}
        registry[COLLECTIONS] = {"user": {USER_UUID: user}}
        principals.append(f"userid.{USER_UUID}")
    return SimpleNamespace(
        effective_principals=principals,
        json_body=json_body or {},
        registry=registry,
        invoke_subrequest=Mock(),
    )


def mock_sns(monkeypatch):
    """Patch the module-level boto client, as the `notifications` tests do.

    `notification_status` binds its own `boto_client` name, so patching
    `notifications.boto_client` would leave this module's binding untouched.
    """
    sns_client = Mock()
    monkeypatch.setattr(
        notification_status, "boto_client", Mock(return_value=sns_client)
    )
    return sns_client


def mock_search(monkeypatch, graph):
    """Patch the search subrequest helpers used by all read views."""
    search = Mock(return_value={"@graph": graph})
    monkeypatch.setattr(notification_status, "search", search)
    monkeypatch.setattr(
        notification_status, "make_search_subreq", Mock(return_value=Mock())
    )
    return search


@pytest.mark.parametrize(
    "principals,expected",
    [
        (ADMIN_PRINCIPALS, True),
        (NON_ADMIN_PRINCIPALS, False),
        (["system.Everyone"], False),
        ([], False),
    ],
)
def test_validate_user_is_admin(principals, expected):
    request = fake_request(principals=principals)

    assert notification_status.validate_user_is_admin(request) is expected


@pytest.mark.parametrize("view", ALL_VIEWS)
@pytest.mark.parametrize("principals", [NON_ADMIN_PRINCIPALS, ["system.Everyone"]])
def test_views_reject_non_admin(view, principals, monkeypatch):
    # The guard must run before any search, write or AWS call is attempted.
    search = mock_search(monkeypatch, [])
    sns = mock_sns(monkeypatch)
    request = fake_request(principals=principals, json_body={"date_from": "2026-01-01"})

    response = view(None, request)

    assert response == {"error": notification_status.ADMIN_ONLY_ERROR}
    search.assert_not_called()
    request.invoke_subrequest.assert_not_called()
    sns.publish.assert_not_called()
    sns.list_subscriptions_by_topic.assert_not_called()


def test_get_notification_status_maps_search_results(monkeypatch):
    mock_search(
        monkeypatch,
        [
            {
                "uuid": "abc",
                "subject": "Release",
                "body": "- a file",
                "notification_type": "data_release",
                "date_sent": "2026-09-01T00:00:00+00:00",
                "date_created": "2026-09-01T00:00:00+00:00",
                "submitted_by": {
                    "uuid": "user-uuid",
                    "display_title": "Admin User",
                },
            }
        ],
    )
    request = fake_request()

    response = notification_status.get_notification_status(None, request)

    (notification,) = response["email_notifications"]
    assert notification["subject"] == "Release"
    # The frontend reads `sent_by`; it is sourced from the `submitted` mixin's
    # `submitted_by`, which the write path fills in from the request userid.
    assert notification["sent_by"] == {
        "uuid": "user-uuid",
        "display_title": "Admin User",
    }


def test_get_notification_status_reports_search_failure(monkeypatch):
    monkeypatch.setattr(
        notification_status, "make_search_subreq", Mock(return_value=Mock())
    )
    monkeypatch.setattr(
        notification_status, "search", Mock(side_effect=ValueError("boom"))
    )
    request = fake_request()

    response = notification_status.get_notification_status(None, request)

    assert "error" in response


def test_get_released_files_text_requires_date_from(monkeypatch):
    mock_search(monkeypatch, [])
    request = fake_request(json_body={})

    response = notification_status.get_released_files_text(None, request)

    assert response == {"error": "date_from is required"}


def test_get_released_files_text_builds_list(monkeypatch):
    mock_search(
        monkeypatch,
        [
            {"display_title": "SMAFI1.fastq.gz"},
            {"accession": "SMAFI2"},
            {"uuid": "no-title-uuid"},
            {},
        ],
    )
    request = fake_request(json_body={"date_from": "2026-08-01"})

    response = notification_status.get_released_files_text(None, request)

    # Plain text, not Markdown: a setext underline rather than `####`, since
    # SNS delivers the body verbatim over its `email` protocol.
    assert response["text"] == (
        "Files Released Since 2026-08-01\n"
        + "-" * len("Files Released Since 2026-08-01") + "\n"
        "\n"
        "- SMAFI1.fastq.gz\n"
        "- SMAFI2\n"
        "- no-title-uuid\n"
        f"- {notification_status.UNNAMED_FILE}"
    )
    # Everything that reaches a plain-text email must be ASCII.
    assert response["text"].isascii()
    # No trailing newline: the composer appends this with '\n\n' + text.
    assert not response["text"].endswith("\n")


def test_get_released_files_text_handles_empty_result(monkeypatch):
    mock_search(monkeypatch, [])
    request = fake_request(json_body={"date_from": "2026-08-01"})

    response = notification_status.get_released_files_text(None, request)

    # A bare heading with nothing under it reads as a bug to the operator.
    assert response["text"] == "No files were released since 2026-08-01."


@pytest.mark.parametrize(
    "body,expected",
    [
        ({"body": "x", "notification_type": "data_release"}, "subject is required"),
        ({"subject": "x", "notification_type": "data_release"}, "body is required"),
        ({"subject": "x", "body": "y"}, "notification_type is required"),
    ],
)
def test_send_notification_email_validates_payload(body, expected):
    # A valid target, so each case asserts the field it names rather than
    # tripping the target guard that runs after these three.
    request = fake_request(json_body={**body, "target": "all"})

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": expected}


@pytest.mark.parametrize(
    "subject,expected",
    [
        ("a" * 101, notification_status.SUBJECT_TOO_LONG_ERROR),
        (" leading space", notification_status.SUBJECT_INVALID_ERROR),
        # A `$`-anchored pattern would let this through: Python's `$` also
        # matches immediately before a trailing newline.
        ("Release\n", notification_status.SUBJECT_INVALID_ERROR),
        ("Two\nlines", notification_status.SUBJECT_INVALID_ERROR),
        ("em dash \u2014 here", notification_status.SUBJECT_INVALID_ERROR),
        ("curly \u201cquote\u201d", notification_status.SUBJECT_INVALID_ERROR),
    ],
)
def test_send_notification_email_rejects_invalid_subject(
    subject, expected, monkeypatch
):
    sns = mock_sns(monkeypatch)
    request = fake_request(
        json_body={
            "subject": subject,
            "body": "y",
            "notification_type": "data_release",
            "target": "test",
        }
    )

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": expected}
    request.invoke_subrequest.assert_not_called()
    # A subject SNS would reject must never reach the Publish call.
    sns.publish.assert_not_called()


@pytest.mark.parametrize(
    "subject",
    [
        "SMaHT Data Portal: New Data Release",
        "a" * notification_status.SUBJECT_MAX_LENGTH,
        "!starts with punctuation",
    ],
)
def test_send_notification_email_accepts_valid_subject(subject, monkeypatch):
    mock_sns(monkeypatch)
    monkeypatch.setattr(
        notification_status,
        "make_subrequest",
        Mock(return_value=SimpleNamespace(content_type=None)),
    )
    request = fake_request(
        json_body={
            "subject": subject,
            "body": "y",
            "notification_type": "data_release",
            "target": "all",
        }
    )
    request.invoke_subrequest.return_value = SimpleNamespace(
        status_int=201, json_body={"@graph": [{"uuid": "new-uuid"}]}
    )

    response = notification_status.send_notification_email(None, request)

    assert response["status"] == "ok"


@pytest.mark.parametrize("target", [None, "", "everyone", True, "TEST"])
def test_send_notification_email_rejects_unknown_target(target, monkeypatch):
    sns = mock_sns(monkeypatch)
    json_body = {
        "subject": "x",
        "body": "y",
        "notification_type": "data_release",
    }
    if target is not None:
        json_body["target"] = target
    request = fake_request(json_body=json_body)

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": notification_status.TARGET_INVALID_ERROR}
    request.invoke_subrequest.assert_not_called()
    sns.publish.assert_not_called()


def test_send_notification_email_records_item(monkeypatch):
    make_subrequest = Mock(return_value=SimpleNamespace(content_type=None))
    monkeypatch.setattr(notification_status, "make_subrequest", make_subrequest)
    sns = mock_sns(monkeypatch)
    request = fake_request(
        json_body={
            "subject": "Release",
            "body": "- a file",
            "notification_type": "data_release",
            "target": "all",
        }
    )
    request.invoke_subrequest.return_value = SimpleNamespace(
        status_int=201, json_body={"@graph": [{"uuid": "new-uuid"}]}
    )

    response = notification_status.send_notification_email(None, request)

    assert response == {
        "status": "ok",
        "uuid": "new-uuid",
        "target": "all",
        "sent": True,
        "recorded": True,
    }
    sns.publish.assert_called_once_with(
        TopicArn=TOPIC_ARN, Subject="Release", Message="- a file"
    )
    item_data = make_subrequest.call_args.kwargs["json_body"]
    assert item_data["subject"] == "Release"
    assert item_data["notification_type"] == "data_release"
    # date_sent means what it says: the mail really went out.
    assert item_data["date_sent"]
    # `sent_by` must not be set here: get_userid() returns a NO_DEFAULT
    # sentinel (not None) for admin principals without a userid, such as
    # remoteuser.TEST, and json-encoding that raises TypeError. The
    # `submitted` mixin fills in `submitted_by` on the write path instead.
    assert "sent_by" not in item_data


def valid_test_payload(**overrides):
    return {
        "subject": "Release",
        "body": "- a file",
        "notification_type": "data_release",
        "target": "test",
        **overrides,
    }


def test_send_notification_email_test_target_publishes(monkeypatch):
    sns = mock_sns(monkeypatch)
    request = fake_request(json_body=valid_test_payload())

    response = notification_status.send_notification_email(None, request)

    assert response == {
        "status": "ok",
        "target": "test",
        "sent": True,
        "recorded": False,
    }
    # The dry-run topic, never the configured one: publishing `test` there
    # would mail the entire consortium. `records_item` pins the `all` side.
    sns.publish.assert_called_once_with(
        TopicArn=DRY_RUN_TOPIC_ARN, Subject="Release", Message="- a file"
    )
    # A dry run leaves no trace in Previous Messages.
    request.invoke_subrequest.assert_not_called()


@pytest.mark.parametrize("target", ["test", "all"])
def test_send_notification_email_reports_publish_failure(target, monkeypatch):
    # A fixed string, asserted exactly: a ClientError stringifies to the
    # caller's role ARN, account ID and topic ARN, and the generic
    # `except Exception` handler would interpolate all three into the browser.
    sns = mock_sns(monkeypatch)
    sns.publish.side_effect = ClientError(
        {"Error": {"Code": "AuthorizationError"}}, "Publish"
    )
    request = fake_request(json_body=valid_test_payload(target=target))

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": notification_status.SNS_PUBLISH_ERROR}
    # Nothing recorded: a row for mail that never went out is worse than none.
    request.invoke_subrequest.assert_not_called()


@pytest.mark.parametrize("target", ["test", "all"])
@pytest.mark.parametrize(
    "body",
    [
        "a" * (notification_status.BODY_MAX_BYTES + 1),
        # Under the character cap but over the byte cap -- the case a naive
        # len() would wave through and SNS would then reject.
        "é" * (notification_status.BODY_MAX_BYTES // 2 + 1),
    ],
)
def test_send_notification_email_rejects_oversized_body(
    body, target, monkeypatch
):
    sns = mock_sns(monkeypatch)
    request = fake_request(
        json_body=valid_test_payload(body=body, target=target)
    )

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": notification_status.BODY_TOO_LONG_ERROR}
    sns.publish.assert_not_called()
    request.invoke_subrequest.assert_not_called()


def test_send_notification_email_accepts_body_at_limit(monkeypatch):
    sns = mock_sns(monkeypatch)
    body = "a" * notification_status.BODY_MAX_BYTES
    request = fake_request(json_body=valid_test_payload(body=body))

    response = notification_status.send_notification_email(None, request)

    assert response["sent"] is True
    assert sns.publish.call_args.kwargs["Message"] == body


def subscription(endpoint, subscription_arn=SUBSCRIPTION_ARN, protocol="email"):
    return {
        "Protocol": protocol,
        "Endpoint": endpoint,
        "SubscriptionArn": subscription_arn,
    }


def listing(*pages):
    """Build a `list_subscriptions_by_topic` side effect from page contents."""
    responses = [{"Subscriptions": list(page)} for page in pages]
    for index, response in enumerate(responses[:-1]):
        response["NextToken"] = f"page-{index + 2}"
    return responses


def test_get_email_recipients_splits_confirmed_and_pending(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [
            subscription("confirmed@example.org"),
            subscription("waiting@example.org", notifications.PENDING_CONFIRMATION),
        ]
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    assert response == {
        "target": "test",
        "confirmed_count": 1,
        "pending_count": 1,
        "confirmed": ["confirmed@example.org"],
        "pending": ["waiting@example.org"],
    }


@pytest.mark.parametrize(
    "target,expected_topic",
    [
        ("test", DRY_RUN_TOPIC_ARN),
        ("all", TOPIC_ARN),
    ],
)
def test_get_email_recipients_reads_only_its_own_topic(
    target, expected_topic, monkeypatch
):
    # The mirror of the publish test: listing the configured topic for a dry
    # run would put every real subscriber's address on an admin page.
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [subscription("first@example.org")],
        [subscription("second@example.org")],
    )
    request = fake_request(json_body={"target": target})

    response = notification_status.get_email_recipients(None, request)

    # Both pages: a NextToken followed against the wrong topic would be as
    # wrong as the first call being wrong.
    assert sns.list_subscriptions_by_topic.call_args_list == [
        call(TopicArn=expected_topic),
        call(TopicArn=expected_topic, NextToken="page-2"),
    ]
    # And both pages counted: a truncated list would tell the operator the
    # mail reaches fewer people than it does.
    assert response["confirmed_count"] == 2


def test_get_email_recipients_deduplicates_case_insensitively(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [subscription("Admin@Example.org"), subscription("admin@example.org")]
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    # One row, spelled the way SNS holds it -- that is what the operator will
    # match against the console and against their own inbox.
    assert response["confirmed"] == ["Admin@Example.org"]


def test_get_email_recipients_prefers_confirmed_over_pending(monkeypatch):
    # A Subscribe against an already-confirmed address leaves a pending
    # duplicate. The address does receive the mail, so it must not also be
    # listed under the block that says it will not.
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [
            subscription("admin@example.org", notifications.PENDING_CONFIRMATION),
            subscription("ADMIN@example.org"),
        ]
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    assert response == {
        "target": "test",
        # Deduplicated before counting, so the pending duplicate cannot
        # inflate the number an operator is asked to confirm.
        "confirmed_count": 1,
        "pending_count": 0,
        "confirmed": ["ADMIN@example.org"],
        "pending": [],
    }


def test_get_email_recipients_drops_deleted_and_other_protocols(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [
            subscription("gone@example.org", notifications.DELETED),
            subscription("queue", protocol="sqs"),
            subscription("lambda-arn", protocol="lambda"),
        ]
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    # `Deleted` was cancelled through the AWS unsubscribe link: nothing is
    # outstanding, so reporting it as "not yet confirmed" would be wrong.
    # And an empty result is not an error: the frontend disables Confirm on
    # it rather than publishing to a topic that reaches nobody.
    assert response == {
        "target": "test",
        "confirmed_count": 0,
        "pending_count": 0,
        "confirmed": [],
        "pending": [],
    }


def test_get_email_recipients_sorts_case_insensitively(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [
            subscription("zoe@example.org"),
            subscription("Adam@example.org"),
            subscription("bo@example.org"),
        ]
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    assert response["confirmed"] == [
        "Adam@example.org",
        "bo@example.org",
        "zoe@example.org",
    ]


def test_get_email_recipients_never_returns_subscription_arns(monkeypatch):
    # A SubscriptionArn is the topic ARN plus a UUID, so returning one leaks
    # the AWS account ID exactly as returning the topic would.
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [subscription("admin@example.org")]
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    serialized = json.dumps(response)
    assert "arn:aws" not in serialized
    assert "123456789012" not in serialized


def test_get_email_recipients_reports_list_failure(monkeypatch):
    # A fixed string, asserted exactly, so no AWS detail can reach the browser.
    # The generator is lazy, so the boto error surfaces during iteration rather
    # than at the call that builds it: the `except (BotoCoreError, ClientError)`
    # arm has to wrap the consumption, not just its construction.
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = ClientError(
        {"Error": {"Code": "AuthorizationError"}}, "ListSubscriptionsByTopic"
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    assert response == {"error": notification_status.SNS_RECIPIENTS_ERROR}


@pytest.mark.parametrize("target", ["", "Test", "ALL", "everyone", None])
def test_get_topic_for_target_refuses_unknown_targets(target):
    # It must raise rather than fall through to the configured topic, which is
    # what an `else` arm would do for every one of these.
    with pytest.raises(ValueError):
        notification_status.get_topic_for_target(fake_request(), target)


def test_send_notification_email_publishes_before_recording(monkeypatch):
    # Order matters and is not incidental: a record written before a publish
    # that then fails leaves Previous Messages asserting a delivery that never
    # happened, which nobody has reason to doubt.
    calls = []
    sns = mock_sns(monkeypatch)
    sns.publish.side_effect = lambda **kwargs: calls.append("publish")
    monkeypatch.setattr(
        notification_status,
        "make_subrequest",
        Mock(return_value=SimpleNamespace(content_type=None)),
    )
    request = fake_request(json_body=valid_test_payload(target="all"))
    request.invoke_subrequest.side_effect = lambda *a, **k: (
        calls.append("record")
        or SimpleNamespace(status_int=201, json_body={"@graph": [{"uuid": "u"}]})
    )

    notification_status.send_notification_email(None, request)

    assert calls == ["publish", "record"]


@pytest.mark.parametrize(
    "outcome",
    [
        {"return_value": SimpleNamespace(
            status_int=422, json_body={"description": "invalid"})},
        {"return_value": SimpleNamespace(status_int=500, json_body={})},
        # invoke_subrequest runs the inner POST through the tween chain, so a
        # rejected write can raise rather than return a 4xx.
        {"side_effect": RuntimeError("validation failed")},
    ],
)
def test_send_notification_email_partial_success_is_never_an_error(
    outcome, monkeypatch
):
    # A failed record after a successful publish must not surface as an error:
    # the frontend reads {"error": ...} as "nothing happened", and re-sending
    # would mail the consortium twice.
    monkeypatch.setattr(
        notification_status,
        "make_subrequest",
        Mock(return_value=SimpleNamespace(content_type=None)),
    )
    sns = mock_sns(monkeypatch)
    request = fake_request(json_body=valid_test_payload(target="all"))
    request.invoke_subrequest.configure_mock(**outcome)

    response = notification_status.send_notification_email(None, request)

    assert response == {
        "status": "ok",
        "target": "all",
        "sent": True,
        "recorded": False,
    }
    sns.publish.assert_called_once()


@pytest.mark.parametrize(
    "user_email,expected", [(ALLOWED_SENDER, True), (BLOCKED_SENDER, False)]
)
def test_get_notification_status_reports_send_permission(
    user_email, expected, monkeypatch
):
    # The page disables its send-to-all button from this flag. It is a UI
    # convenience only -- `send_notification_email` re-checks on every request.
    mock_search(monkeypatch, [])
    request = fake_request(user_email=user_email)

    response = notification_status.get_notification_status(None, request)

    assert response["can_notify_all"] is expected


@pytest.mark.parametrize(
    "user_email,expected",
    [
        (ALLOWED_SENDER, True),
        # Normalized before comparison, so a profile stored with different
        # casing or stray whitespace is still the same person.
        (f"  {ALLOWED_SENDER.upper()} ", True),
        (BLOCKED_SENDER, False),
        # No User item behind the principals at all: fails closed.
        (None, False),
    ],
)
def test_validate_user_may_notify_all(user_email, expected):
    request = fake_request(user_email=user_email)

    assert notification_status.validate_user_may_notify_all(request) is expected


def test_send_notification_email_blocks_an_unlisted_sender(monkeypatch):
    # The gate has to run before SNS, not just change the response: once
    # publish is called the consortium has the mail whatever we return.
    sns = mock_sns(monkeypatch)
    request = fake_request(
        json_body=valid_test_payload(target="all"), user_email=BLOCKED_SENDER
    )

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": notification_status.SENDER_NOT_ALLOWED_ERROR}
    sns.publish.assert_not_called()
    request.invoke_subrequest.assert_not_called()


def test_send_notification_email_lets_any_admin_send_a_test(monkeypatch):
    # The restriction is on the audience, not on the page: an admin who may not
    # mail the consortium can still dry-run a draft.
    sns = mock_sns(monkeypatch)
    request = fake_request(
        json_body=valid_test_payload(target="test"), user_email=BLOCKED_SENDER
    )

    response = notification_status.send_notification_email(None, request)

    assert response["sent"] is True
    sns.publish.assert_called_once()


def test_get_email_recipients_withholds_addresses_for_the_real_topic(monkeypatch):
    # The dry-run topic holds the handful of admins reading this page; the
    # configured topic holds every subscriber in the consortium, and its
    # dialog needs a number, not a mailing list.
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [
            subscription("one@example.org"),
            subscription("two@example.org"),
            subscription("waiting@example.org", notifications.PENDING_CONFIRMATION),
        ]
    )
    request = fake_request(json_body={"target": "all"})

    response = notification_status.get_email_recipients(None, request)

    assert response == {
        "target": "all",
        "confirmed_count": 2,
        "pending_count": 1,
    }
    serialized = json.dumps(response)
    assert "example.org" not in serialized


@pytest.mark.parametrize("target", [None, "", "everyone", "TEST"])
def test_get_email_recipients_rejects_unknown_target(target, monkeypatch):
    boto_client = Mock()
    monkeypatch.setattr(notification_status, "boto_client", boto_client)
    json_body = {"target": target} if target is not None else {}
    request = fake_request(json_body=json_body)

    response = notification_status.get_email_recipients(None, request)

    assert response == {"error": notification_status.TARGET_INVALID_ERROR}
    boto_client.assert_not_called()


def mock_release_summary(monkeypatch, released_graph=(), retracted_graph=()):
    # The subrequest is its own path, so the search mock can tell the two
    # searches apart by their query.
    monkeypatch.setattr(
        notification_status, "make_search_subreq",
        Mock(side_effect=lambda request, path, **kwargs: path),
    )

    def search(context, path):
        retracted = "status=retracted" in path
        return {"@graph": list(retracted_graph if retracted else released_graph)}

    search_mock = Mock(side_effect=search)
    monkeypatch.setattr(notification_status, "search", search_mock)
    return search_mock


def file_hit(title=None, description=None, donors=(), tissue=True):
    """A search hit carrying the fields the overview and labels read."""
    hit = {"donors": [{"display_title": donor} for donor in donors]}
    if title:
        hit["release_tracker_title"] = title
    if description:
        hit["release_tracker_description"] = description
    if tissue:
        hit["sample_summary"] = {"tissues": ["Lung"]}
    return hit


def test_format_release_summary_renders_the_template():
    # Chosen so that count order and name order disagree everywhere: ST002
    # has more files than ST001, and within ST001 the WGS line has more
    # files than the alphabetically earlier Fiber-seq one.
    totals = {
        ("ST001", "Fiber-seq PacBio Revio bam"): 1,
        ("ST001", "WGS Illumina NovaSeq X bam"): 2,
        ("ST002", "WGS Illumina NovaSeq X cram"): 6,
    }
    released = [
        file_hit("ST001", donors=["SMHT001"]),
        file_hit("ST002", donors=["SMHT002"]),
    ]
    retracted = [
        file_hit("ST003", "Fiber-seq PacBio Revio bam", donors=["SMHT003"]),
    ]

    # A window starting mid-month, which still links the whole month.
    text = notification_status.format_release_summary(
        totals, "2026-08-15", "2026-09-01", released, retracted,
        {"ST001": "Male, 57 yrs-old"})

    released_heading = ("Data Files Released Between 2026-08-15 and 2026-09-01"
                        " on the SMaHT Data Portal")
    rule = "-" * len(released_heading)
    assert text == (
        f"{rule}\n{released_heading}\n{rule}\n"
        "* For the SMaHT Network members with Data Use Agreements"
        " established for data access *\n"
        "\n"
        f"{notification_status.RELEASE_SUMMARY_UNSUBSCRIBE}\n"
        "\n"
        "\n"
        # The sum of the full list printed below it: 1 + 2 + 6.
        "NEW DATA - 9 FILES\n"
        " - 2 donors\n"
        " - 2 tissue samples\n"
        " - 2 assays / categories\n"
        # The BAM and CRAM of one assay are one entry.
        "    - WGS Illumina NovaSeq X\n"
        "    - Fiber-seq PacBio Revio\n"
        "\n"
        "LINK TO NEW DATA RELEASED:\n"
        "https://data.smaht.org/recent-releases"
        "?view=monthly&date=2026-08-01&month=2026-08\n"
        "\n"
        "\n"
        "RETRACTED DATA: 1 FILE\n"
        " - 1 donor\n"
        " - 1 tissue sample\n"
        " - 1 assay / category\n"
        "    - Fiber-seq PacBio Revio\n"
        "\n"
        "LINK TO ALL RETRACTED DATA:\n"
        "https://data.smaht.org/retracted-files\n"
        "\n"
        "\n"
        "FULL LIST OF THE NEW DATA RELEASED\n"
        "\n"
        # Titles by name, so a donor's tissues stay together; a label only
        # where there is one.
        "ST001 (Male, 57 yrs-old)\n"
        # Lines within a title by count, then name.
        "  - 2 WGS Illumina NovaSeq X BAM\n"
        "  - 1 Fiber-seq PacBio Revio BAM\n"
        "\n"
        "ST002\n"
        "  - 6 WGS Illumina NovaSeq X CRAM"
    )
    # No trailing newline: the composer appends this with '\n\n' + text.
    assert not text.endswith("\n")


def test_format_release_summary_without_any_files():
    text = notification_status.format_release_summary(
        {}, "2026-08-01", "2026-09-01", [], [])

    lines = text.splitlines()
    # Headline and link only: "0 donors" under "0 FILES" says nothing.
    assert lines[lines.index("NEW DATA - 0 FILES") + 1] == ""
    assert lines[lines.index("RETRACTED DATA: 0 FILES") + 1] == ""
    assert not any(line.lstrip().startswith("- ") for line in lines)
    assert notification_status.FULL_LIST_HEADING not in text
    assert text.endswith(notification_status.RETRACTED_FILES_URL)


def test_format_release_summary_counts_every_retracted_file():
    # Retractions without any releases still get their section. A retracted
    # file with no tracker description still counts as retracted, it just has
    # no assay entry to show.
    retracted = [file_hit("T1", "a bam", ["D1"]), file_hit("T1", donors=["D1"])]

    text = notification_status.format_release_summary(
        {}, "2026-08-01", "2026-09-01", [], retracted)

    assert "NEW DATA - 0 FILES" in text
    assert ("RETRACTED DATA: 2 FILES\n - 1 donor\n - 1 tissue sample\n"
            " - 1 assay / category\n    - a\n") in text
    assert notification_status.FULL_LIST_HEADING not in text


@pytest.mark.parametrize("description,expected", [
    ("CompDuplex-seq Illumina NovaSeq X Plus bam",
     "CompDuplex-seq Illumina NovaSeq X Plus"),
    ("Filtered somatic SNV vcf vcf_gz", "Filtered somatic SNV vcf"),
    ("bam", "bam"),
])
def test_assay_label_drops_the_file_format(description, expected):
    assert notification_status.assay_label(description) == expected


def test_build_overview_counts_donors_tissues_and_cell_lines():
    totals = {("T1", "a bam"): 2, ("T2", "a bam"): 1, ("COLO829T", "a bam"): 2}
    hits = [
        file_hit("T1", donors=["D1"]),
        file_hit("T1", donors=["D1"]),
        file_hit("T2", donors=["D1", "D2"]),
        file_hit("COLO829T", tissue=False),
        # Only titles in the counts: a hit the totals left out is not one.
        file_hit("T3"),
    ]

    overview = notification_status.build_overview(totals, hits, 5)

    assert overview.donor_count == 2
    assert overview.tissue_count == 2
    assert overview.other_count == 1
    # Printed only when present; its absence is pinned by the template test.
    assert " - 1 cell line / mixture" in notification_status.format_overview(
        notification_status.RELEASED_HEADLINE, overview)


def test_build_overview_orders_assays_by_count_then_name():
    totals = {
        ("T1", "b-seq bam"): 1,
        ("T1", "a-seq bam"): 1,
        ("T2", "c-seq bam"): 1,
        ("T2", "c-seq cram"): 2,
    }
    overview = notification_status.build_overview(totals, [], 5)

    assert overview.assays == {"a-seq": 1, "b-seq": 1, "c-seq": 3}
    lines = notification_status.format_overview(
        notification_status.RELEASED_HEADLINE, overview)
    assert lines[-3:] == ["    - c-seq", "    - a-seq", "    - b-seq"]


def test_totals_from_hits_skips_files_without_tracker_fields():
    hits = [
        file_hit("T1", "a bam"),
        file_hit("T1", "a bam"),
        file_hit("T1"),
        file_hit(description="a bam"),
    ]

    assert notification_status.totals_from_hits(hits) == {("T1", "a bam"): 2}


def donor_hit(title, *donors):
    return {
        "release_tracker_title": title,
        "donors": [{"sex": sex, "age": age} for sex, age in donors],
    }


@pytest.mark.parametrize("hits,expected", [
    ([donor_hit("T1", ("Male", 57))], {"T1": "Male, 57 yrs-old"}),
    # The schema stores every age above 89 as 89.
    ([donor_hit("T1", ("Female", 89))], {"T1": "Female, 89+ yrs-old"}),
    # Every file of a title agreeing on one donor still gives one label.
    ([donor_hit("T1", ("Male", 57)), donor_hit("T1", ("Male", 57))],
     {"T1": "Male, 57 yrs-old"}),
    # Two donors under one title: no guessing.
    ([donor_hit("T1", ("Male", 57)), donor_hit("T1", ("Female", 40))], {}),
    ([donor_hit("T1", ("Male", 57), ("Female", 40))], {}),
    ([donor_hit("T1", ("Unknown", 57))], {}),
    ([donor_hit("T1", ("Male", None))], {}),
    ([donor_hit("COLO829T")], {}),
    ([{"donors": [{"sex": "Male", "age": 57}]}], {}),
])
def test_title_donor_labels(hits, expected):
    assert notification_status.title_donor_labels(hits) == expected


def test_search_released_files_queries_released_files_in_window(monkeypatch):
    mock_search(monkeypatch, [file_hit("T1")])

    hits = notification_status.search_released_files(
        None, fake_request(), "2026-09-01", "2026-09-30")

    assert hits == [file_hit("T1")]
    path = notification_status.make_search_subreq.call_args.args[1]
    query = parse_qs(path.split("?", 1)[1])
    assert query["type"] == ["File"]
    assert set(query["status"]) == set(
        notification_status.QUERY_FILE_STATUSES)
    assert query["file_status_tracking.release_dates.initial_release.from"] \
        == ["2026-09-01"]
    assert query["file_status_tracking.release_dates.initial_release.to"] \
        == ["2026-09-30"]
    assert query["release_tracker_title!"] == ["No value"]
    assert query["field"] == [
        "release_tracker_title", "release_tracker_description",
        "donors.display_title", "donors.sex", "donors.age",
        "sample_summary.tissues",
    ]
    assert query["limit"] == ["all"]
    # The release tracker's own exclusions, so these are the files it shows.
    assert query["sample_summary.studies"] == ["Production"]
    assert query["data_category!"] == ["Quality Control"]
    assert query["tags!"] == ["exclude_from_release_tracker"]
    assert query["dataset!"] == ["No value"]
    assert query["release_tracker_description!"] == ["No value"]


def released_search_query(make_search_subreq):
    """The query of the released-files search, the first of the two."""
    path = make_search_subreq.call_args_list[0].args[1]
    assert "status=retracted" not in path
    return parse_qs(path.split("?", 1)[1])


def test_get_released_files_summary_requires_date_from(monkeypatch):
    search = mock_release_summary(monkeypatch)
    request = fake_request(json_body={})

    response = notification_status.get_released_files_summary(None, request)

    assert response == {"error": "date_from is required"}
    search.assert_not_called()


def test_get_released_files_summary_builds_text(monkeypatch):
    donor = {"display_title": "SMHT001", "sex": "Male", "age": 57}

    def hit(description):
        return {**file_hit("ST001", description), "donors": [donor]}

    mock_release_summary(monkeypatch, released_graph=[
        hit("WGS Illumina NovaSeq X bam"),
        hit("WGS Illumina NovaSeq X bam"),
        hit("WGS Illumina NovaSeq X cram"),
    ])
    request = fake_request(
        json_body={"date_from": "2026-08-01", "date_to": "2026-10-01"})

    response = notification_status.get_released_files_summary(None, request)

    assert "Released Between 2026-08-01 and 2026-10-01" in response["text"]
    assert ("NEW DATA - 3 FILES\n - 1 donor\n - 1 tissue sample\n"
            " - 1 assay / category\n    - WGS Illumina NovaSeq X\n"
            ) in response["text"]
    # One line per (title, description), counted from the hits, under a title
    # labeled from the same hits.
    assert ("ST001 (Male, 57 yrs-old)\n  - 2 WGS Illumina NovaSeq X BAM\n"
            "  - 1 WGS Illumina NovaSeq X CRAM") in response["text"]


def test_get_released_files_summary_summarizes_retracted_in_window(monkeypatch):
    mock_release_summary(monkeypatch, retracted_graph=[
        file_hit("T1", "a bam", ["D1"]),
        file_hit("T2", "a cram", ["D2"]),
    ])
    request = fake_request(
        json_body={"date_from": "2026-08-01", "date_to": "2026-09-30"})

    response = notification_status.get_released_files_summary(None, request)

    assert ("RETRACTED DATA: 2 FILES\n - 2 donors\n - 2 tissue samples\n"
            " - 1 assay / category\n    - a\n") in response["text"]
    # The same set the Retracted Files page lists, bounded to the window.
    path = notification_status.make_search_subreq.call_args.args[1]
    query = parse_qs(path.split("?", 1)[1])
    assert query["type"] == ["File"]
    assert query["status"] == ["retracted"]
    assert query[
        "file_status_tracking.release_dates.initial_release_date!"
    ] == ["No value"]
    assert query[
        "file_status_tracking.status_tracking.retracted.from"] == ["2026-08-01"]
    assert query[
        "file_status_tracking.status_tracking.retracted.to"] == ["2026-09-30"]
    assert query["limit"] == ["all"]
    assert query["field"] == [
        "release_tracker_title", "release_tracker_description",
        "donors.display_title", "sample_summary.tissues",
    ]


@pytest.mark.parametrize("date_to,expected_to", [
    # The caller's end date, not "today": the whole point of the second picker
    # is being able to summarize a month that has already ended.
    ("2020-02-01", "2020-02-01"),
    # Back-compat for a client that still sends only date_from.
    (None, datetime.now(timezone.utc).date().isoformat()),
])
def test_get_released_files_summary_queries_the_window(
        date_to, expected_to, monkeypatch):
    mock_release_summary(monkeypatch)
    json_body = {"date_from": "2020-01-01"}
    if date_to:
        json_body["date_to"] = date_to
    request = fake_request(json_body=json_body)

    response = notification_status.get_released_files_summary(None, request)

    query = released_search_query(notification_status.make_search_subreq)
    assert query["file_status_tracking.release_dates.initial_release.from"] \
        == ["2020-01-01"]
    assert query["file_status_tracking.release_dates.initial_release.to"] \
        == [expected_to]
    # Nothing found is a summary saying so, not an error.
    assert "NEW DATA - 0 FILES" in response["text"]
    assert "RETRACTED DATA: 0 FILES" in response["text"]


def test_get_released_files_summary_reports_failure(monkeypatch):
    mock_release_summary(monkeypatch)
    monkeypatch.setattr(
        notification_status,
        "search",
        Mock(side_effect=RuntimeError("index_not_found_exception [files-idx]")),
    )
    request = fake_request(json_body={"date_from": "2026-08-01"})

    response = notification_status.get_released_files_summary(None, request)

    # A fixed string: an OpenSearch error stringifies to index and host detail.
    assert response == {"error": notification_status.RELEASE_SUMMARY_ERROR}
    assert "files-idx" not in response["error"]


# Router-level tests: exercise route registration and the POST-only
# configuration through a real Pyramid router, with no database or search.


def notification_status_router_app(principals=ADMIN_PRINCIPALS):
    config = Configurator()
    config.include("snovault.json_renderer")
    config.include("encoded.notification_status")
    config.testing_securitypolicy(userid="test", permissive=True)
    config.add_request_method(
        lambda request: principals, "effective_principals", reify=True
    )
    return webtest.TestApp(config.make_wsgi_app())


@pytest.mark.parametrize("route", ALL_ROUTES)
def test_router_routes_are_post_only(route):
    testapp = notification_status_router_app()

    testapp.get(route, status=404)


@pytest.mark.parametrize("route", ALL_ROUTES)
def test_router_routes_reject_non_admin(route):
    testapp = notification_status_router_app(principals=NON_ADMIN_PRINCIPALS)

    response = testapp.post_json(route, {}, status=200)

    assert response.json == {"error": notification_status.ADMIN_ONLY_ERROR}


@pytest.mark.parametrize(
    "route,payload",
    [
        ("/get_email_recipients/", {"target": "test"}),
        ("/send_notification_email/", valid_test_payload()),
    ],
)
def test_router_reports_missing_topic(route, payload, monkeypatch):
    # The harness registers no `sns_topic`, standing in for an environment
    # where notifications were never configured. Nothing should reach AWS.
    boto_client = Mock()
    monkeypatch.setattr(notification_status, "boto_client", boto_client)
    testapp = notification_status_router_app()

    response = testapp.post_json(route, payload, status=200)

    assert response.json == {
        "error": notification_status.NOTIFICATIONS_UNAVAILABLE_ERROR
    }
    boto_client.assert_not_called()
