import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, call

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


def test_send_notification_email_survives_subrequest_exception(monkeypatch):
    # invoke_subrequest runs the inner POST through the tween chain, so a
    # rejected write can raise rather than return a 4xx. The mail is already
    # out by then, so this is a partial success, not an error.
    sns = mock_sns(monkeypatch)
    monkeypatch.setattr(
        notification_status,
        "make_subrequest",
        Mock(return_value=SimpleNamespace(content_type=None)),
    )
    request = fake_request(
        json_body={
            "subject": "Release",
            "body": "- a file",
            "notification_type": "bogus",
            "target": "all",
        }
    )
    request.invoke_subrequest.side_effect = RuntimeError("validation failed")

    response = notification_status.send_notification_email(None, request)

    assert response == {
        "status": "ok",
        "target": "all",
        "sent": True,
        "recorded": False,
    }
    sns.publish.assert_called_once()


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
    sns.publish.assert_called_once_with(
        TopicArn=DRY_RUN_TOPIC_ARN, Subject="Release", Message="- a file"
    )
    # A dry run leaves no trace in Previous Messages.
    request.invoke_subrequest.assert_not_called()


def test_send_notification_email_reports_missing_topic(monkeypatch):
    boto_client = Mock()
    monkeypatch.setattr(notification_status, "boto_client", boto_client)
    request = fake_request(topic=None, json_body=valid_test_payload())

    response = notification_status.send_notification_email(None, request)

    assert response == {
        "error": notification_status.NOTIFICATIONS_UNAVAILABLE_ERROR
    }
    # An unconfigured environment must not even construct a client.
    boto_client.assert_not_called()


def test_send_notification_email_reports_publish_failure(monkeypatch):
    # A fixed string, asserted exactly: a ClientError stringifies to the
    # caller's role ARN, account ID and topic ARN, and the generic
    # `except Exception` handler would interpolate all three into the browser.
    sns = mock_sns(monkeypatch)
    sns.publish.side_effect = ClientError(
        {"Error": {"Code": "AuthorizationError"}}, "Publish"
    )
    request = fake_request(json_body=valid_test_payload())

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": notification_status.SNS_PUBLISH_ERROR}


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
    sns.list_subscriptions_by_topic.side_effect = listing([], [])
    request = fake_request(json_body={"target": target})

    notification_status.get_email_recipients(None, request)

    # Both pages: a NextToken followed against the wrong topic would be as
    # wrong as the first call being wrong.
    assert sns.list_subscriptions_by_topic.call_args_list == [
        call(TopicArn=expected_topic),
        call(TopicArn=expected_topic, NextToken="page-2"),
    ]


