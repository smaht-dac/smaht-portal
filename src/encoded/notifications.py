"""Data-release email notification enrollment views."""

import logging
import os
from typing import Any, Dict, Optional

from boto3 import client as boto_client
from botocore.exceptions import BotoCoreError, ClientError
from dcicutils.secrets_utils import assume_identity
from pyramid.httpexceptions import (
    HTTPBadGateway,
    HTTPServiceUnavailable,
    HTTPUnauthorized,
    HTTPUnprocessableEntity,
)
from pyramid.security import Authenticated, NO_PERMISSION_REQUIRED
from pyramid.view import view_config
from snovault import COLLECTIONS
from snovault.crud_views import update_item


log = logging.getLogger(__name__)


# The GAC key follows the existing all-caps identity convention. The lower-case
# registry key matches Pyramid's settings/registry conventions in this project.
SNS_TOPIC_GAC_KEY = "SNS_TOPIC"
SNS_TOPIC_REGISTRY_KEY = "sns_topic"
DATA_RELEASE_NOTIFICATION_ENROLLED = "data_release_notification_enrolled"
NOTIFICATION_AVAILABLE = "data_release_notifications_available"
PENDING_CONFIRMATION = "PendingConfirmation"


def includeme(config) -> None:
    configure_sns_topic(config)
    config.add_route(
        "data-release-notification-availability",
        "/health/data-release-notifications",
    )
    config.add_route("register-notification", "/register_notification")
    config.add_route("deregister-notification", "/deregister_notification")
    config.scan(__name__)


def configure_sns_topic(config) -> None:
    """Record the optional data-release SNS topic in the application registry."""
    topic = config.registry.settings.get(SNS_TOPIC_REGISTRY_KEY)
    if not topic and "IDENTITY" in os.environ:
        identity = assume_identity()
        topic = identity.get(SNS_TOPIC_GAC_KEY)
    if topic:
        if is_sns_topic_arn(topic):
            config.registry[SNS_TOPIC_REGISTRY_KEY] = topic
        else:
            log.error("Ignoring invalid SNS topic ARN in application configuration")


def is_sns_topic_arn(value: Any) -> bool:
    """Return whether ``value`` has the shape of an SNS topic ARN."""
    if not isinstance(value, str):
        return False
    parts = value.split(":")
    return (
        len(parts) == 6
        and parts[0] == "arn"
        and parts[1].startswith("aws")
        and parts[2] == "sns"
        and bool(parts[3])
        and parts[4].isdigit()
        and len(parts[4]) == 12
        and bool(parts[5])
    )


def notification_topic_available(registry) -> bool:
    return bool(registry.get(SNS_TOPIC_REGISTRY_KEY))


@view_config(
    route_name="data-release-notification-availability",
    request_method="GET",
    permission=NO_PERMISSION_REQUIRED,
)
def notification_availability(context, request) -> Dict[str, bool]:
    """Expose topic availability without making an AWS request."""
    request.response.cache_control.max_age = 300
    request.response.cache_control.public = True
    return {NOTIFICATION_AVAILABLE: notification_topic_available(request.registry)}


def authenticated_user(request):
    """Return the current user resource, never a caller-selected profile."""
    for principal in request.effective_principals:
        if principal.startswith("userid."):
            user_uuid = principal[len("userid.") :]
            try:
                return request.registry[COLLECTIONS]["user"][user_uuid]
            except KeyError as error:
                raise HTTPUnauthorized(title="Authenticated user profile not found") from error
    raise HTTPUnauthorized(title="A user profile is required")


def get_topic_or_raise(request) -> str:
    topic = request.registry.get(SNS_TOPIC_REGISTRY_KEY)
    if not topic:
        raise HTTPServiceUnavailable(
            title="Data-release email notifications are not available"
        )
    return topic


