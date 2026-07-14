from types import SimpleNamespace
from unittest.mock import Mock, call

import pytest
from botocore.exceptions import ClientError
from pyramid.httpexceptions import (
    HTTPBadGateway,
    HTTPServiceUnavailable,
    HTTPUnauthorized,
    HTTPUnprocessableEntity,
)
from snovault import COLLECTIONS
from snovault.schema_utils import load_schema

from encoded import notifications


TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:smaht-data-releases"
SUBSCRIPTION_ARN = TOPIC_ARN + ":11111111-2222-3333-4444-555555555555"
USER_UUID = "11111111-1111-4111-8111-111111111111"


class FakeRegistry(dict):
    def __init__(self, settings=None):
        super().__init__()
        self.settings = settings or {}


class FakeUser:
    def __init__(self, *, enrolled=False, email="User@Example.org"):
        self.properties = {
            "email": email,
            notifications.DATA_RELEASE_NOTIFICATION_ENROLLED: enrolled,
        }

    def upgrade_properties(self):
        return self.properties


def fake_config(settings=None):
    return SimpleNamespace(registry=FakeRegistry(settings))


def fake_request(*, enrolled=False, email="User@Example.org", topic=TOPIC_ARN):
    user = FakeUser(enrolled=enrolled, email=email)
    registry = FakeRegistry()
    if topic:
        registry[notifications.SNS_TOPIC_REGISTRY_KEY] = topic
    registry[COLLECTIONS] = {"user": {USER_UUID: user}}
    request = SimpleNamespace(
        effective_principals=["system.Authenticated", f"userid.{USER_UUID}"],
        json={"email": "caller-supplied@example.org"},
        registry=registry,
        response=SimpleNamespace(
            cache_control=SimpleNamespace(max_age=None, public=False)
        ),
    )
    return request, user


def mock_profile_update(monkeypatch):
    update_item = Mock()

    def apply_update(user, request, properties):
        user.properties = properties

    update_item.side_effect = apply_update
    monkeypatch.setattr(notifications, "update_item", update_item)
    return update_item


def mock_sns(monkeypatch):
    sns_client = Mock()
    sns_client.subscribe.return_value = {
        "SubscriptionArn": notifications.PENDING_CONFIRMATION
    }
    sns_client.list_subscriptions_by_topic.return_value = {"Subscriptions": []}
    boto_client = Mock(return_value=sns_client)
    monkeypatch.setattr(notifications, "boto_client", boto_client)
    return boto_client, sns_client


@pytest.mark.parametrize(
    "value,expected",
    [
        (TOPIC_ARN, True),
        ("arn:aws-us-gov:sns:us-gov-west-1:123456789012:releases", True),
        (None, False),
        ("", False),
        ("not-an-arn", False),
        (TOPIC_ARN + ":subscription", False),
        ("arn:aws:s3:us-east-1:123456789012:releases", False),
        ("arn:aws:sns:us-east-1:not-an-account:releases", False),
    ],
)
def test_is_sns_topic_arn(value, expected):
    assert notifications.is_sns_topic_arn(value) is expected


def test_includeme_registers_notification_routes(monkeypatch):
    config = Mock()
    monkeypatch.setattr(notifications, "configure_sns_topic", Mock())

    notifications.includeme(config)

    assert config.add_route.call_args_list == [
        call(
            "data-release-notification-availability",
            "/health/data-release-notifications",
        ),
        call("register-notification", "/register_notification"),
        call("deregister-notification", "/deregister_notification"),
    ]
    config.scan.assert_called_once_with(notifications.__name__)


def test_user_profile_exposes_enrollment_flag():
    from encoded.types.user import USER_PAGE_VIEW_ATTRIBUTES

    enrollment_schema = load_schema("encoded:schemas/user.json")["properties"][
        notifications.DATA_RELEASE_NOTIFICATION_ENROLLED
    ]

    assert enrollment_schema["type"] == "boolean"
    assert enrollment_schema["default"] is False
    assert (
        notifications.DATA_RELEASE_NOTIFICATION_ENROLLED
        in USER_PAGE_VIEW_ATTRIBUTES
    )


def test_configure_sns_topic_from_settings(monkeypatch):
    monkeypatch.delenv("IDENTITY", raising=False)
    config = fake_config({notifications.SNS_TOPIC_REGISTRY_KEY: TOPIC_ARN})

    notifications.configure_sns_topic(config)

    assert config.registry[notifications.SNS_TOPIC_REGISTRY_KEY] == TOPIC_ARN


