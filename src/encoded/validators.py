from pyramid.view import view_config
from snovault.util import debug_log
from encoded.types.submitted_item import validate_submitted_id


def includeme(config):
    config.add_route("validators", "/validators/{validator}")
    config.scan(__name__)


def _validators_submitted_id(context, request):
    if submitted_id := request.GET.get("value"):
        # Note that passing submission_centers (the known/valid set of submission-center names, e.g. smaht_dac)
        # is done for more control and for performance so we don't have to get the set of submission centers here.
        if submission_centers := request.GET.get("submission_centers"):
            submission_centers = [item.strip() for item in submission_centers.split(",")]
        else:
            submission_centers = _get_submission_centers(request)
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


def _get_submission_centers(request):
    result = []
    # TODO: Do we need an as_user="INGESTION" argument or something with the request.embed call below?
    if submission_centers := request.embed("/submission-centers"):
        for item in submission_centers.get("@graph"):
            if submission_center := item.get("identifier"):
                if submission_center not in result:
                    result.append(submission_center)
    return result


@view_config(route_name="validators", request_method=["GET"])
@debug_log
def validators(context, request):
    if value := request.matchdict.get("validator"):
        if validator := _VALIDATORS.get(value):
            return validator(context, request)
    return {}