def get_user_email_or_raise(user) -> str:
    email = user.upgrade_properties().get("email")
    if not isinstance(email, str) or not email.strip():
        raise HTTPUnprocessableEntity(
            title="The authenticated user profile does not have an email address"
        )
    return email.strip().lower()


def update_enrollment_state(user, request, enrolled: bool) -> None:
    # Deliberately calls snovault's update_item directly: owners lack 'edit'
    # on their own User item (ONLY_OWNER_VIEW_PROFILE_ACL), and the write is
    # limited to existing properties plus one server-set boolean.
    properties = user.upgrade_properties().copy()
    properties[DATA_RELEASE_NOTIFICATION_ENROLLED] = enrolled
    update_item(user, request, properties)


def sns_error(operation: str, error: Exception) -> HTTPBadGateway:
    log.error("SNS %s failed: %s", operation, error.__class__.__name__)
    return HTTPBadGateway(
        title="AWS could not update the data-release email subscription"
    )


@view_config(
    route_name="register-notification",
    request_method="POST",
    effective_principals=Authenticated,
)
def register_notification(context, request) -> Dict[str, Any]:
    """Request an SNS email subscription for the authenticated user's email."""
    topic = get_topic_or_raise(request)
    user = authenticated_user(request)
    properties = user.upgrade_properties()
    if properties.get(DATA_RELEASE_NOTIFICATION_ENROLLED) is True:
        return enrollment_response(enrolled=True, changed=False)

    email = get_user_email_or_raise(user)
    try:
        boto_client("sns").subscribe(
            TopicArn=topic,
            Protocol="email",
            Endpoint=email,
            ReturnSubscriptionArn=True,
        )
    except (BotoCoreError, ClientError) as error:
        raise sns_error("subscribe", error) from error

    update_enrollment_state(user, request, enrolled=True)
    return enrollment_response(enrolled=True, changed=True)


def enrollment_response(*, enrolled: bool, changed: bool) -> Dict[str, Any]:
    return {
        "status": "success",
        DATA_RELEASE_NOTIFICATION_ENROLLED: enrolled,
        "changed": changed,
    }


def find_subscription_arn(sns_client, topic: str, email: str) -> Optional[str]:
    """Find the confirmed subscription ARN for an email, following pagination."""
    next_token = None
    while True:
        request: Dict[str, str] = {"TopicArn": topic}
        if next_token:
            request["NextToken"] = next_token
        response = sns_client.list_subscriptions_by_topic(**request)
        for subscription in response.get("Subscriptions", []):
            endpoint = subscription.get("Endpoint")
            if (
                subscription.get("Protocol") == "email"
                and isinstance(endpoint, str)
                and endpoint.casefold() == email.casefold()
            ):
                subscription_arn = subscription.get("SubscriptionArn")
                if subscription_arn and subscription_arn != PENDING_CONFIRMATION:
                    return subscription_arn
        next_token = response.get("NextToken")
        if not next_token:
            return None


@view_config(
    route_name="deregister-notification",
    request_method="POST",
    effective_principals=Authenticated,
)
def deregister_notification(context, request) -> Dict[str, Any]:
    """Remove the authenticated user's SNS subscription, if it exists."""
    topic = get_topic_or_raise(request)
    user = authenticated_user(request)
    properties = user.upgrade_properties()
    if properties.get(DATA_RELEASE_NOTIFICATION_ENROLLED) is not True:
        return enrollment_response(enrolled=False, changed=False)

    email = get_user_email_or_raise(user)
    try:
        sns_client = boto_client("sns")
        subscription_arn = find_subscription_arn(sns_client, topic, email)
        if subscription_arn:
            sns_client.unsubscribe(SubscriptionArn=subscription_arn)
    except (BotoCoreError, ClientError) as error:
        raise sns_error("unsubscribe", error) from error

    # No confirmed subscription is an idempotent success (including a request
    # still awaiting confirmation); there is then no active delivery to stop.
    update_enrollment_state(user, request, enrolled=False)
    return enrollment_response(enrolled=False, changed=True)