def test_configure_sns_topic_from_gac(monkeypatch):
    monkeypatch.setenv("IDENTITY", "smaht/test-gac")
    assume_identity = Mock(return_value={notifications.SNS_TOPIC_GAC_KEY: TOPIC_ARN})
    monkeypatch.setattr(notifications, "assume_identity", assume_identity)
    config = fake_config()

    notifications.configure_sns_topic(config)

    assume_identity.assert_called_once_with()
    assert config.registry[notifications.SNS_TOPIC_REGISTRY_KEY] == TOPIC_ARN


def test_configure_sns_topic_ignores_missing_or_invalid_gac_value(monkeypatch):
    monkeypatch.setenv("IDENTITY", "smaht/test-gac")
    assume_identity = Mock(
        side_effect=[{}, {notifications.SNS_TOPIC_GAC_KEY: "not-an-arn"}]
    )
    monkeypatch.setattr(notifications, "assume_identity", assume_identity)

    missing_config = fake_config()
    notifications.configure_sns_topic(missing_config)
    invalid_config = fake_config()
    notifications.configure_sns_topic(invalid_config)

    assert notifications.SNS_TOPIC_REGISTRY_KEY not in missing_config.registry
    assert notifications.SNS_TOPIC_REGISTRY_KEY not in invalid_config.registry


@pytest.mark.parametrize("topic,expected", [(None, False), (TOPIC_ARN, True)])
def test_notification_availability_route(topic, expected):
    request, _ = fake_request(topic=topic)

    response = notifications.notification_availability(None, request)

    assert response == {notifications.NOTIFICATION_AVAILABLE: expected}
    assert request.response.cache_control.max_age == 300
    assert request.response.cache_control.public is True


@pytest.mark.parametrize(
    "principals",
    [[], ["system.Authenticated"], ["system.Authenticated", "userid.unknown"]],
)
def test_authenticated_user_rejects_missing_profile(principals):
    request, _ = fake_request()
    request.effective_principals = principals

    with pytest.raises(HTTPUnauthorized):
        notifications.authenticated_user(request)


@pytest.mark.parametrize(
    "view", [notifications.register_notification, notifications.deregister_notification]
)
def test_notification_routes_reject_missing_topic(view, monkeypatch):
    request, _ = fake_request(topic=None)
    boto_client = Mock()
    monkeypatch.setattr(notifications, "boto_client", boto_client)

    with pytest.raises(HTTPServiceUnavailable):
        view(None, request)

    boto_client.assert_not_called()


def test_register_notification_requires_profile_email(monkeypatch):
    request, _ = fake_request(email="  ")
    boto_client = Mock()
    monkeypatch.setattr(notifications, "boto_client", boto_client)

    with pytest.raises(HTTPUnprocessableEntity):
        notifications.register_notification(None, request)

    boto_client.assert_not_called()


def test_register_notification_subscribes_and_updates_profile(monkeypatch):
    request, user = fake_request()
    update_item = mock_profile_update(monkeypatch)
    boto_client, sns_client = mock_sns(monkeypatch)

    response = notifications.register_notification(None, request)

    assert response == {
        "status": "success",
        notifications.DATA_RELEASE_NOTIFICATION_ENROLLED: True,
        "changed": True,
    }
    boto_client.assert_called_once_with("sns")
    sns_client.subscribe.assert_called_once_with(
        TopicArn=TOPIC_ARN,
        Protocol="email",
        Endpoint="user@example.org",
        ReturnSubscriptionArn=True,
    )
    assert user.properties[notifications.DATA_RELEASE_NOTIFICATION_ENROLLED] is True
    update_item.assert_called_once_with(user, request, user.properties)

    idempotent = notifications.register_notification(None, request)
    assert idempotent["changed"] is False
    sns_client.subscribe.assert_called_once()


def test_register_notification_aws_error_preserves_profile(monkeypatch):
    request, user = fake_request()
    update_item = mock_profile_update(monkeypatch)
    _, sns_client = mock_sns(monkeypatch)
    sns_client.subscribe.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "AWS failure"}},
        "Subscribe",
    )

    with pytest.raises(HTTPBadGateway) as error:
        notifications.register_notification(None, request)

    assert "AWS could not update" in error.value.title
    assert user.properties[notifications.DATA_RELEASE_NOTIFICATION_ENROLLED] is False
    update_item.assert_not_called()


