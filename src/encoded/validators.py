from pyramid.view import view_config
from snovault.util import debug_log
from encoded.types.submitted_item import validate_submitted_id


def includeme(config):
    config.add_route("validators", "/validators/{validator}")
    config.scan(__name__)


def _validators_submitted_id(context, request):
    if (submitted_id := request.GET.get("value")) and (submission_centers := request.GET.get("submission_centers")):
        # Note that passing submission_centers (the known/valid set of submission-center names, e.g. smaht_dac)
        # is done for more control and for performance so we don't have to get the set of submission centers here.
        submission_centers = [item.strip() for item in submission_centers.split(",")]
        result = validate_submitted_id(request, submitted_id=submitted_id, submission_centers=submission_centers)
        if result is None:
            status = "OK"
        elif (isinstance(error_detail := result.detail, dict) and 
              isinstance(error_description := error_detail.get("description"), str)):
            status = error_description
        else:
            status = str(result)
        return {"submitted_id": submitted_id, "status": status}
    return {}


_VALIDATORS = {
    "submitted_id": _validators_submitted_id
}


@view_config(route_name="validators", request_method=["GET"])
@debug_log
def validators(context, request):
    if value := request.matchdict.get("validator"):
        if validator := _VALIDATORS.get(value):
            return validator(context, request)
    return {}