def test_get_email_recipients_follows_pagination(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing(
        [subscription("first@example.org")],
        [subscription("second@example.org")],
    )
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    # A second page is the realistic failure: a truncated list would tell the
    # operator the mail reaches fewer people than it does.
    assert response["confirmed"] == ["first@example.org", "second@example.org"]


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


def test_get_email_recipients_handles_empty_topic(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.list_subscriptions_by_topic.side_effect = listing([])
    request = fake_request(json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    # Not an error: the topic exists, it simply has nobody on it. The frontend
    # disables Confirm on this rather than publishing to an empty topic and
    # reporting a successful test that reached nobody.
    assert response == {
        "target": "test",
        "confirmed_count": 0,
        "pending_count": 0,
        "confirmed": [],
        "pending": [],
    }


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


def test_get_email_recipients_reports_missing_topic(monkeypatch):
    boto_client = Mock()
    monkeypatch.setattr(notification_status, "boto_client", boto_client)
    request = fake_request(topic=None, json_body={"target": "test"})

    response = notification_status.get_email_recipients(None, request)

    assert response == {
        "error": notification_status.NOTIFICATIONS_UNAVAILABLE_ERROR
    }
    # An unconfigured environment must not even construct a client.
    boto_client.assert_not_called()


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


# The mirror-image pair. Each target must reach its own topic and never the
# other's: publishing `all` to the dry-run topic silently reaches nobody, and
# publishing `test` to the configured topic mails the entire consortium.


@pytest.mark.parametrize(
    "target,expected_topic,forbidden_topic",
    [
        ("test", DRY_RUN_TOPIC_ARN, TOPIC_ARN),
        ("all", TOPIC_ARN, DRY_RUN_TOPIC_ARN),
    ],
)
def test_send_notification_email_publishes_to_the_right_topic(
    target, expected_topic, forbidden_topic, monkeypatch
):
    monkeypatch.setattr(
        notification_status,
        "make_subrequest",
        Mock(return_value=SimpleNamespace(content_type=None)),
    )
    sns = mock_sns(monkeypatch)
    request = fake_request(json_body=valid_test_payload(target=target))
    request.invoke_subrequest.return_value = SimpleNamespace(
        status_int=201, json_body={"@graph": [{"uuid": "new-uuid"}]}
    )

    response = notification_status.send_notification_email(None, request)

    assert response["sent"] is True
    published_to = sns.publish.call_args.kwargs["TopicArn"]
    assert published_to == expected_topic
    assert published_to != forbidden_topic


@pytest.mark.parametrize(
    "target,expected",
    [
        ("test", DRY_RUN_TOPIC_ARN),
        ("all", TOPIC_ARN),
    ],
)
def test_get_topic_for_target(target, expected):
    assert (
        notification_status.get_topic_for_target(fake_request(), target) == expected
    )


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
        SimpleNamespace(status_int=422, json_body={"description": "invalid"}),
        SimpleNamespace(status_int=500, json_body={}),
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
    request.invoke_subrequest.return_value = outcome

    response = notification_status.send_notification_email(None, request)

    assert "error" not in response
    assert response["sent"] is True
    assert response["recorded"] is False
    sns.publish.assert_called_once()


def test_send_notification_email_does_not_record_when_publish_fails(monkeypatch):
    sns = mock_sns(monkeypatch)
    sns.publish.side_effect = ClientError(
        {"Error": {"Code": "AuthorizationError"}}, "Publish"
    )
    request = fake_request(json_body=valid_test_payload(target="all"))

    response = notification_status.send_notification_email(None, request)

    assert response == {"error": notification_status.SNS_PUBLISH_ERROR}
    # Nothing recorded: a row for mail that never went out is worse than none.
    request.invoke_subrequest.assert_not_called()


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


def release_bucket(name, value, count, items=None):
    bucket = {"name": name, "value": value, "count": count}
    if items is not None:
        bucket["items"] = items
    return bucket


def title_bucket(title, *descriptions):
    return release_bucket(
        "release_tracker_title", title, sum(c for _, c in descriptions),
        [release_bucket("release_tracker_description", value, count)
         for value, count in descriptions],
    )


def month_bucket(month, *titles, day=None):
    """Build a release-date bucket, optionally with the day level nested in."""
    count = sum(title["count"] for title in titles)
    inner = list(titles)
    if day:
        inner = [release_bucket(
            "file_status_tracking.release_dates.initial_release_date",
            day, count, list(titles))]
    return release_bucket(
        "file_status_tracking.release_dates.initial_release",
        month, count, inner)


def mock_release_summary(monkeypatch, tree):
    summary = Mock(return_value=tree)
    monkeypatch.setattr(notification_status, "recent_files_summary", summary)
    monkeypatch.setattr(
        notification_status, "make_search_subreq", Mock(return_value=Mock())
    )
    return summary


@pytest.mark.parametrize("day", [None, "2026-09-02"])
def test_collect_release_counts_ignores_the_date_levels(day):
    # The aggregation nests release month and release day above the two fields
    # we group on, and that nesting has changed before -- so the walk must key
    # off the bucket name rather than its depth.
    tree = {"items": [month_bucket(
        "2026-09", title_bucket("ST001", ("WGS Illumina NovaSeq X bam", 3)),
        day=day)]}

    assert notification_status.collect_release_counts(tree) == {
        ("ST001", "WGS Illumina NovaSeq X bam"): 3
    }


def test_collect_release_counts_sums_across_date_buckets():
    # A title released in two different months is one line in the email, not
    # two, so the counts have to be added rather than overwritten.
    tree = {"items": [
        month_bucket("2026-09",
                     title_bucket("ST001", ("WGS Illumina NovaSeq X bam", 3))),
        month_bucket("2026-08",
                     title_bucket("ST001", ("WGS Illumina NovaSeq X bam", 1))),
    ]}

    assert notification_status.collect_release_counts(tree) == {
        ("ST001", "WGS Illumina NovaSeq X bam"): 4
    }


def test_format_release_summary_orders_by_count():
    totals = {
        ("ST001", "WGS Illumina NovaSeq X bam"): 4,
        ("ST001", "Fiber-seq PacBio Revio bam"): 2,
        ("COLO829T", "RNA-seq Illumina NovaSeq X bam"): 3,
    }

    text = notification_status.format_release_summary(
        totals, "2026-08-01", "2026-09-01")

    heading = "Files Released Between 2026-08-01 and 2026-09-01"
    assert text == (
        f"{heading}\n{'-' * len(heading)}\n"
        "\n"
        "9 files released.\n"
        "\n"
        "ST001\n"
        "  - 4 WGS Illumina NovaSeq X bam\n"
        "  - 2 Fiber-seq PacBio Revio bam\n"
        "\n"
        "COLO829T\n"
        "  - 3 RNA-seq Illumina NovaSeq X bam"
    )
    # No trailing newline: the composer appends this with '\n\n' + text.
    assert not text.endswith("\n")


def test_format_release_summary_headline_matches_the_breakdown():
    # The operator reads the headline and the lines under it as one claim, so
    # the total is the sum of what is printed, never a separately sourced count.
    totals = {("ST001", "a bam"): 4, ("ST002", "b bam"): 7}

    text = notification_status.format_release_summary(
        totals, "2026-08-01", "2026-09-01")

    assert "11 files released." in text
    assert sum(int(line.split()[1]) for line in text.splitlines()
               if line.startswith("  - ")) == 11


def test_get_released_files_summary_requires_date_from(monkeypatch):
    summary = mock_release_summary(monkeypatch, {})
    request = fake_request(json_body={})

    response = notification_status.get_released_files_summary(None, request)

    assert response == {"error": "date_from is required"}
    summary.assert_not_called()


def test_get_released_files_summary_builds_text(monkeypatch):
    mock_release_summary(monkeypatch, {"items": [month_bucket(
        "2026-09", title_bucket("ST001", ("WGS Illumina NovaSeq X bam", 3)),
        day="2026-09-02")]})
    request = fake_request(
        json_body={"date_from": "2026-08-01", "date_to": "2026-10-01"})

    response = notification_status.get_released_files_summary(None, request)

    assert "Files Released Between 2026-08-01 and 2026-10-01" in response["text"]
    assert "3 files released." in response["text"]
    assert "  - 3 WGS Illumina NovaSeq X bam" in response["text"]


def test_get_released_files_summary_queries_a_bounded_window(monkeypatch):
    # Both ends, always: recent_files_summary defaults nmonths to 3, so a query
    # carrying only from_date caps the window at from_date + 3 months and
    # silently drops every file released after that.
    mock_release_summary(monkeypatch, {})
    make_search_subreq = notification_status.make_search_subreq
    request = fake_request(
        json_body={"date_from": "2020-01-01", "date_to": "2020-02-01"})

    notification_status.get_released_files_summary(None, request)

    path = make_search_subreq.call_args.args[1]
    assert "from_date=2020-01-01" in path
    # The caller's end date, not "today": the whole point of the second picker
    # is being able to summarize a month that has already ended.
    assert "thru_date=2020-02-01" in path


def test_get_released_files_summary_without_date_to_runs_through_today(
        monkeypatch):
    # Back-compat for a client that still sends only date_from.
    mock_release_summary(monkeypatch, {})
    make_search_subreq = notification_status.make_search_subreq
    request = fake_request(json_body={"date_from": "2020-01-01"})

    notification_status.get_released_files_summary(None, request)

    today = datetime.now(timezone.utc).date().isoformat()
    assert f"thru_date={today}" in make_search_subreq.call_args.args[1]


def test_get_released_files_summary_handles_empty_result(monkeypatch):
    mock_release_summary(monkeypatch, {})
    request = fake_request(
        json_body={"date_from": "2026-08-01", "date_to": "2026-09-01"})

    response = notification_status.get_released_files_summary(None, request)

    assert response == {
        "text": "No files were released between 2026-08-01 and 2026-09-01."
    }


def test_get_released_files_summary_reports_failure(monkeypatch):
    mock_release_summary(monkeypatch, {})
    monkeypatch.setattr(
        notification_status,
        "recent_files_summary",
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