def test_deregister_notification_unsubscribes_and_updates_profile(monkeypatch):
    request, user = fake_request(enrolled=True)
    update_item = mock_profile_update(monkeypatch)
    boto_client, sns_client = mock_sns(monkeypatch)
    sns_client.list_subscriptions_by_topic.return_value = {
        "Subscriptions": [
            {
                "Protocol": "email",
                "Endpoint": "USER@EXAMPLE.ORG",
                "SubscriptionArn": SUBSCRIPTION_ARN,
            }
        ]
    }

    response = notifications.deregister_notification(None, request)

    assert response == {
        "status": "success",
        notifications.DATA_RELEASE_NOTIFICATION_ENROLLED: False,
        "changed": True,
    }
    boto_client.assert_called_once_with("sns")
    sns_client.list_subscriptions_by_topic.assert_called_once_with(
        TopicArn=TOPIC_ARN
    )
    sns_client.unsubscribe.assert_called_once_with(SubscriptionArn=SUBSCRIPTION_ARN)
    assert user.properties[notifications.DATA_RELEASE_NOTIFICATION_ENROLLED] is False
    update_item.assert_called_once_with(user, request, user.properties)

    boto_client.reset_mock()
    idempotent = notifications.deregister_notification(None, request)
    assert idempotent["changed"] is False
    boto_client.assert_not_called()


@pytest.mark.parametrize(
    "subscriptions",
    [
        [],
        [
            {
                "Protocol": "email",
                "Endpoint": "someone-else@example.org",
                "SubscriptionArn": SUBSCRIPTION_ARN,
            }
        ],
        [
            {
                "Protocol": "email",
                "Endpoint": "user@example.org",
                "SubscriptionArn": notifications.PENDING_CONFIRMATION,
            }
        ],
    ],
)
def test_deregister_notification_without_active_subscription_is_idempotent(
    subscriptions, monkeypatch
):
    request, user = fake_request(enrolled=True)
    mock_profile_update(monkeypatch)
    _, sns_client = mock_sns(monkeypatch)
    sns_client.list_subscriptions_by_topic.return_value = {
        "Subscriptions": subscriptions
    }

    response = notifications.deregister_notification(None, request)

    assert response[notifications.DATA_RELEASE_NOTIFICATION_ENROLLED] is False
    sns_client.unsubscribe.assert_not_called()
    assert user.properties[notifications.DATA_RELEASE_NOTIFICATION_ENROLLED] is False


@pytest.mark.parametrize("failed_operation", ["list", "unsubscribe"])
def test_deregister_notification_aws_error_preserves_profile(
    failed_operation, monkeypatch
):
    request, user = fake_request(enrolled=True)
    update_item = mock_profile_update(monkeypatch)
    _, sns_client = mock_sns(monkeypatch)
    error = ClientError(
        {"Error": {"Code": "InternalError", "Message": "AWS failure"}},
        "Unsubscribe",
    )
    if failed_operation == "list":
        sns_client.list_subscriptions_by_topic.side_effect = error
    else:
        sns_client.list_subscriptions_by_topic.return_value = {
            "Subscriptions": [
                {
                    "Protocol": "email",
                    "Endpoint": "user@example.org",
                    "SubscriptionArn": SUBSCRIPTION_ARN,
                }
            ]
        }
        sns_client.unsubscribe.side_effect = error

    with pytest.raises(HTTPBadGateway) as raised_error:
        notifications.deregister_notification(None, request)

    assert "AWS could not update" in raised_error.value.title
    assert user.properties[notifications.DATA_RELEASE_NOTIFICATION_ENROLLED] is True
    update_item.assert_not_called()


def test_find_subscription_arn_follows_pagination():
    sns_client = Mock()
    sns_client.list_subscriptions_by_topic.side_effect = [
        {"Subscriptions": [], "NextToken": "page-two"},
        {
            "Subscriptions": [
                {
                    "Protocol": "email",
                    "Endpoint": "USER@EXAMPLE.ORG",
                    "SubscriptionArn": SUBSCRIPTION_ARN,
                }
            ]
        },
    ]

    result = notifications.find_subscription_arn(
        sns_client, TOPIC_ARN, "user@example.org"
    )

    assert result == SUBSCRIPTION_ARN
    assert sns_client.list_subscriptions_by_topic.call_args_list == [
        call(TopicArn=TOPIC_ARN),
        call(TopicArn=TOPIC_ARN, NextToken="page-two"),
    ]
