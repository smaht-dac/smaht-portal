import json
from datetime import datetime, timezone

from pyramid.view import view_config
from snovault.embed import make_subrequest
from snovault.server_defaults_user import get_userid
from snovault.util import debug_log
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from urllib.parse import urlencode

MAX_NOTIFICATIONS = 50


def includeme(config):
    config.add_route("get_notification_status", "/get_notification_status/")
    config.add_route("get_released_files_markdown", "/get_released_files_markdown/")
    config.add_route("send_notification_email", "/send_notification_email/")
    config.scan(__name__)


@view_config(route_name="get_notification_status", request_method="POST")
@debug_log
def get_notification_status(context, request):
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
                "sent_by": item.get("sent_by"),
            }
            for item in search_res
        ]

        return {"email_notifications": email_notifications}
    except Exception as e:
        return {
            "error": f"Error when trying to get notification status: {e}",
        }


@view_config(route_name="get_released_files_markdown", request_method="POST")
@debug_log
def get_released_files_markdown(context, request):
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

        lines = [f"#### Files Released Since {date_from}", ""]
        for f in files:
            accession = f.get("accession", f.get("uuid", "—"))
            title = f.get("display_title") or accession
            # release_date = (
            #     f.get("file_status_tracking", {})
            #     .get("release_dates", {})
            #     .get("initial_release_date", "—")
            # )
            # file_format = f.get("file_format", {}).get("display_title", "—")
            # lines.append(f"- **{title}** ({file_format}) — released {release_date}")
            lines.append(f"- {title}")

        markdown = "\n".join(lines)
        return {"markdown": markdown}
    except Exception as e:
        return {
            "error": f"Error when trying to get released files: {e}",
        }


@view_config(route_name="send_notification_email", request_method="POST")
@debug_log
def send_notification_email(context, request):
    try:
        body = request.json_body
        subject = body.get("subject")
        notification_body = body.get("body")
        notification_type = body.get("notification_type")
        send_to_all = body.get("send_to_all", False)

        if not subject:
            return {"error": "subject is required"}
        if not notification_body:
            return {"error": "body is required"}
        if not notification_type:
            return {"error": "notification_type is required"}

        if not send_to_all:
            return {"status": "ok", "send_to_all": False}

        user_uuid = get_userid()
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f+00:00")

        item_data = {
            "subject": subject,
            "body": notification_body,
            "notification_type": notification_type,
            "date_sent": now,
            "sent_by": user_uuid,
        }

        subreq = make_subrequest(
            request, "/email-notifications/", method="POST", inherit_user=True
        )
        subreq.body = json.dumps(item_data).encode("utf-8")
        subreq.content_type = "application/json"
        resp = request.invoke_subrequest(subreq, use_tweens=True)

        if resp.status_int >= 400:
            return {"error": f"Failed to create email notification: {resp.json_body}"}

        created = resp.json_body.get("@graph", [{}])[0]
        return {"status": "ok", "uuid": created.get("uuid"), "send_to_all": True}
    except Exception as e:
        return {
            "error": f"Error when trying to send notification email: {e}",
        }
